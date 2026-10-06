import type { DwrStation } from "./dwr-types";
import { numberValue, object, text, timestamp } from "./normalize.ts";

export const DWR_SOURCE_URL = "https://ews.dwr.go.th/ews/index.php";
export const DWR_ENDPOINT = "https://ews.dwr.go.th/ews/web-service/stn";

function measurement(value: unknown, maximum: number): number | null {
  const numeric = numberValue(value);
  return numeric !== null && numeric >= 0 && numeric <= maximum
    ? numeric
    : null;
}

function reportTimestamp(value: unknown): string | null {
  const match = text(value).match(
    /^(\d{2})\/(\d{2})\/(\d{2}|25\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?(?:\s*น\.)?$/,
  );
  if (!match) return null;
  const [, day, month, buddhistYear, hour, minute, second = "00"] = match;
  const year =
    (buddhistYear.length === 2 ? 2500 : 0) + Number(buddhistYear) - 543;
  // Two upstream rows carry the Unix epoch as 01/01/13 BE, not a live reading.
  if (year < 2000 || year > 2100) return null;
  return timestamp(`${year}-${month}-${day}T${hour}:${minute}:${second}+07:00`);
}

function alertTimestamp(value: unknown): string | null {
  const parsed = timestamp(value);
  if (!parsed) return null;
  const year = new Date(parsed).getUTCFullYear();
  return year >= 2000 && year <= 2100 ? parsed : null;
}

function alertStatus(value: unknown): DwrStation["alertStatus"] {
  const status = numberValue(value);
  return status === 0 || status === 1 || status === 2 || status === 3 || status === 9
    ? status
    : null;
}

export function normalizeDwrStations(payload: unknown): DwrStation[] {
  if (!Array.isArray(payload) || payload.length === 0)
    throw new Error("ต้นทาง DWR ไม่ส่งชุดข้อมูลสถานีที่สมบูรณ์");

  const byCode = new Map<string, DwrStation>();
  for (const raw of payload) {
    const row = object(raw);
    const code = text(row.stn).toUpperCase();
    const type = text(row.stn_type).toUpperCase();
    const lat = numberValue(row.latitude);
    const lng = numberValue(row.longitude);
    if (
      !/^STN\d{4,6}$/.test(code) ||
      (type !== "RF" && type !== "WL") ||
      lat === null ||
      lng === null ||
      lat < 5 ||
      lat > 21 ||
      lng < 97 ||
      lng > 107
    )
      continue;

    const status = alertStatus(row.status);
    const warning = status === 1 || status === 2 || status === 3;
    const warningType = text(row.warning_type).toLowerCase();
    const entry: DwrStation = {
      id: `dwr:${code}`,
      code,
      name: text(row.name) || code,
      province: text(row.province) || "ไม่ระบุจังหวัด",
      district: text(row.amphoe),
      subdistrict: text(row.tambon),
      lat,
      lng,
      kind: type === "WL" ? "water" : "rain",
      reportAt: reportTimestamp(row.date),
      // Active alert rows contain measurements captured for the warning report.
      reportTimeKind: warning ? "warning" : "observation",
      alertStatus: status,
      alertIssuedAt: warning ? alertTimestamp(row.report_date) : null,
      warningType: warning
        ? warningType === "rain"
          ? "rain"
          : warningType === "wl"
            ? "water"
            : null
        : null,
      rain15m: measurement(row.rain, 500),
      rain12h: measurement(row.rain12h, 2000),
      rainDaily07: measurement(row.rain07h, 2000),
      waterLevel: type === "WL" ? measurement(row.wl, 1000) : null,
      sourceUrl: DWR_SOURCE_URL,
    };
    const existing = byCode.get(code);
    if (
      !existing ||
      (Date.parse(entry.reportAt ?? "") || 0) >
        (Date.parse(existing.reportAt ?? "") || 0)
    )
      byCode.set(code, entry);
  }
  if (byCode.size === 0)
    throw new Error("ต้นทาง DWR ไม่มีสถานีที่มีรหัสและพิกัดที่ตรวจสอบได้");
  return [...byCode.values()];
}
