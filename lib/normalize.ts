import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { Station, Warning } from "./flood-types";
export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function text(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : typeof value === "number"
      ? String(value)
      : "";
}
export function numberValue(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    (typeof value === "string" && !value.trim())
  )
    return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const n = Number(value);
  return Number.isFinite(n) && n !== -999 && Math.abs(n) < 9999 ? n : null;
}
export function timestamp(value: unknown): string | null {
  const v = text(value);
  if (!v) return null;
  const shape =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;
  const match = v.match(shape);
  if (!match) return null;
  const [, y, m, d, h, minute, second] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(m) - 1 ||
    date.getUTCDate() !== Number(d) ||
    Number(h) > 23 ||
    Number(minute) > 59 ||
    Number(second ?? 0) > 59
  )
    return null;
  const normalized = v.replace(" ", "T") + (match[7] ? "" : "+07:00");
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
function localized(value: unknown): string {
  const v = object(value);
  return text(v.th) || text(v.en);
}
export function normalizeStations(
  payload: unknown,
  kind: "water" | "rain",
): Station[] {
  const root = object(payload);
  if (root.result !== "OK" || !Array.isArray(root.data))
    throw new Error("ต้นทางไม่ส่งชุดข้อมูลที่สมบูรณ์");
  const byId = new Map<string, Station>();
  for (const raw of root.data) {
    const item = object(raw),
      station = object(item.station),
      geo = object(item.geocode),
      agency = object(item.agency);
    const lat = numberValue(station.tele_station_lat),
      lng = numberValue(station.tele_station_long);
    if (
      lat === null ||
      lng === null ||
      lat < 5 ||
      lat > 21 ||
      lng < 97 ||
      lng > 107
    )
      continue;
    const code =
      text(station.id) || text(station.tele_station_oldcode) || `${lat},${lng}`;
    const providerCode = text(object(agency.agency_shortname).en).toUpperCase();
    const providerStationCode = text(station.tele_station_oldcode);
    const rawStatus = numberValue(item.situation_level),
      status =
        rawStatus !== null &&
        Number.isInteger(rawStatus) &&
        rawStatus >= 1 &&
        rawStatus <= 5
          ? rawStatus
          : null;
    let value = numberValue(
      kind === "water" ? item.waterlevel_msl : item.rain_24h,
    );
    if (kind === "rain" && value !== null && (value < 0 || value > 2000))
      value = null;
    const hourly = kind === "rain" ? numberValue(item.rain_1h) : null;
    const entry: Station = {
      id: `${kind}-${code}`,
      kind,
      name: localized(station.tele_station_name) || code,
      lat,
      lng,
      province: localized(geo.province_name) || "ไม่ระบุจังหวัด",
      value,
      rain1h: hourly !== null && hourly >= 0 && hourly <= 500 ? hourly : null,
      bank:
        kind === "water" && status !== null
          ? numberValue(station.min_bank)
          : null,
      status: kind === "water" ? status : null,
      observedAt: timestamp(
        kind === "water" ? item.waterlevel_datetime : item.rainfall_datetime,
      ),
      source: localized(agency.agency_shortname) || "ThaiWater",
      ...(providerCode ? { providerCode } : {}),
      ...(providerStationCode ? { providerStationCode } : {}),
    };
    const existing = byId.get(entry.id);
    if (
      !existing ||
      (Date.parse(entry.observedAt ?? "") || 0) >
        (Date.parse(existing.observedAt ?? "") || 0)
    )
      byId.set(entry.id, entry);
  }
  return [...byId.values()];
}
export function normalizeWarning(payload: unknown): Warning | null {
  const root = object(payload);
  const header = object(root.header);
  if (!/^200(?:\s|$)/.test(text(header.status)))
    throw new Error("ต้นทาง TMD ไม่ยืนยันการส่งข้อมูลสำเร็จ");
  const warning = object(root.Warning);
  if (!Object.keys(warning).length) return null;
  const title = text(warning.TitleThai) || text(warning.HeadlineThai);
  if (!title) return null;
  const rawUrl = text(warning.WebUrlThai);
  let url = "https://www.tmd.go.th/warning-and-events/warning-storm";
  try {
    const parsed = new URL(rawUrl);
    if (
      parsed.protocol === "https:" &&
      (parsed.hostname === "tmd.go.th" ||
        parsed.hostname.endsWith(".tmd.go.th"))
    )
      url = parsed.href;
  } catch {
    /* A malformed upstream link uses the official warning index. */
  }
  return { title, issuedAt: timestamp(warning.AnnounceDate), url };
}

export function capDocumentLink(xml: string): string | null {
  const channel = object(object(parseXml(xml).rss).channel);
  if (!text(channel.title)) throw new Error("รูปแบบ CAP feed ไม่ถูกต้อง");
  const raw = channel.item;
  if (raw === undefined) return null;
  const first = object(Array.isArray(raw) ? raw[0] : raw);
  const link = text(first.link);
  if (
    !/^https:\/\/(?:www\.|www5\.)?tmd\.go\.th\/uploads\/CAP\/[A-Za-z0-9_-]+\.xml$/.test(
      link,
    )
  )
    throw new Error("ลิงก์ประกาศไม่ใช่เอกสาร CAP ของ TMD");
  const url = new URL(link);
  url.hostname = "www5.tmd.go.th";
  return url.href;
}
function parseXml(xml: string): Record<string, unknown> {
  if (
    xml.length > 2_000_000 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    throw new Error("เอกสาร XML ไม่ถูกต้อง");
  const parsed: unknown = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
  }).parse(xml);
  return object(parsed);
}
export function normalizeCap(
  xml: string,
  url: string,
  now = Date.now(),
): Warning | null {
  const alert = object(parseXml(xml).alert);
  if (
    !text(alert.identifier) ||
    text(alert["@_xmlns"]) !== "urn:oasis:names:tc:emergency:cap:1.2"
  )
    throw new Error("ไม่ใช่ CAP alert ที่สมบูรณ์");
  if (
    alert.status !== "Actual" ||
    alert.scope !== "Public" ||
    !["Alert", "Update"].includes(text(alert.msgType))
  )
    return null;
  const infos = (Array.isArray(alert.info) ? alert.info : [alert.info]).map(
    object,
  );
  const info = infos.find((i) => text(i.language).startsWith("th")) ?? infos[0];
  const sent = timestamp(alert.sent),
    effective = timestamp(info?.effective),
    expires = timestamp(info?.expires);
  if (!sent || !effective || !expires)
    throw new Error("ประกาศ CAP ไม่มีช่วงเวลาที่ใช้ได้");
  if (Date.parse(effective) > now || Date.parse(expires) <= now) return null;
  const title = text(info.headline) || text(info.event);
  if (!title) throw new Error("ประกาศ CAP ไม่มีหัวข้อ");
  const area = (Array.isArray(info.area) ? info.area : [info.area])
    .map((a) => text(object(a).areaDesc))
    .filter(Boolean)
    .join(" · ");
  let pageUrl = url;
  const web = text(info.web);
  if (/^https:\/\/(?:www\.|www5\.)?tmd\.go\.th\//.test(web)) {
    const target = new URL(web);
    target.hostname = "www5.tmd.go.th";
    pageUrl = target.href;
  }
  return { title, issuedAt: sent, url: pageUrl, area, documentUrl: url };
}
