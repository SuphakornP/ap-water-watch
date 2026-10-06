import type { Assessment, Risk } from "./flood-types";

export const UNASSIGNED_PROVINCE = "ยังไม่ระบุจังหวัด";

export interface ProvinceSignals {
  province: string;
  total: number;
  unmapped: number;
  counts: Record<Risk, number>;
}

// These groups describe project signals within administrative areas, not flood zones.
export function provinceSignals(items: Assessment[]): ProvinceSignals[] {
  const zones = new Map<string, ProvinceSignals>();
  for (const { project, risk } of items) {
    const province = project.province ?? UNASSIGNED_PROVINCE;
    const zone = zones.get(province) ?? {
      province,
      total: 0,
      unmapped: 0,
      counts: { priority: 0, watch: 0, normal: 0, unknown: 0 },
    };
    zone.total += 1;
    zone.counts[risk] += 1;
    if (project.lat === null || project.lng === null) zone.unmapped += 1;
    zones.set(province, zone);
  }
  return [...zones.values()].sort((a, b) =>
    b.counts.priority - a.counts.priority ||
    b.counts.watch - a.counts.watch ||
    b.counts.unknown - a.counts.unknown ||
    b.total - a.total ||
    a.province.localeCompare(b.province, "th"),
  );
}
