export type Risk = "priority" | "watch" | "normal" | "unknown";
export interface Project {
  id: string;
  slug: string;
  name: string;
  code: string;
  brand: string;
  lat: number | null;
  lng: number | null;
  address: string;
  province: string | null;
  region: string | null;
  zone: string | null;
  salesStatus: string;
}
export interface Station {
  id: string;
  kind: "water" | "rain";
  name: string;
  lat: number;
  lng: number;
  province: string;
  value: number | null;
  rain1h: number | null;
  bank: number | null;
  status: number | null;
  observedAt: string | null;
  source: string;
}
export interface SourceHealth {
  id: string;
  name: string;
  url: string;
  state: "ok" | "error";
  fetchedAt: string;
  count: number;
  error?: string;
}
export interface Warning {
  title: string;
  issuedAt: string | null;
  url: string;
  area?: string;
  documentUrl?: string;
}
export interface Feed {
  stations: Station[];
  sources: SourceHealth[];
  fetchedAt: string;
  warning: Warning | null;
}
export interface NearbyStation extends Station {
  distance: number;
  fresh: boolean;
}
export interface Assessment {
  project: Project;
  risk: Risk;
  water: NearbyStation[];
  rain: NearbyStation[];
  reason: string;
  coverage: "complete" | "partial" | "none";
  trigger?: NearbyStation;
}
export const RISK_LABEL: Record<Risk, string> = {
  priority: "ควรตรวจสอบเร่งด่วน",
  watch: "ควรเฝ้าระวัง",
  normal: "ยังไม่พบสัญญาณสูง",
  unknown: "ข้อมูลไม่เพียงพอ",
};
export const RISK_COLOR: Record<Risk, string> = {
  priority: "#d6293e",
  watch: "#a65e00",
  normal: "#087c61",
  unknown: "#586b82",
};
export const RISK_ORDER: Record<Risk, number> = {
  priority: 0,
  watch: 1,
  unknown: 2,
  normal: 3,
};
