import {
  normalizeStations,
  capDocumentLink,
  normalizeCap,
} from "./normalize.ts";
import type { Feed, SourceHealth } from "./flood-types";
import {
  DWR_ENDPOINT,
  DWR_SOURCE_URL,
  normalizeDwrStations,
} from "./dwr-normalize.ts";
import type { DwrStation } from "./dwr-types";
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
  {
    id: "dwr-ews",
    name: "กรมทรัพยากรน้ำ · DWR Early Warning",
    url: DWR_SOURCE_URL,
  },
] as const;
export async function collectMonitoringFeed(
  fetcher: typeof fetch = fetch,
): Promise<Feed> {
  const fetchedAt = new Date().toISOString();
  const results = await Promise.allSettled(
    SOURCES.map(async (source) => {
      const signal = AbortSignal.timeout(18_000);
      if (source.id === "dwr-ews") {
        const body = new FormData();
        body.set("action", "LoadStation");
        const response = await fetcher(DWR_ENDPOINT, {
          method: "POST",
          body,
          headers: { Accept: "application/json" },
          signal,
        });
        if (!response.ok) throw new Error(`DWR ตอบกลับ HTTP ${response.status}`);
        return {
          stations: [],
          warning: null,
          dwrStations: normalizeDwrStations(await response.json()),
        };
      }
      const response = await fetcher(source.url, {
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
        const document = await fetcher(link, {
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
  let dwrStations: DwrStation[] | undefined;
  results.forEach((result, i) => {
    const source = SOURCES[i];
    if (result.status === "fulfilled") {
      stations.push(...result.value.stations);
      if (result.value.warning) warning = result.value.warning;
      if ("dwrStations" in result.value) dwrStations = result.value.dwrStations;
      sources.push({
        ...source,
        state: "ok",
        count:
          source.id === "dwr-ews"
            ? result.value.dwrStations?.length ?? 0
            : source.id === "tmd"
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
  return {
    stations,
    sources,
    warning,
    fetchedAt,
    ...(dwrStations ? { dwr: { stations: dwrStations, fetchedAt } } : {}),
  };
}
