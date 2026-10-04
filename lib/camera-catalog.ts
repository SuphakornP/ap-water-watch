import { normalizeThaiwaterCameras, type CameraCatalog, type PublicCamera } from "./cameras.ts";
import bma from "../data/cameras-bma.json";
import rid from "../data/cameras-rid.json";

export const CAMERA_CATALOG_TTL = 15 * 60_000;
const WATER_URL = "https://api-v3.thaiwater.net/api/v1/thaiwater30/analyst/cctv";
let cached: CameraCatalog | undefined;
let cachedAt = 0;
let inFlight: Promise<CameraCatalog> | undefined;

export async function getCameraCatalog(): Promise<CameraCatalog> {
  if (cached && Date.now() - cachedAt < CAMERA_CATALOG_TTL) return cached;
  if (inFlight) return inFlight;
  inFlight = collect();
  try { return await inFlight; } finally { inFlight = undefined; }
}

async function collect(): Promise<CameraCatalog> {
  const cameras: PublicCamera[] = [...bma.cameras, ...rid].map(camera => ({ ...camera, availability: "unknown", display: "link" }));
  const sources: CameraCatalog["sources"] = [{
    id: "bma", name: "สำนักการจราจรและขนส่ง กรุงเทพมหานคร", url: bma.sourceUrl,
    state: "ok", count: bma.cameras.length, fetchedAt: bma.verifiedAt,
    note: "ทะเบียนพิกัดที่ตรวจสอบไว้ ไม่ใช่สถานะออนไลน์ปัจจุบัน · ดูภาพที่ต้นทางเท่านั้น",
  }, { id: "rid", name: "กรมชลประทาน · คลองและสถานีสูบน้ำ", url: "https://swocpr.rid.go.th/cctv/", state: "ok", count: rid.length, fetchedAt: rid[0]?.verifiedAt ?? null, note: "ทะเบียนที่ตรวจสอบไว้ · เลือกแท็บ Camera ที่ต้นทาง · เวลาข้อมูลของสถานีไม่ใช่เวลาถ่ายภาพที่ยืนยันแล้ว" }];
  let water: PublicCamera[] = [];
  try {
    const response = await fetch(WATER_URL, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`ThaiWater camera catalogue HTTP ${response.status}`);
    water = normalizeThaiwaterCameras(await response.json());
    sources.push({ id: "thaiwater", name: "ThaiWater / สสน. และหน่วยงานเจ้าของกล้อง", url: "https://www.thaiwater.net/water/cctv", state: "ok", count: water.length, fetchedAt: new Date().toISOString(), note: "ต้นทางไม่แจ้งเวลาถ่ายภาพ · การเปิดใช้งานในทะเบียนไม่ยืนยันว่ากล้องออนไลน์" });
  } catch (error) {
    console.error("Camera catalogue failed", error);
    water = cached?.cameras.filter(c => c.sourceId === "thaiwater") ?? [];
    sources.push({ id: "thaiwater", name: "ThaiWater / สสน. และหน่วยงานเจ้าของกล้อง", url: "https://www.thaiwater.net/water/cctv", state: "error", count: water.length, fetchedAt: cached?.sources.find(s => s.id === "thaiwater")?.fetchedAt ?? null, note: water.length ? "โหลดทะเบียนรอบใหม่ไม่สำเร็จ แสดงทะเบียนจากรอบก่อน" : "โหลดทะเบียนกล้องไม่สำเร็จ รายการที่แสดงยังไม่ครบทุกแหล่ง" });
  }
  cached = { cameras: [...cameras, ...water], sources, fetchedAt: new Date().toISOString() };
  cachedAt = Date.now();
  return cached;
}
