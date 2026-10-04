import type { Assessment, NearbyStation } from "./flood-types";

export type RainPeriod = "1h" | "24h";
// Display references match the unchanged assessment thresholds.
export const RAIN_THRESHOLDS = {
  "1h": { watch: 25.1, priority: 50.1, label: "1 ชั่วโมง" },
  "24h": { watch: 35.1, priority: 90.1, label: "24 ชั่วโมง" },
};

export function representativeRain(assessment: Assessment) {
  return (assessment.trigger?.kind === "rain" ? assessment.trigger : undefined) ??
    assessment.rain.find(s => s.fresh && (s.value !== null || s.rain1h !== null)) ?? assessment.rain[0];
}

export function initialRainPeriod(station: Pick<NearbyStation, "fresh" | "value" | "rain1h"> | undefined): RainPeriod {
  if (!station?.fresh) return "1h";
  const score = (value: number | null, period: RainPeriod) => {
    if (value === null || !Number.isFinite(value) || value < 0) return -1;
    const thresholds = RAIN_THRESHOLDS[period];
    return value >= thresholds.priority ? 2 : value >= thresholds.watch ? 1 : 0;
  };
  return score(station.value, "24h") > score(station.rain1h, "1h") ? "24h" : "1h";
}

export function mapPadding(width: number, height: number, inspectorWidth = 0) {
  const inset = Math.min(48, Math.max(24, width * 0.06));
  return { top: 130, bottom: Math.min(150, height * 0.22), left: inset,
    right: inspectorWidth ? Math.min(inspectorWidth + 40, width * 0.46) : inset };
}
