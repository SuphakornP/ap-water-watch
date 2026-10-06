import test from "node:test";
import assert from "node:assert/strict";
import {
  DWR_ENDPOINT,
  DWR_SOURCE_URL,
  normalizeDwrStations,
} from "../lib/dwr-normalize.ts";

const rawStation = {
  stn: "STN0053",
  name: "บ้านหินแด้น*",
  stn_type: "wl",
  latitude: "13.8451",
  longitude: "99.3442",
  province: "กาญจนบุรี",
  amphoe: "ด่านมะขามเตี้ย",
  tambon: "หนองไผ่",
  status: "0",
  date: "06/10/69 13:45 น.",
  rain: "0.0",
  rain12h: "18.0",
  rain07h: "95.0",
  wl: "4.22",
  alert_min: "55.00",
  alert_max: "4.00",
  report_date: null,
  warning_type: null,
};
const normalize = (changes = {}) =>
  normalizeDwrStations([{ ...rawStation, ...changes }])[0];

test("DWR keeps one station with distinct rainfall periods and an unspecified water datum", () => {
  const station = normalize();
  assert.equal(station.id, "dwr:STN0053");
  assert.equal(station.kind, "water");
  assert.equal(station.rain15m, 0);
  assert.equal(station.rain12h, 18);
  assert.equal(station.rainDaily07, 95);
  assert.equal(station.waterLevel, 4.22);
  assert.equal(station.district, "ด่านมะขามเตี้ย");
  assert.equal(station.reportAt, "2026-10-06T06:45:00.000Z");
  assert.equal(station.reportTimeKind, "observation");
  assert.equal(station.sourceUrl, DWR_SOURCE_URL);
  assert.match(DWR_ENDPOINT, /^https:\/\/ews\.dwr\.go\.th\//);
  for (const fabricated of ["rain1h", "rain24h", "bank", "msl", "observedAt"])
    assert.equal(Object.hasOwn(station, fabricated), false);
});

test("DWR active warnings keep report time and warning reason independent of station type", () => {
  const station = normalize({
    status: "3",
    date: "06/10/69 10:35 น.",
    report_date: "2026-10-06 10:35:00",
    warning_type: "rain",
  });
  assert.equal(station.reportTimeKind, "warning");
  assert.equal(station.reportAt, "2026-10-06T03:35:00.000Z");
  assert.equal(station.alertIssuedAt, station.reportAt);
  assert.equal(station.warningType, "rain");
  assert.equal(station.kind, "water");
  assert.equal(station.alertStatus, 3);
  assert.equal(normalize({ status: 1, warning_type: "wl" }).warningType, "water");
  assert.equal(normalize({ status: 2 }).reportTimeKind, "warning");
});

test("DWR status 9 means rainy and old warning metadata cannot create an active alert", () => {
  for (const status of [0, "0", "9"]) {
    const station = normalize({
      status,
      report_date: "2026-10-06 01:46:00",
      warning_type: "rain",
    });
    assert.equal(station.alertStatus, Number(status));
    assert.equal(station.reportTimeKind, "observation");
    assert.equal(station.alertIssuedAt, null);
    assert.equal(station.warningType, null);
  }
  for (const status of [null, undefined, "", -999, 4, "rainy", true])
    assert.equal(normalize({ status }).alertStatus, null);
});

test("DWR missing and invalid readings stay null while measured zeros remain zero", () => {
  for (const invalid of [null, undefined, "N/A", "", " ", -999, -99.9, -1, true, Infinity, "NaN"]) {
    const station = normalize({ rain: invalid, rain12h: invalid, rain07h: invalid, wl: invalid });
    assert.deepEqual(
      [station.rain15m, station.rain12h, station.rainDaily07, station.waterLevel],
      [null, null, null, null],
    );
  }
  const outOfRange = normalize({ rain: 501, rain12h: 2001, rain07h: 2001, wl: 1001 });
  assert.deepEqual(
    [outOfRange.rain15m, outOfRange.rain12h, outOfRange.rainDaily07, outOfRange.waterLevel],
    [null, null, null, null],
  );
  assert.equal(normalize({ wl: "0.00" }).waterLevel, 0);
  assert.equal(normalize({ stn_type: "RF ", wl: "0.00" }).waterLevel, null);
});

test("DWR Buddhist dates preserve historical freshness and reject epoch or calendar mistakes", () => {
  assert.equal(normalize({ date: "06/01/65 07:45 น." }).reportAt, "2022-01-06T00:45:00.000Z");
  assert.equal(normalize({ date: "06/10/2569 13:45 น." }).reportAt, "2026-10-06T06:45:00.000Z");
  assert.equal(normalize({ date: "29/02/67 07:00 น." }).reportAt, "2024-02-29T00:00:00.000Z");
  for (const date of ["01/01/13 07:00 น.", "29/02/69 13:45 น.", "31/09/69 13:45 น.", "06/10/69 24:00 น.", "06/10/69 13:60 น.", "06/10/69 13:45:60 น.", "2026-10-06", null])
    assert.equal(normalize({ date }).reportAt, null);
  assert.equal(normalize({ status: 1, report_date: "2026-02-30 07:00:00" }).alertIssuedAt, null);
  assert.equal(normalize({ status: 1, report_date: "1970-01-01 07:00:00" }).alertIssuedAt, null);
  assert.equal(normalize({ status: 1, date: null, report_date: "2026-10-06 10:35:00" }).reportAt, null);
});

test("DWR duplicate station IDs retain the newest dated report regardless of input order", () => {
  const older = { ...rawStation, date: "06/10/69 10:00 น.", rain: "1.0" };
  const newer = { ...rawStation, stn: " stn0053 ", date: "06/10/69 11:00 น.", rain: "2.0" };
  const unknown = { ...rawStation, date: "N/A", rain: "3.0" };
  for (const rows of [[older, newer, unknown], [unknown, newer, older]]) {
    const result = normalizeDwrStations(rows);
    assert.equal(result.length, 1);
    assert.equal(result[0].rain15m, 2);
    assert.equal(result[0].reportAt, "2026-10-06T04:00:00.000Z");
  }
});

test("DWR malformed or empty upstream responses fail instead of implying zero coverage", () => {
  for (const payload of [null, {}, [], { error: "Unavailable" }, [{ ...rawStation, stn: "" }], [{ ...rawStation, latitude: 0 }], [{ ...rawStation, longitude: 108 }], [{ ...rawStation, stn_type: "invalid" }]])
    assert.throws(() => normalizeDwrStations(payload), /DWR/);
  const result = normalizeDwrStations([null, { ...rawStation, latitude: true }, rawStation]);
  assert.equal(result.length, 1);
});
