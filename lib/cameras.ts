import { distanceKm } from "./assessment.ts";
import type { Project } from "./flood-types";

export type CameraRadius = 5 | 10 | 20;
export interface PublicCamera {
  id: string;
  name: string;
  lat: number;
  lng: number;
  location: string;
  province: string;
  owner: string;
  sourceId: string;
  sourceUrl: string;
  sourceNote: string;
  availability: "unknown" | "offline";
  display: "link" | "snapshot";
}
export interface CameraSource {
  id: string;
  name: string;
  url: string;
  state: "ok" | "error";
  count: number;
  fetchedAt: string | null;
  note: string;
}
export interface CameraCatalog {
  cameras: PublicCamera[];
  sources: CameraSource[];
  fetchedAt: string;
}
export type NearbyCamera = PublicCamera & { distance: number };
export interface CameraSnapshot {
  cameraId: string;
  imageUrl: string | null;
  capturedAt: string | null;
  fetchedAt: string | null;
  checkedAt: string;
  state: "ok" | "offline" | "error" | "link";
  reused: boolean;
  message: string;
}
export const CAMERA_STALE_MS = 30 * 60_000;

export function failedSnapshot(cameraId: string, previous: CameraSnapshot | null, message: string, checkedAt = new Date().toISOString()): CameraSnapshot {
  const sameCamera = previous?.cameraId === cameraId ? previous : null;
  return { cameraId, imageUrl: sameCamera?.imageUrl ?? null, capturedAt: sameCamera?.capturedAt ?? null, fetchedAt: sameCamera?.fetchedAt ?? null, checkedAt, state: "error", reused: Boolean(sameCamera?.imageUrl), message };
}

export function nearbyCameras(project: Pick<Project, "lat" | "lng">, cameras: PublicCamera[], radius: CameraRadius = 5): NearbyCamera[] {
  if (project.lat === null || project.lng === null || !Number.isFinite(project.lat) || !Number.isFinite(project.lng)) return [];
  return cameras
    .filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lng) && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180)
    .map(c => ({ ...c, distance: distanceKm(project.lat!, project.lng!, c.lat, c.lng) }))
    .filter(c => c.distance <= radius)
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
}

export function snapshotFreshness(capturedAt: string | null, now = Date.now()): "unknown" | "stale" | "recent" {
  if (!capturedAt) return "unknown";
  const age = now - Date.parse(capturedAt);
  if (!Number.isFinite(age) || age < -5 * 60_000) return "unknown";
  return age > CAMERA_STALE_MS ? "stale" : "recent";
}

export function cameraImageState(snapshot: CameraSnapshot | null, now = Date.now()): string {
  if (!snapshot) return "ยังไม่ได้ดึงภาพ";
  if (snapshot.state === "link") return "ดูภาพที่ต้นทาง";
  const freshness = snapshotFreshness(snapshot.capturedAt, now);
  const parts = [];
  if (snapshot.state === "offline") parts.push("กล้องออฟไลน์");
  if (snapshot.state === "error") parts.push("โหลดภาพไม่สำเร็จ");
  if (snapshot.reused) parts.push("ภาพเดิมจากรอบก่อน");
  if (freshness === "stale") parts.push("ภาพเก่าเกิน 30 นาที");
  if (freshness === "unknown") parts.push("ไม่ทราบเวลาของภาพ");
  if (parts.length === 0) parts.push("ภาพล่าสุดที่ต้นทางส่งมา");
  return parts.join(" · ");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function thai(value: unknown): string {
  const text = record(value).th;
  return typeof text === "string" ? text.trim() : "";
}

// Public catalogue only. Active records do not prove that the camera is online.
// Raw camera URLs, legacy embed HTML and device interfaces are never forwarded.
export function normalizeThaiwaterCameras(payload: unknown): PublicCamera[] {
  const body = record(payload);
  if (body.result !== "OK" || !Array.isArray(body.data)) throw new Error("Invalid ThaiWater camera catalogue");
  const seen = new Set<string>();
  return body.data.flatMap(value => {
    const row = record(value), geo = record(row.geocode), agency = record(row.agency);
    const lat = Number(row.lat), lng = Number(row.long);
    if ((typeof row.id !== "number" && typeof row.id !== "string") || !row.title || typeof row.title !== "string" || row.lat == null || row.long == null || row.lat === "" || row.long === "" || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 5 || lat > 21 || lng < 97 || lng > 106) return [];
    const id = `thaiwater-${row.id}`;
    if (seen.has(id)) return [];
    seen.add(id);
    if (row.media_type !== "img" && row.media_type !== "url") return [];
    return [{ id, name: row.title.trim(), lat, lng, province: thai(geo.province_name), location: typeof row.description === "string" ? row.description : "", owner: thai(agency.agency_name) || "ไม่ระบุหน่วยงานเจ้าของ", sourceId: "thaiwater", sourceUrl: "https://www.thaiwater.net/water/cctv", sourceNote: "เปิดหน้ากล้อง ThaiWater แล้วค้นหาชื่อจุดนี้ · ยังไม่ยืนยันสิทธิ์ฝังภาพ", availability: row.is_active === false ? "offline" as const : "unknown" as const, display: "link" as const }];
  });
}
