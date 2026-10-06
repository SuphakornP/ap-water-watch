const TILE_ENDPOINT = "https://twa.thaiwater.net/api/gistda/flood-7days";
const MERCATOR_LIMIT = 20_037_508.342789244;
const TILE_TTL_MS = 300_000;
const MAX_IMAGE_BYTES = 1_048_576;
const MAX_CACHE_TILES = 64;
const MAX_CACHE_BYTES = 8 * MAX_IMAGE_BYTES;
const MAX_IN_FLIGHT = 64;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const IMAGE_HEADERS = {
  "Content-Type": "image/png",
  "Cache-Control": "public, max-age=300, s-maxage=900",
  "X-Content-Type-Options": "nosniff",
};

export interface GistdaTileParams {
  z: string;
  x: string;
  y: string;
}

interface TileCoordinate {
  z: number;
  x: number;
  y: number;
}

function coordinates(params: GistdaTileParams): TileCoordinate | null {
  if (![params.z, params.x, params.y].every((part) =>
    typeof part === "string" && /^(0|[1-9]\d{0,4})$/.test(part)))
    return null;
  const z = Number(params.z), x = Number(params.x), y = Number(params.y);
  if (z > 14 || x >= 2 ** z || y >= 2 ** z) return null;
  return { z, x, y };
}

export function gistdaTileUrl(params: GistdaTileParams): string | null {
  const tile = coordinates(params);
  if (!tile) return null;
  const span = (2 * MERCATOR_LIMIT) / 2 ** tile.z;
  const west = -MERCATOR_LIMIT + tile.x * span;
  const east = -MERCATOR_LIMIT + (tile.x + 1) * span;
  const north = MERCATOR_LIMIT - tile.y * span;
  const south = MERCATOR_LIMIT - (tile.y + 1) * span;
  const url = new URL(TILE_ENDPOINT);
  url.search = new URLSearchParams({
    bbox: [west, south, east, north].join(","),
    width: "256",
    height: "256",
    srs: "EPSG:3857",
  }).toString();
  return url.href;
}

function validatePng(bytes: Uint8Array): void {
  if (bytes.length < 45 || !PNG_SIGNATURE.every((value, i) => bytes[i] === value))
    throw new Error("GISTDA upstream returned an invalid PNG signature");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(8) !== 13 ||
    String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR" ||
    view.getUint32(16) !== 256 ||
    view.getUint32(20) !== 256
  )
    throw new Error("GISTDA upstream returned unexpected PNG dimensions");
  let offset = 8;
  let hasImageData = false;
  while (offset + 12 <= bytes.length) {
    const size = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const end = offset + size + 12;
    if (end > bytes.length) break;
    if (type === "IDAT" && size > 0) hasImageData = true;
    if (type === "IEND") {
      if (size === 0 && end === bytes.length && hasImageData) return;
      break;
    }
    offset = end;
  }
  throw new Error("GISTDA upstream returned an incomplete PNG");
}

async function readPng(response: Response): Promise<ArrayBuffer> {
  if (!/^image\/png(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) {
    await response.body?.cancel();
    throw new Error("GISTDA upstream did not return image/png");
  }
  const announcedSize = Number(response.headers.get("content-length"));
  if (announcedSize > MAX_IMAGE_BYTES) {
    await response.body?.cancel();
    throw new Error("GISTDA upstream image exceeds the size limit");
  }
  if (!response.body) throw new Error("GISTDA upstream returned an empty body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new Error("GISTDA upstream image exceeds the size limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  validatePng(bytes);
  return bytes.buffer;
}

function failure(status: number, error: string): Response {
  return Response.json({ error }, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

type TileResult = { image: ArrayBuffer } | { status: number; error: string };

export function createGistdaTileHandler({
  fetcher = fetch,
  now = Date.now,
}: { fetcher?: typeof fetch; now?: () => number } = {}) {
  const cache = new Map<string, { image: ArrayBuffer; storedAt: number }>();
  const inFlight = new Map<string, Promise<TileResult>>();
  let cacheBytes = 0;

  function remember(key: string, image: ArrayBuffer) {
    for (const [existingKey, entry] of cache) {
      if (now() - entry.storedAt >= TILE_TTL_MS) {
        cache.delete(existingKey);
        cacheBytes -= entry.image.byteLength;
      }
    }
    while (cache.size >= MAX_CACHE_TILES || cacheBytes + image.byteLength > MAX_CACHE_BYTES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) break;
      cacheBytes -= cache.get(oldestKey)!.image.byteLength;
      cache.delete(oldestKey);
    }
    cache.set(key, { image, storedAt: now() });
    cacheBytes += image.byteLength;
  }

  async function load(url: string): Promise<TileResult> {
    const signal = AbortSignal.timeout(18_000);
    try {
      const response = await fetcher(url, {
        headers: { Accept: "image/png" },
        redirect: "manual",
        signal,
      });
      if (!response.ok || response.redirected) {
        await response.body?.cancel();
        throw new Error(`GISTDA upstream tile HTTP ${response.status}`);
      }
      if (response.url) {
        const delivered = new URL(response.url);
        const allowed = new URL(TILE_ENDPOINT);
        if (delivered.origin !== allowed.origin || delivered.pathname !== allowed.pathname) {
          await response.body?.cancel();
          throw new Error("GISTDA upstream returned an unexpected destination");
        }
      }
      return { image: await readPng(response) };
    } catch (error) {
      console.error("GISTDA flood tile failed", error);
      const timedOut = signal.aborted ||
        (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name));
      return {
        status: timedOut ? 504 : 502,
        error: timedOut
          ? "ต้นทางภาพ GISTDA ใช้เวลานานเกินกำหนด กรุณาลองใหม่"
          : "ไม่สามารถโหลดภาพพื้นที่น้ำท่วมจาก GISTDA ผ่าน ThaiWater ได้",
      };
    }
  }

  return async function getTile(params: GistdaTileParams): Promise<Response> {
    const url = gistdaTileUrl(params);
    if (!url) return failure(400, "พิกัดแผนที่ไม่ถูกต้อง รองรับระดับซูม 0–14");
    const key = `${params.z}/${params.x}/${params.y}`;
    const existing = cache.get(key);
    if (existing && now() - existing.storedAt < TILE_TTL_MS) {
      cache.delete(key);
      cache.set(key, existing);
      return new Response(existing.image.slice(0), { headers: IMAGE_HEADERS });
    }
    if (existing) {
      cache.delete(key);
      cacheBytes -= existing.image.byteLength;
    }
    let pending = inFlight.get(key);
    if (!pending) {
      if (inFlight.size >= MAX_IN_FLIGHT)
        return failure(503, "กำลังโหลดภาพแผนที่จำนวนมาก กรุณาลองใหม่");
      pending = load(url).then((result) => {
        if ("image" in result) remember(key, result.image);
        return result;
      }).finally(() => { inFlight.delete(key); });
      inFlight.set(key, pending);
    }
    const result = await pending;
    return "image" in result
      ? new Response(result.image.slice(0), { headers: IMAGE_HEADERS })
      : failure(result.status, result.error);
  };
}

export const getGistdaTile = createGistdaTileHandler();
