export interface ViewState { q: string; region: string; province: string; brand: string; risk: string; radius: string; view: string; project: string | null }
export function readViewState(search: string): ViewState {
  const params = new URLSearchParams(search);
  const allowed = (key: string, values: string[], fallback: string) => { const value = params.get(key); return value && values.includes(value) ? value : fallback; };
  return { q: (params.get("q") ?? "").slice(0, 200), region: params.get("region") ?? "all", province: params.get("province") ?? "all", brand: params.get("brand") ?? "all", risk: allowed("risk", ["all", "attention", "priority", "watch", "normal", "unknown"], "all"), radius: allowed("radius", ["5", "10", "20"], "5"), view: allowed("view", ["executive", "map", "list"], "executive"), project: params.get("project") || null };
}
export function writeViewState(state: ViewState): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) {
    if (!value || (["region", "province", "brand", "risk"].includes(key) && value === "all") || (key === "radius" && value === "5") || (key === "view" && value === "executive")) continue;
    params.set(key, value);
  }
  return params.toString();
}
