import test from "node:test";
import assert from "node:assert/strict";
import {
  assessProject,
  bankMargin,
  isFresh,
  distanceKm,
} from "../lib/assessment.ts";
import {
  normalizeStations,
  normalizeWarning,
  numberValue,
  timestamp,
} from "../lib/normalize.ts";
const now = Date.parse("2026-10-03T06:00:00Z");
const project = {
  id: "test",
  slug: "test",
  name: "Test AP",
  code: "T",
  brand: "Test",
  lat: 13.8,
  lng: 100.5,
  address: "",
  province: null,
  region: null,
  zone: null,
  salesStatus: "normal",
};
const station = {
  id: "water-1",
  kind: "water",
  name: "Gauge",
  lat: 13.8,
  lng: 100.51,
  province: "",
  value: 1,
  bank: 3,
  status: 3,
  rain1h: null,
  observedAt: "2026-10-03T05:50:00Z",
  source: "ThaiWater",
};
const rain = {
  ...station,
  id: "rain-1",
  kind: "rain",
  value: 0,
  rain1h: 0,
  bank: null,
  status: null,
};
const assess = (stations) => assessProject(project, stations, 10, now);
test("missing data never becomes an all-clear", () => {
  assert.equal(assess([]).risk, "unknown");
  assert.equal(assess([station]).risk, "unknown");
  assert.equal(assess([rain]).risk, "unknown");
  assert.equal(assess([station, { ...rain, rain1h: null }]).risk, "unknown");
  assert.equal(assess([station, rain]).risk, "normal");
});
test("water statuses 1 and 2 indicate low water, not flood alerts", () => {
  for (const status of [1, 2, 3])
    assert.equal(assess([{ ...station, status }, rain]).risk, "normal");
  assert.equal(assess([{ ...station, status: 4 }]).risk, "watch");
  assert.equal(assess([{ ...station, status: 5 }]).risk, "priority");
});
test("maximum signal across all nearby stations beats nearest reading", () => {
  const far = { ...station, id: "far", lat: 13.86, status: 5 };
  const a = assess([station, rain, far]);
  assert.equal(a.risk, "priority");
  assert.equal(a.trigger.id, "far");
  assert.ok(a.trigger.distance > a.water[0].distance);
});
test("rain thresholds including short intense bursts", () => {
  for (const [value, expected] of [
    [35, "normal"],
    [35.1, "watch"],
    [90, "watch"],
    [90.1, "priority"],
  ])
    assert.equal(assess([station, { ...rain, value }]).risk, expected);
  for (const [rain1h, expected] of [
    [25, "normal"],
    [25.1, "watch"],
    [50, "watch"],
    [50.1, "priority"],
  ])
    assert.equal(assess([station, { ...rain, rain1h }]).risk, expected);
  assert.equal(assess([{ ...rain, value: null, rain1h: 60 }]).risk, "priority");
});
test("stale, missing and future readings are excluded without losing fresh alerts", () => {
  const stale = { ...station, status: 5, observedAt: "2026-10-02T23:59:59Z" };
  assert.equal(assess([stale, rain]).risk, "unknown");
  assert.equal(assess([{ ...stale, observedAt: null }, rain]).risk, "unknown");
  assert.equal(
    assess([{ ...station, observedAt: "2026-10-03T06:16:00Z" }, rain]).risk,
    "unknown",
  );
  assert.equal(assess([stale, { ...rain, value: 100 }]).risk, "priority");
  assert.ok(isFresh("2026-10-03T00:00:00Z", now));
  assert.ok(isFresh("2026-10-03T06:15:00Z", now));
  assert.ok(!isFresh("2026-10-03T06:15:01Z", now));
});
test("radius is geometric and ignores province borders", () => {
  const far = { ...station, lat: 14.5, status: 5 };
  assert.equal(assess([station, rain, far]).risk, "normal");
  assert.ok(distanceKm(13.8, 100.5, 13.8, 100.5) === 0);
  const border = { ...station, province: "Different province", status: 5 };
  assert.equal(assess([border]).risk, "priority");
  assert.equal(
    assessProject({ ...project, lat: null }, [station, rain], 10, now).risk,
    "unknown",
  );
});
test("numeric sentinels and empty values are not measurements", () => {
  for (const v of [-999, 9999, -9999, 999999, null, undefined, "", true, "abc"])
    assert.equal(numberValue(v), null);
  assert.equal(numberValue(-0.8), -0.8);
  assert.equal(numberValue("0"), 0);
});
test("timestamps parse Bangkok time and reject malformed dates", () => {
  assert.equal(timestamp("2026-10-03 12:50"), "2026-10-03T05:50:00.000Z");
  assert.equal(
    timestamp("2026-10-03T12:50:00+07:00"),
    "2026-10-03T05:50:00.000Z",
  );
  for (const v of [
    "2026-02-30 12:00",
    "2026-10-03",
    "2026-10-03 25:00",
    "not-a-date",
  ])
    assert.equal(timestamp(v), null);
});
test("invalid bank metadata and missing rain values remain unknown", () => {
  const payload = {
    result: "OK",
    data: [
      {
        waterlevel_msl: "279.38",
        situation_level: null,
        station: {
          id: 1,
          tele_station_lat: 13.8,
          tele_station_long: 100.5,
          min_bank: 0,
        },
      },
    ],
  };
  const [s] = normalizeStations(payload, "water");
  assert.equal(s.bank, null);
  assert.equal(bankMargin({ ...s, distance: 0, fresh: true }), null);
  assert.equal(bankMargin({ ...station, distance: 0, fresh: true }), 2);
  assert.equal(
    bankMargin({
      ...station,
      bank: 0,
      value: 0.25,
      status: 5,
      distance: 0,
      fresh: true,
    }),
    -0.25,
  );
  const [r] = normalizeStations(
    {
      result: "OK",
      data: [
        {
          rain_24h: -999,
          rain_1h: -1,
          station: { id: 1, tele_station_lat: 13.8, tele_station_long: 100.5 },
        },
      ],
    },
    "rain",
  );
  assert.equal(r.value, null);
  assert.equal(r.rain1h, null);
});
test("bad upstream payloads fail explicitly; newest stable station ID wins", () => {
  assert.throws(() => normalizeStations({ result: "NO", data: {} }, "water"));
  assert.throws(() =>
    normalizeWarning({ header: { status: "401 Unauthorized" } }),
  );
  assert.equal(
    normalizeWarning({ header: { status: "200 OK" }, Warning: {} }),
    null,
  );
  const s = { id: 1, tele_station_lat: 13.8, tele_station_long: 100.5 };
  const readings = normalizeStations(
    {
      result: "OK",
      data: [
        {
          station: s,
          waterlevel_msl: 1,
          waterlevel_datetime: "2026-10-03 12:00",
        },
        {
          station: s,
          waterlevel_msl: 2,
          waterlevel_datetime: "2026-10-03 12:10",
        },
      ],
    },
    "water",
  );
  assert.equal(readings.length, 1);
  assert.equal(readings[0].value, 2);
});

test("official CAP accepts active public Thai messages and rejects expired/test alerts", async () => {
  const { normalizeCap, capDocumentLink } = await import("../lib/normalize.ts");
  const documentUrl = "https://www5.tmd.go.th/uploads/CAP/CAPTMD20261003.xml";
  const xml =
    '<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>test</identifier><sent>2026-10-03T06:00:00+07:00</sent><status>Actual</status><msgType>Alert</msgType><scope>Public</scope><info><language>th-TH</language><effective>2026-10-03T06:00:00+07:00</effective><expires>2026-10-03T18:00:00+07:00</expires><headline>ฝนหนัก</headline><area><areaDesc>ภูเก็ต</areaDesc></area></info></alert>';
  assert.equal(normalizeCap(xml, documentUrl, now).title, "ฝนหนัก");
  assert.equal(
    normalizeCap(xml, documentUrl, now).issuedAt,
    "2026-10-02T23:00:00.000Z",
  );
  assert.equal(normalizeCap(xml, documentUrl, now).area, "ภูเก็ต");
  assert.equal(
    normalizeCap(xml.replace("Actual", "Test"), documentUrl, now),
    null,
  );
  assert.equal(
    normalizeCap(xml.replace("Alert", "Cancel"), documentUrl, now),
    null,
  );
  assert.equal(
    normalizeCap(xml, documentUrl, Date.parse("2026-10-03T11:00:00Z")),
    null,
  );
  assert.equal(
    capDocumentLink(
      "<rss><channel><title>TMD</title><item><link>https://www.tmd.go.th/uploads/CAP/CAPTMD20261003.xml</link></item></channel></rss>",
    ),
    documentUrl,
  );
  assert.throws(() =>
    capDocumentLink(
      "<rss><channel><title>TMD</title><item><link>https://example.com/fake.xml</link></item></channel></rss>",
    ),
  );
  assert.throws(() =>
    normalizeCap("<html>upstream error</html>", documentUrl, now),
  );
});

test("map station symbols keep partial/stale data unknown and preserve severe signals", async () => {
  const { stationRisk } = await import("../lib/map-signals.ts");
  assert.equal(
    stationRisk({ ...station, status: 5, observedAt: null }, now),
    "unknown",
  );
  assert.equal(stationRisk({ ...station, status: 5 }, now), "priority");
  assert.equal(
    stationRisk({ ...rain, value: 0, rain1h: null }, now),
    "unknown",
  );
  assert.equal(
    stationRisk({ ...rain, value: null, rain1h: 60 }, now),
    "priority",
  );
  assert.equal(stationRisk({ ...station, status: 1 }, now), "normal");
});
test("guided tour visits distinct elevated-signal areas and keeps missing data out", async () => {
  const { tourProjects } = await import("../lib/map-signals.ts");
  const a = assess([{ ...station, status: 5 }]);
  const near = {
    ...a,
    project: { ...project, id: "near", lat: project.lat + 0.001 },
  };
  const far = {
    ...a,
    project: { ...project, id: "far", lat: project.lat + 0.1 },
  };
  const unknown = {
    ...far,
    project: { ...far.project, id: "unknown" },
    risk: "unknown",
  };
  assert.deepEqual(
    tourProjects([a, near, far, unknown]).map((a) => a.project.id),
    ["test", "far"],
  );
  assert.deepEqual(tourProjects([unknown]), []);
});
