import type { Feed } from "@/lib/flood-types";
import { collectMonitoringFeed } from "@/lib/monitor";

let cached: Feed | undefined;
let cachedAt = 0;
let inFlight: Promise<Feed> | null = null;
export async function GET() {
  if (!cached || Date.now() - cachedAt > 300_000) {
    if (!inFlight)
      inFlight = collectMonitoringFeed()
        .then((result) => {
          cached = result;
          cachedAt = Date.now();
          return result;
        })
        .finally(() => {
          inFlight = null;
        });
    await inFlight;
  }
  return Response.json(cached, {
    headers: { "Cache-Control": "private, max-age=30" },
  });
}
