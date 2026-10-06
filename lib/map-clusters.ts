import type { FeatureCollection, Point } from "geojson";
import { RISK_COLOR, RISK_ORDER, type Assessment, type Risk } from "./flood-types.ts";

export const CLUSTER_RISKS: Risk[] = ["priority", "watch", "unknown", "normal"];

export const PROJECT_CLUSTER_PROPERTIES: Record<string, [unknown, unknown]> = {
  priority: ["+", ["get", "priority"]],
  watch: ["+", ["get", "watch"]],
  unknown: ["+", ["get", "unknown"]],
  normal: ["+", ["get", "normal"]],
};

export function projectMapFeatures(items: Assessment[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: items.flatMap(({ project, risk }) => {
      if (project.lat === null || project.lng === null ||
        !Number.isFinite(project.lat) || !Number.isFinite(project.lng) ||
        Math.abs(project.lat) >= 85.051129 || Math.abs(project.lng) > 180) return [];
      return [{
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [project.lng, project.lat] },
        properties: {
          id: project.id, name: project.name, lat: project.lat, lng: project.lng,
          risk, color: RISK_COLOR[risk],
          priority: Number(risk === "priority"), watch: Number(risk === "watch"),
          unknown: Number(risk === "unknown"), normal: Number(risk === "normal"),
        },
      }];
    }),
  };
}

export function clusterMembers(items: Assessment[], ids: string[]) {
  const included = new Set(ids);
  const members = items.filter(item => included.has(item.project.id)).sort((a, b) =>
    RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || a.project.name.localeCompare(b.project.name, "th"));
  const counts: Record<Risk, number> = { priority: 0, watch: 0, unknown: 0, normal: 0 };
  for (const item of members) counts[item.risk]++;
  return { members, counts };
}
