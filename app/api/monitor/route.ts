import {
  normalizeStations,
  capDocumentLink,
  normalizeCap,
} from "@/lib/normalize";
import type { Feed, SourceHealth } from "@/lib/flood-types";
const SOURCES = [
  {
    id: "water",
    name: "ThaiWater · ระดับน้ำ",
    url: "https://api-v3.thaiwater.net/api/v1/thaiwater30/provinces/waterlevel",
  },
  {
    id: "rain",
    name: "ThaiWater · ฝนสะสม 24 ชม.",
    url: "https://api-v3.thaiwater.net/api/v1/thaiwater30/provinces/rain24?include_zero=1",
  },
  {
    id: "tmd",
    name: "กรมอุตุนิยมวิทยา · CAP ล่าสุด",
    url: "https://www5.tmd.go.th/api/xml/CAP",
  },
] as const;
let cached: Feed | undefined;
let cachedAt = 0;
let inFlight: Promise<Feed> | null = null;
async function collect(): Promise<Feed> {
  const fetchedAt = new Date().toISOString();
  const results = await Promise.allSettled(
    SOURCES.map(async (source) => {
      const signal = AbortSignal.timeout(18_000);
      const response = await fetch(source.url, {
        headers: {
          Accept:
            source.id === "tmd"
              ? "application/xml, text/xml"
              : "application/json",
        },
        signal,
      });
      if (!response.ok)
        throw new Error(`ต้นทางตอบกลับ HTTP ${response.status}`);
      if (source.id === "tmd") {
        const link = capDocumentLink(await response.text());
        if (!link) return { stations: [], warning: null };
        const document = await fetch(link, {
          headers: { Accept: "application/xml, text/xml" },
          signal,
        });
        if (!document.ok)
          throw new Error(`เอกสาร CAP ตอบกลับ HTTP ${document.status}`);
        return {
          stations: [],
          warning: normalizeCap(await document.text(), link),
        };
      }
      const payload: unknown = await response.json();
      return { stations: normalizeStations(payload, source.id), warning: null };
    }),
  );
  const stations: Feed["stations"] = [],
    sources: SourceHealth[] = [];
  let warning: Feed["warning"] = null;
  results.forEach((result, i) => {
    const source = SOURCES[i];
    if (result.status === "fulfilled") {
      stations.push(...result.value.stations);
      if (result.value.warning) warning = result.value.warning;
      sources.push({
        ...source,
        state: "ok",
        count:
          source.id === "tmd"
            ? result.value.warning
              ? 1
              : 0
            : result.value.stations.length,
        fetchedAt,
      });
    } else {
      console.error(`Upstream ${source.id} failed`, result.reason);
      sources.push({
        ...source,
        state: "error",
        count: 0,
        fetchedAt,
        error: "เชื่อมต่อต้นทางไม่สำเร็จ จะลองใหม่ในรอบถัดไป",
      });
    }
  });
  return { stations, sources, warning, fetchedAt };
}
export async function GET() {
  if (!cached || Date.now() - cachedAt > 300_000) {
    if (!inFlight)
      inFlight = collect()
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
