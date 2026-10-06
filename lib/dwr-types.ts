export interface DwrStation {
  id: string;
  code: string;
  name: string;
  province: string;
  district: string;
  subdistrict: string;
  lat: number;
  lng: number;
  kind: "rain" | "water";
  reportAt: string | null;
  reportTimeKind: "observation" | "warning";
  alertStatus: 0 | 1 | 2 | 3 | 9 | null;
  alertIssuedAt: string | null;
  warningType: "rain" | "water" | null;
  rain15m: number | null;
  rain12h: number | null;
  rainDaily07: number | null;
  waterLevel: number | null;
  sourceUrl: string;
}
