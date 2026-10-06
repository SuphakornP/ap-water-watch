import test from "node:test";
import assert from "node:assert/strict";
import { nearbyDwrStations, matchDwrStations, dwrStatusColor, dwrStatusLabel } from "../lib/dwr-context.ts";
import { normalizeStations } from "../lib/normalize.ts";

const now = Date.parse("2026-10-06T07:00:00Z");
const dwr = {
  id: "dwr:STN0001", code: "STN0001", name: "สถานีสาธิต", province: "เชียงใหม่",
  district: "ทดสอบ", subdistrict: "ทดสอบ", lat: 18.8, lng: 98.9, kind: "rain",
  reportAt: "2026-10-06T06:45:00Z", reportTimeKind: "observation",
  alertStatus: 9, alertIssuedAt: null, warningType: "rain",
  rain15m: 1, rain12h: 18, rainDaily07: 10, waterLevel: null,
  sourceUrl: "https://ews.dwr.go.th/ews/index.php",
};
const thai = {
  id: "rain-123", kind: "rain", name: "สถานีสาธิต (ชื่อที่ต้นทางต่างกัน)",
  lat: 18.8, lng: 98.9, province: "เชียงใหม่", value: 32, rain1h: null,
  bank: null, status: null, observedAt: "2026-10-06T06:00:00Z", source: "ทน.",
  providerCode: "DWR", providerStationCode: "STN0001",
};

test("ThaiWater retains provider identity while preserving the existing station ID and rain periods", () => {
  const [station] = normalizeStations({ result: "OK", data: [{
    rain_24h: 32, rain_1h: 2, rainfall_datetime: "2026-10-06 13:00",
    agency: { agency_shortname: { th: "ทน.", en: " dwr " } },
    station: { id: 123, tele_station_oldcode: "STN0001", tele_station_name: { th: "สถานีสาธิต" }, tele_station_lat: 18.8, tele_station_long: 98.9 },
  }] }, "rain");
  assert.equal(station.id, "rain-123");
  assert.equal(station.providerCode, "DWR");
  assert.equal(station.providerStationCode, "STN0001");
  assert.equal(station.value, 32);
  assert.equal(station.rain1h, 2);
  assert.equal(station.source, "ทน.");
});

test("matching requires provider, exact station code and coordinate agreement, never a display name", () => {
  const result = matchDwrStations([dwr], [thai]);
  assert.equal(result.links[dwr.id].state, "matched");
  assert.equal(result.links[dwr.id].linkedThaiWaterId, thai.id);
  assert.equal(result.links[dwr.id].distanceKm, 0);
  assert.deepEqual(result.stats, { total: 1, matched: 1, conflicting: 0, directOnly: 0, provinces: 1 });
  for (const candidate of [
    { ...thai, providerCode: "HII", name: dwr.name },
    { ...thai, providerStationCode: "STN0002", name: dwr.name },
    { ...thai, providerStationCode: undefined, name: dwr.name },
  ]) {
    const unmatched = matchDwrStations([dwr], [candidate]).links[dwr.id];
    assert.equal(unmatched.state, "directOnly");
    assert.equal(unmatched.linkedThaiWaterId, null);
  }
});

test("same-code coordinate conflicts remain separate and expose candidate provenance", () => {
  const conflict = matchDwrStations([dwr], [{ ...thai, lat: 18.9 }]);
  assert.equal(conflict.links[dwr.id].state, "conflicting");
  assert.equal(conflict.links[dwr.id].linkedThaiWaterId, null);
  assert.deepEqual(conflict.links[dwr.id].candidateThaiWaterIds, [thai.id]);
  assert.ok(conflict.links[dwr.id].distanceKm > 0.1);
  assert.equal(conflict.stats.conflicting, 1);
  assert.equal(matchDwrStations([dwr], [{ ...thai, lat: Number.NaN }]).links[dwr.id].state, "conflicting");
  assert.equal(matchDwrStations([dwr], [{ ...thai, lat: 18.8005 }]).stats.matched, 1);
});

test("same-provider linkage never merges independent measurements or changes project risk inputs", () => {
  const before = JSON.stringify([dwr, thai]);
  const result = matchDwrStations([dwr], [thai, { ...thai, id: "rain-secondary", lat: 18.81 }]);
  assert.equal(result.links[dwr.id].linkedThaiWaterId, "rain-123");
  assert.equal(JSON.stringify([dwr, thai]), before);
  assert.equal(dwr.rain12h, 18);
  assert.equal(thai.value, 32);
  assert.equal(thai.rain1h, null);
});

test("nearby source reports retain stale, missing, future and epoch timestamps without treating them as current", () => {
  const reports = [
    dwr,
    { ...dwr, id: "old", code: "STN0002", reportAt: "2026-10-06T00:59:59Z", lat: 18.801 },
    { ...dwr, id: "future", code: "STN0003", reportAt: "2026-10-06T07:15:01Z", lat: 18.802 },
    { ...dwr, id: "missing", code: "STN0004", reportAt: null, lat: 18.803 },
    { ...dwr, id: "epoch", code: "STN0005", reportAt: "1970-01-01T00:00:00Z", lat: 18.804 },
    { ...dwr, id: "far", code: "STN0006", lat: 19.8 },
  ];
  const nearby = nearbyDwrStations({ lat: 18.8, lng: 98.9 }, reports, 5, now);
  assert.equal(nearby.length, 5);
  assert.equal(nearby[0].fresh, true);
  assert.ok(nearby.slice(1).every((station) => !station.fresh));
  assert.ok(nearby.every((station, index) => index === 0 || station.distance >= nearby[index - 1].distance));
  assert.deepEqual(nearbyDwrStations({ lat: null, lng: 98.9 }, reports, 5, now), []);
  assert.throws(() => nearbyDwrStations({ lat: 18.8, lng: 98.9 }, reports, 0, now), /positive distance/);
});

test("DWR status codes remain distinct from ThaiWater levels, and old reports use an unknown colour", () => {
  assert.match(dwrStatusLabel(0, true), /ไม่มีสถานะเตือน/);
  assert.equal(dwrStatusLabel(9, true), "มีฝน");
  assert.equal(dwrStatusLabel(1, true), "เฝ้าระวัง");
  assert.equal(dwrStatusLabel(2, true), "เตรียมพร้อม");
  assert.equal(dwrStatusLabel(3, true), "วิกฤติ");
  for (const status of [0, 1, 2, 3, 9, null]) {
    assert.match(dwrStatusLabel(status, false), /^ข้อมูลเก่า ·/);
    assert.equal(dwrStatusColor(status, false), dwrStatusColor(null, true));
  }
  assert.notEqual(dwrStatusColor(9, true), dwrStatusColor(3, true));
});

test("coverage counts unique station identities and provinces, including a 63-province catalogue", () => {
  const stations = Array.from({ length: 63 }, (_, index) => ({
    ...dwr, id: `dwr:STN${String(index + 1).padStart(4, "0")}`,
    code: `STN${String(index + 1).padStart(4, "0")}`, province: `จังหวัดสาธิต ${index + 1}`,
  }));
  const result = matchDwrStations([...stations, stations[0]], [thai]);
  assert.deepEqual(result.stats, { total: 63, matched: 1, conflicting: 0, directOnly: 62, provinces: 63 });
  assert.equal(Object.keys(result.links).length, 63);
});
