import type {
  Assessment,
  NearbyStation,
  Project,
  Risk,
  Station,
} from "./flood-types";
export const FRESHNESS_HOURS = 6;
export const DEFAULT_RADIUS_KM = 5;
export const WATER_OVERFLOW_PRIORITY_METERS = 0.10;

type WaterReading = Pick<Station, "value" | "bank" | "status">;

export function waterRisk(station: WaterReading): Risk {
  if (
    station.value === null || !Number.isFinite(station.value) ||
    station.status === null || !Number.isInteger(station.status) ||
    station.status < 1 || station.status > 5
  ) return "unknown";
  if (station.status === 5) {
    if (station.bank === null || !Number.isFinite(station.bank)) return "watch";
    const excess = station.value - station.bank;
    // Allow subtraction roundoff at exactly 10 cm, without rounding sub-threshold readings up.
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(station.value), Math.abs(station.bank)) * 4;
    return excess >= WATER_OVERFLOW_PRIORITY_METERS - tolerance ? "priority" : "watch";
  }
  return station.status === 4 ? "watch" : "normal";
}

export function waterSignalSummary(station: WaterReading): string {
  const risk = waterRisk(station);
  if (risk === "unknown") return "ข้อมูลสถานีน้ำไม่ครบสำหรับประเมิน";
  if (station.status === 5) {
    if (risk === "priority")
      return `สถานีรายงานน้ำล้นตลิ่งอย่างน้อย ${WATER_OVERFLOW_PRIORITY_METERS.toFixed(2)} ม. ต้องยืนยันผลต่อพื้นที่โครงการ`;
    if (station.bank !== null && Number.isFinite(station.bank) && station.value !== null && station.value > station.bank)
      return `สถานีรายงานน้ำล้นตลิ่ง แต่ส่วนต่างยังไม่ถึง ${WATER_OVERFLOW_PRIORITY_METERS.toFixed(2)} ม. ควรเฝ้าระวังและตรวจสภาพพื้นที่`;
    return "สถานีรายงานน้ำล้นตลิ่ง แต่ยังยืนยันส่วนต่างระดับน้ำกับตลิ่งไม่ได้ ควรเฝ้าระวังและตรวจสอบข้อมูล";
  }
  return station.status === 4
    ? "สถานีรายงานน้ำมาก ควรตรวจทางระบายและสภาพพื้นที่"
    : "สถานีน้ำที่มีค่าล่าสุดยังไม่รายงานน้ำมากหรือล้นตลิ่ง";
}
export function isFresh(timestamp: string | null, now = Date.now()): boolean {
  if (!timestamp) return false;
  const age = now - Date.parse(timestamp);
  return (
    Number.isFinite(age) &&
    age >= -15 * 60_000 &&
    age <= FRESHNESS_HOURS * 3_600_000
  );
}
export function distanceKm(
  lat: number,
  lng: number,
  otherLat: number,
  otherLng: number,
): number {
  const r = Math.PI / 180;
  const a =
    Math.sin(((otherLat - lat) * r) / 2) ** 2 +
    Math.cos(lat * r) *
      Math.cos(otherLat * r) *
      Math.sin(((otherLng - lng) * r) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
export function assessProject(
  project: Project,
  stations: Station[],
  radius = DEFAULT_RADIUS_KM,
  now = Date.now(),
): Assessment {
  if (project.lat === null || project.lng === null)
    return {
      project,
      risk: "unknown",
      water: [],
      rain: [],
      reason: "โครงการยังไม่มีพิกัดสำหรับจับคู่สถานี",
      coverage: "none",
    };
  const latitude = project.lat,
    longitude = project.lng;
  const nearby: NearbyStation[] = stations
    .filter(
      (s) =>
        Math.abs(s.lat - latitude) <= radius / 110 &&
        Math.abs(s.lng - longitude) <= radius / 100,
    )
    .map((s) => ({
      ...s,
      distance: distanceKm(latitude, longitude, s.lat, s.lng),
      fresh: isFresh(s.observedAt, now),
    }))
    .filter((s) => s.distance <= radius)
    .sort((a, b) => a.distance - b.distance);
  const water = nearby.filter((s) => s.kind === "water"),
    rain = nearby.filter((s) => s.kind === "rain");
  const validWater = water.filter(
    (s) => s.fresh && waterRisk(s) !== "unknown",
  );
  const validRain = rain.filter(
    (s) => s.fresh && (s.value !== null || s.rain1h !== null),
  );
  const coverage =
    validWater.length &&
    validRain.some((s) => s.value !== null && s.rain1h !== null)
      ? "complete"
      : validWater.length || validRain.length
        ? "partial"
        : "none";
  const overflow = validWater.find((s) => waterRisk(s) === "priority"),
    high = validWater.find((s) => s.status === 5 && waterRisk(s) === "watch") ??
      validWater.find((s) => s.status === 4);
  const extremeHourly = validRain.find(
      (s) => s.rain1h !== null && s.rain1h >= 50.1,
    ),
    heavyHourly = validRain.find((s) => s.rain1h !== null && s.rain1h >= 25.1);
  const extreme = validRain.find((s) => s.value !== null && s.value >= 90.1),
    heavy = validRain.find((s) => s.value !== null && s.value >= 35.1);
  if (overflow)
    return {
      project,
      risk: "priority",
      water,
      rain,
      coverage,
      trigger: overflow,
      reason: `${overflow.name} ห่าง ${overflow.distance.toFixed(1)} กม. · ${waterSignalSummary(overflow)}`,
    };
  if (extremeHourly)
    return {
      project,
      risk: "priority",
      water,
      rain,
      coverage,
      trigger: extremeHourly,
      reason: `ฝนหนักมาก ${extremeHourly.rain1h?.toFixed(1)} มม./1 ชม. ที่สถานีห่าง ${extremeHourly.distance.toFixed(1)} กม.`,
    };
  if (extreme)
    return {
      project,
      risk: "priority",
      water,
      rain,
      coverage,
      trigger: extreme,
      reason: `ฝนสะสม ${extreme.value?.toFixed(1)} มม./24 ชม. ที่สถานีห่าง ${extreme.distance.toFixed(1)} กม.`,
    };
  if (high)
    return {
      project,
      risk: "watch",
      water,
      rain,
      coverage,
      trigger: high,
      reason: `${high.name} ห่าง ${high.distance.toFixed(1)} กม. · ${waterSignalSummary(high)}`,
    };
  if (heavyHourly)
    return {
      project,
      risk: "watch",
      water,
      rain,
      coverage,
      trigger: heavyHourly,
      reason: `ฝนหนัก ${heavyHourly.rain1h?.toFixed(1)} มม./1 ชม. ที่สถานีห่าง ${heavyHourly.distance.toFixed(1)} กม.`,
    };
  if (heavy)
    return {
      project,
      risk: "watch",
      water,
      rain,
      coverage,
      trigger: heavy,
      reason: `ฝนสะสม ${heavy.value?.toFixed(1)} มม./24 ชม. ที่สถานีห่าง ${heavy.distance.toFixed(1)} กม.`,
    };
  if (
    coverage === "complete" &&
    validRain.some((s) => s.value !== null && s.rain1h !== null)
  )
    return {
      project,
      risk: "normal",
      water,
      rain,
      coverage,
      reason: `ค่าที่ใช้ได้จากสถานีน้ำและฝนในรัศมี ${radius} กม. ยังไม่เข้าเกณฑ์เฝ้าระวัง`,
    };
  return {
    project,
    risk: "unknown",
    water,
    rain,
    coverage,
    reason: nearby.length
      ? `ไม่มีค่าล่าสุดที่ใช้ประเมินได้ครบทั้งน้ำและฝนในรัศมี ${radius} กม.`
      : `ไม่พบสถานีน้ำหรือฝนในรัศมี ${radius} กม.`,
  };
}
export function bankMargin(station: Pick<NearbyStation, "fresh" | "status" | "bank" | "value"> | undefined): number | null {
  return station &&
    station.fresh &&
    station.status !== null &&
    station.bank !== null &&
    station.value !== null
    ? Number((station.bank - station.value).toFixed(2))
    : null;
}
export function representativeWater(a: Assessment): NearbyStation | undefined {
  return (
    a.water.find((s) => s.fresh && waterRisk(s) === "priority") ??
    a.water.find((s) => s.fresh && s.status === 5 && waterRisk(s) === "watch") ??
    a.water.find((s) => s.fresh && waterRisk(s) === "watch") ??
    a.water.find((s) => s.fresh && waterRisk(s) === "normal") ??
    a.water[0]
  );
}
