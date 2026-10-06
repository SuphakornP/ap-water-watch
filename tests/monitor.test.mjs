import test from "node:test";
import assert from "node:assert/strict";
import { collectMonitoringFeed } from "../lib/monitor.ts";
import { DWR_ENDPOINT, DWR_SOURCE_URL } from "../lib/dwr-normalize.ts";

const waterUrl = "https://api-v3.thaiwater.net/api/v1/thaiwater30/provinces/waterlevel";
const rainUrl = "https://api-v3.thaiwater.net/api/v1/thaiwater30/provinces/rain24?include_zero=1";
const tmdUrl = "https://www5.tmd.go.th/api/xml/CAP";
const observation = {
  station: {
    id: 123,
    tele_station_oldcode: "STN0053",
    tele_station_name: { th: "สถานีทดสอบ" },
    tele_station_lat: 13.85,
    tele_station_long: 99.35,
    min_bank: 5,
  },
  situation_level: 3,
  waterlevel_msl: 2,
  waterlevel_datetime: "2026-10-06 14:00:00",
  rain_24h: 19,
  rain_1h: 1,
  rainfall_datetime: "2026-10-06 14:00:00",
};
const dwr = {
  stn: "STN0053",
  name: "DWR test station",
  stn_type: "wl",
  latitude: "13.85",
  longitude: "99.35",
  status: "3",
  date: "06/10/69 13:45 น.",
  report_date: "2026-10-06 13:45:00",
  warning_type: "wl",
  wl: "4.22",
  rain: "0.0",
  rain12h: "18.0",
  rain07h: "95.0",
};

function fakeFetch(overrides = new Map()) {
  const calls = [];
  return {
    calls,
    fetcher: async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (overrides.has(url)) return overrides.get(url)();
      if (url === DWR_ENDPOINT) return Response.json([dwr]);
      if (url === tmdUrl)
        return new Response("<rss><channel><title>TMD CAP</title></channel></rss>");
      if (url === waterUrl || url === rainUrl)
        return Response.json({ result: "OK", data: [observation] });
      throw new Error(`Unexpected fetch ${url}`);
    },
  };
}

test("collector fetches four sources with bounded timeouts and DWR multipart LoadStation", async (context) => {
  const timeout = context.mock.method(AbortSignal, "timeout", () => new AbortController().signal);
  const request = fakeFetch();
  const feed = await collectMonitoringFeed(request.fetcher);
  assert.deepEqual(request.calls.map(({ url }) => url), [waterUrl, rainUrl, tmdUrl, DWR_ENDPOINT]);
  assert.equal(timeout.mock.callCount(), 4);
  assert.deepEqual(timeout.mock.calls.map(({ arguments: args }) => args), [[18_000], [18_000], [18_000], [18_000]]);
  const dwrCall = request.calls.find(({ url }) => url === DWR_ENDPOINT);
  assert.equal(dwrCall.init.method, "POST");
  assert.ok(dwrCall.init.body instanceof FormData);
  assert.deepEqual([...dwrCall.init.body.entries()], [["action", "LoadStation"]]);
  assert.equal(dwrCall.init.headers.Accept, "application/json");
  assert.ok(dwrCall.init.signal instanceof AbortSignal);
  assert.equal(feed.sources.length, 4);
  assert.ok(feed.sources.every(({ state }) => state === "ok"));
  assert.equal(feed.warning, null);
  assert.equal(feed.sources.find(({ id }) => id === "tmd").count, 0);
  assert.equal(feed.sources.find(({ id }) => id === "dwr-ews").url, DWR_SOURCE_URL);
});

test("DWR rows stay in their own evidence feed without changing ThaiWater station measurements", async () => {
  const feed = await collectMonitoringFeed(fakeFetch().fetcher);
  assert.equal(feed.stations.length, 2);
  assert.equal(feed.stations.find(({ kind }) => kind === "water").value, 2);
  assert.equal(feed.stations.find(({ kind }) => kind === "rain").value, 19);
  assert.ok(feed.stations.every(({ id }) => !id.startsWith("dwr:")));
  assert.equal(feed.dwr.stations.length, 1);
  assert.equal(feed.dwr.stations[0].id, "dwr:STN0053");
  assert.equal(feed.dwr.stations[0].waterLevel, 4.22);
  assert.equal(feed.dwr.stations[0].rain12h, 18);
  assert.equal(feed.dwr.fetchedAt, feed.fetchedAt);
  assert.equal(feed.sources.find(({ id }) => id === "dwr-ews").count, 1);
});

test("DWR HTTP, malformed, and empty responses remain source errors while ThaiWater stays usable", async (context) => {
  const logger = context.mock.method(console, "error", () => {});
  const failures = [
    () => new Response("Unavailable", { status: 503 }),
    () => Response.json({ error: "Upstream unavailable" }),
    () => Response.json([]),
    () => new Response("<html>Maintenance</html>"),
    () => { throw new TypeError("Network failed"); },
  ];
  for (const failure of failures) {
    const request = fakeFetch(new Map([[DWR_ENDPOINT, failure]]));
    const feed = await collectMonitoringFeed(request.fetcher);
    const health = feed.sources.find(({ id }) => id === "dwr-ews");
    assert.equal(health.state, "error");
    assert.match(health.error, /ต้นทาง/);
    assert.equal(Object.hasOwn(feed, "dwr"), false);
    assert.equal(feed.stations.length, 2);
    assert.ok(feed.sources.filter(({ id }) => id !== "dwr-ews").every(({ state }) => state === "ok"));
  }
  assert.equal(logger.mock.callCount(), failures.length);
  assert.ok(logger.mock.calls.every(({ arguments: args }) => args[0] === "Upstream dwr-ews failed" && args[1] instanceof Error));
});

test("ThaiWater failures do not suppress DWR or TMD source health", async (context) => {
  const logger = context.mock.method(console, "error", () => {});
  const request = fakeFetch(new Map([
    [waterUrl, () => new Response("Unavailable", { status: 502 })],
    [rainUrl, () => Response.json({ result: "ERROR" })],
  ]));
  const feed = await collectMonitoringFeed(request.fetcher);
  assert.equal(feed.stations.length, 0);
  assert.equal(feed.dwr.stations.length, 1);
  assert.equal(feed.sources.find(({ id }) => id === "dwr-ews").state, "ok");
  assert.equal(feed.sources.find(({ id }) => id === "tmd").state, "ok");
  assert.equal(feed.sources.find(({ id }) => id === "water").state, "error");
  assert.equal(feed.sources.find(({ id }) => id === "rain").state, "error");
  assert.equal(logger.mock.callCount(), 2);
});
