import { getGistdaTile, type GistdaTileParams } from "@/lib/gistda-server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<GistdaTileParams> },
) {
  return getGistdaTile(await params);
}
