import { getCameraCatalog } from "@/lib/camera-catalog";

export async function GET() {
  return Response.json(await getCameraCatalog(), { headers: { "Cache-Control": "public, max-age=60, s-maxage=900" } });
}
