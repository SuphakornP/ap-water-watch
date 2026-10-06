import { distanceKm, isFresh } from "./assessment.ts";
import { RISK_COLOR, type Project, type Station } from "./flood-types.ts";
import type { DwrStation } from "./dwr-types";

export type NearbyDwrStation = DwrStation & { distance: number; fresh: boolean };
export interface DwrStationLink {
  state: "matched" | "conflicting" | "directOnly";
  linkedThaiWaterId: string | null;
  candidateThaiWaterIds: string[];
  distanceKm: number | null;
}
export interface DwrStationMatches {
  links: Record<string, DwrStationLink>;
  stats: {
    total: number;
    matched: number;
    conflicting: number;
    directOnly: number;
    provinces: number;
  };
}

function validCoordinates(lat: number | null, lng: number | null): boolean {
  return lat !== null && lng !== null && Number.isFinite(lat) &&
    Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function nearbyDwrStations(
  project: Pick<Project, "lat" | "lng">,
  stations: DwrStation[],
  radius: number,
  now = Date.now(),
): NearbyDwrStation[] {
  if (!Number.isFinite(radius) || radius <= 0)
    throw new RangeError("DWR station radius must be a positive distance");
  const { lat, lng } = project;
  if (lat === null || lng === null || !validCoordinates(lat, lng)) return [];
  return stations
    .filter((station) => validCoordinates(station.lat, station.lng))
    .map((station) => ({
      ...station,
      distance: distanceKm(lat, lng, station.lat, station.lng),
      fresh: isFresh(station.reportAt, now),
    }))
    .filter((station) => station.distance <= radius)
    .sort((a, b) => a.distance - b.distance || a.code.localeCompare(b.code));
}

export function matchDwrStations(
  dwrStations: DwrStation[],
  thaiStations: Station[],
): DwrStationMatches {
  const thaiByCode = new Map<string, Station[]>();
  for (const station of thaiStations) {
    if (station.providerCode !== "DWR" || !station.providerStationCode ||
      !/^STN\d+$/.test(station.providerStationCode)) continue;
    const entries = thaiByCode.get(station.providerStationCode) ?? [];
    if (!entries.some((entry) => entry.id === station.id)) entries.push(station);
    thaiByCode.set(station.providerStationCode, entries);
  }
  const direct = [...new Map(dwrStations.map((station) => [station.id, station])).values()];
  const stats = {
    total: direct.length, matched: 0, conflicting: 0, directOnly: 0,
    provinces: new Set(direct.map((station) => station.province.trim())
      .filter((province) => province && province !== "ไม่ระบุจังหวัด")).size,
  };
  const pairs: [string, DwrStationLink][] = direct.map((station) => {
    const candidates = /^STN\d+$/.test(station.code) ? thaiByCode.get(station.code) ?? [] : [];
    const distances = candidates.map((candidate) => ({
      candidate,
      distance: validCoordinates(station.lat, station.lng) && validCoordinates(candidate.lat, candidate.lng)
        ? distanceKm(station.lat, station.lng, candidate.lat, candidate.lng)
        : null,
    })).sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    const nearest = distances[0];
    // Matching metadata links provenance only; it never merges differing rain periods or readings.
    const matched = nearest?.distance !== null && nearest?.distance !== undefined && nearest.distance <= 0.1;
    const state = matched ? "matched" : candidates.length ? "conflicting" : "directOnly";
    stats[state] += 1;
    return [station.id, {
      state,
      linkedThaiWaterId: matched ? nearest.candidate.id : null,
      candidateThaiWaterIds: candidates.map((candidate) => candidate.id),
      distanceKm: nearest?.distance ?? null,
    }];
  });
  return { links: Object.fromEntries(pairs), stats };
}

export function dwrStatusLabel(status: DwrStation["alertStatus"], fresh: boolean): string {
  const label = status === 0 ? "ไม่มีสถานะเตือนที่ออกจากต้นทาง"
    : status === 9 ? "มีฝน"
      : status === 1 ? "เฝ้าระวัง"
        : status === 2 ? "เตรียมพร้อม"
          : status === 3 ? "วิกฤติ"
            : "ไม่ทราบสถานะต้นทาง";
  return fresh ? label : `ข้อมูลเก่า · ${label}`;
}

export function dwrStatusColor(status: DwrStation["alertStatus"], fresh: boolean): string {
  if (!fresh) return RISK_COLOR.unknown;
  return status === 1 ? RISK_COLOR.watch
    : status === 2 ? "#c75a13"
      : status === 3 ? RISK_COLOR.priority
        : status === 9 ? "#1769e0"
          : RISK_COLOR.unknown;
}
