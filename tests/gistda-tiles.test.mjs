import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { createGistdaTileHandler, gistdaTileUrl } from "../lib/gistda-server.ts";

function chunk(type, bytes = Buffer.alloc(0)) {
  const body = Buffer.concat([Buffer.from(type), bytes]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const size = Buffer.alloc(4), check = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  check.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, body, check]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(256, 0);
ihdr.writeUInt32BE(256, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(Buffer.alloc((256 * 4 + 1) * 256))),
  chunk("IEND"),
]);
const tile = { z: "8", x: "199", y: "117" };
const imageResponse = () => new Response(png, { headers: { "Content-Type": "image/png" } });

test("GISTDA URL uses fixed source and correct EPSG:3857 bounds for XYZ tiles", () => {
  const url = new URL(gistdaTileUrl({ z: "0", x: "0", y: "0" }));
  assert.equal(url.origin, "https://twa.thaiwater.net");
  assert.equal(url.pathname, "/api/gistda/flood-7days");
  assert.deepEqual([...url.searchParams.keys()], ["bbox", "width", "height", "srs"]);
  assert.equal(url.searchParams.get("bbox"), "-20037508.342789244,-20037508.342789244,20037508.342789244,20037508.342789244");
  assert.equal(url.searchParams.get("srs"), "EPSG:3857");
  assert.equal(url.searchParams.get("width"), "256");
  assert.equal(url.searchParams.get("height"), "256");
  const nw = new URL(gistdaTileUrl({ z: "1", x: "0", y: "0" }));
  assert.equal(nw.searchParams.get("bbox"), "-20037508.342789244,0,0,20037508.342789244");
  assert.ok(gistdaTileUrl({ z: "14", x: "16383", y: "16383" }));
});

test("invalid XYZ and URL injection inputs return uncached HTTP 400 without upstream fetch", async () => {
  let calls = 0;
  const handler = createGistdaTileHandler({ fetcher: async () => { calls++; return imageResponse(); } });
  const invalid = [
    { z: "15", x: "0", y: "0" },
    { z: "2", x: "4", y: "0" },
    { z: "2", x: "0", y: "4" },
    { z: "-1", x: "0", y: "0" },
    { z: "1.5", x: "0", y: "0" },
    { z: "1e1", x: "0", y: "0" },
    { z: "8", x: "https://example.com", y: "0" },
    { z: "8", x: "199&url=http://127.0.0.1", y: "0" },
    { z: "8", x: "199/../../", y: "0" },
    { z: "08", x: "0", y: "0" },
    { z: "8", x: " 0", y: "0" },
    { z: 8, x: "0", y: "0" },
  ];
  for (const params of invalid) {
    const response = await handler(params);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(calls, 0);
});

test("valid transparent source PNG is returned with bounded caching and no invented capture time", async (context) => {
  const timeout = context.mock.method(AbortSignal, "timeout", () => new AbortController().signal);
  let request;
  const handler = createGistdaTileHandler({ fetcher: async (url, init) => {
    request = { url, init };
    return imageResponse();
  } });
  const response = await handler(tile);
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cache-control"), "public, max-age=300, s-maxage=900");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("last-modified"), null);
  assert.equal(request.init.redirect, "manual");
  assert.equal(request.init.headers.Accept, "image/png");
  assert.ok(request.init.signal instanceof AbortSignal);
  assert.deepEqual(timeout.mock.calls[0].arguments, [18_000]);
});

test("upstream failures, redirects, non-PNG and damaged PNG fail explicitly without cached blank images", async (context) => {
  const logger = context.mock.method(console, "error", () => {});
  const wrongWidth = Buffer.from(png);
  wrongWidth.writeUInt32BE(512, 16);
  const wrongSignature = Buffer.from(png);
  wrongSignature[0] = 0;
  const failures = [
    () => new Response("down", { status: 503 }),
    () => new Response(null, { status: 302, headers: { Location: "https://example.com" } }),
    () => new Response("<html>error</html>", { headers: { "Content-Type": "text/html" } }),
    () => new Response("<html>error</html>", { headers: { "Content-Type": "image/png" } }),
    () => new Response(wrongWidth, { headers: { "Content-Type": "image/png" } }),
    () => new Response(wrongSignature, { headers: { "Content-Type": "image/png" } }),
    () => new Response(png.subarray(0, 33), { headers: { "Content-Type": "image/png" } }),
    () => { const response = imageResponse(); Object.defineProperty(response, "redirected", { value: true }); return response; },
    () => { const response = imageResponse(); Object.defineProperty(response, "url", { value: "http://127.0.0.1/private" }); return response; },
    () => { throw new TypeError("Network failure"); },
  ];
  for (const source of failures) {
    let calls = 0;
    const handler = createGistdaTileHandler({ fetcher: async () => { calls++; return source(); } });
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await handler(tile);
      assert.equal(response.status, 502);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.match(response.headers.get("content-type"), /application\/json/);
      assert.match((await response.json()).error, /GISTDA/);
    }
    assert.equal(calls, 2);
  }
  assert.equal(logger.mock.callCount(), failures.length * 2);
});

test("announced and streaming bodies above 1 MiB are cancelled and fail HTTP 502", async (context) => {
  context.mock.method(console, "error", () => {});
  for (const announced of [false, true]) {
    let cancelled = false;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(600_000));
        controller.enqueue(new Uint8Array(600_000));
      },
      cancel() { cancelled = true; },
    });
    const handler = createGistdaTileHandler({ fetcher: async () => new Response(body, {
      headers: { "Content-Type": "image/png", ...(announced ? { "Content-Length": "1200000" } : {}) },
    }) });
    assert.equal((await handler(tile)).status, 502);
    assert.equal(cancelled, true);
  }
});

test("upstream timeout becomes explicit uncached HTTP 504", async (context) => {
  context.mock.method(console, "error", () => {});
  const handler = createGistdaTileHandler({ fetcher: async () => { throw new DOMException("Timed out", "TimeoutError"); } });
  const response = await handler(tile);
  assert.equal(response.status, 504);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("duplicate in-flight tiles coalesce and cached tiles expire after five minutes", async () => {
  let calls = 0, clock = 1000, release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const handler = createGistdaTileHandler({
    now: () => clock,
    fetcher: async () => { calls++; await waiting; return imageResponse(); },
  });
  const first = handler(tile), second = handler(tile);
  assert.equal(calls, 1);
  release();
  const responses = await Promise.all([first, second]);
  assert.ok(responses.every(({ status }) => status === 200));
  assert.deepEqual(Buffer.from(await responses[0].arrayBuffer()), png);
  assert.deepEqual(Buffer.from(await responses[1].arrayBuffer()), png);
  clock += 299_999;
  assert.equal((await handler(tile)).status, 200);
  assert.equal(calls, 1);
  clock += 1;
  assert.equal((await handler(tile)).status, 200);
  assert.equal(calls, 2);
});

test("tile cache evicts its oldest entry after 64 distinct tiles", async () => {
  let calls = 0;
  const handler = createGistdaTileHandler({ fetcher: async () => { calls++; return imageResponse(); } });
  for (let x = 0; x < 65; x++)
    assert.equal((await handler({ z: "7", x: String(x), y: "0" })).status, 200);
  assert.equal(calls, 65);
  await handler({ z: "7", x: "64", y: "0" });
  assert.equal(calls, 65);
  await handler({ z: "7", x: "0", y: "0" });
  assert.equal(calls, 66);
});

test("tile cache also limits retained images to 8 MiB", async () => {
  const largePng = Buffer.concat([
    png.subarray(0, -12),
    chunk("tEXt", Buffer.concat([Buffer.from("Note\0"), Buffer.alloc(900_000, 65)])),
    chunk("IEND"),
  ]);
  let calls = 0;
  const handler = createGistdaTileHandler({ fetcher: async () => {
    calls++;
    return new Response(largePng, { headers: { "Content-Type": "image/png" } });
  } });
  for (let x = 0; x < 10; x++)
    assert.equal((await handler({ z: "4", x: String(x), y: "0" })).status, 200);
  assert.equal(calls, 10);
  await handler({ z: "4", x: "9", y: "0" });
  assert.equal(calls, 10);
  await handler({ z: "4", x: "0", y: "0" });
  assert.equal(calls, 11);
});

test("new tiles receive explicit backpressure at 64 active requests while duplicates still coalesce", async () => {
  let calls = 0, release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const handler = createGistdaTileHandler({ fetcher: async () => {
    calls++;
    await waiting;
    return imageResponse();
  } });
  const requests = Array.from({ length: 64 }, (_, x) => handler({ z: "7", x: String(x), y: "0" }));
  const duplicate = handler({ z: "7", x: "0", y: "0" });
  const overflow = await handler({ z: "7", x: "64", y: "0" });
  assert.equal(overflow.status, 503);
  assert.equal(overflow.headers.get("cache-control"), "no-store");
  assert.equal(calls, 64);
  release();
  const responses = await Promise.all([...requests, duplicate]);
  assert.ok(responses.every(({ status }) => status === 200));
  assert.equal(calls, 64);
});
