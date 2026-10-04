import { getCameraCatalog } from "@/lib/camera-catalog";
import type { CameraSnapshot } from "@/lib/cameras";

// No arbitrary URL proxy: only reviewed catalogue IDs are accepted. No source
// currently grants verified image redistribution, so image fetching stays off.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const camera = (await getCameraCatalog()).cameras.find(c => c.id === id);
  if (!camera) return Response.json({ error: "ไม่พบกล้องในทะเบียน" }, { status: 404 });
  const result: CameraSnapshot = {
    cameraId: camera.id, imageUrl: null, capturedAt: null, fetchedAt: null,
    checkedAt: new Date().toISOString(), state: "link", reused: false,
    message: "ยังไม่ยืนยันสิทธิ์ฝังภาพ กรุณาเปิดดูภาพจากหน่วยงานเจ้าของกล้อง",
  };
  return Response.json(result, { headers: { "Cache-Control": "public, max-age=900" } });
}
