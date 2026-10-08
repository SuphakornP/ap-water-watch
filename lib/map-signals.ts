import type { Station, Risk, Assessment } from "./flood-types";
import { isFresh, distanceKm, waterRisk } from "./assessment.ts";

export function stationRisk(s: Station, now = Date.now()): Risk {
  if (!isFresh(s.observedAt, now)) return "unknown";
  if (s.kind === "water") return waterRisk(s);
  if (s.value === null && s.rain1h === null) return "unknown";
  if (
    (s.value !== null && s.value >= 90.1) ||
    (s.rain1h !== null && s.rain1h >= 50.1)
  )
    return "priority";
  if (
    (s.value !== null && s.value >= 35.1) ||
    (s.rain1h !== null && s.rain1h >= 25.1)
  )
    return "watch";
  return s.value !== null && s.rain1h !== null ? "normal" : "unknown";
}

// A tour represents distinct project areas, never an inferred flood route.
export function tourProjects(items: Assessment[]): Assessment[] {
  const chosen: Assessment[] = [];
  for (const a of items.filter(
    (a) => a.risk === "priority" || a.risk === "watch",
  )) {
    const p = a.project;
    if (p.lat === null || p.lng === null) continue;
    if (
      chosen.every(
        (b) => distanceKm(p.lat!, p.lng!, b.project.lat!, b.project.lng!) > 2,
      )
    )
      chosen.push(a);
    if (chosen.length === 8) break;
  }
  return chosen;
}
