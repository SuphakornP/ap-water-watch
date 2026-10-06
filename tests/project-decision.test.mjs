import test from "node:test";
import assert from "node:assert/strict";
import { assessProject } from "../lib/assessment.ts";
import { projectDecision } from "../lib/project-decision.ts";

const now = Date.parse("2026-10-06T06:00:00Z");
const project = {
  id: "decision-test",
  slug: "decision-test",
  name: "Synthetic decision test",
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
const water = {
  id: "water",
  kind: "water",
  name: "Water gauge",
  lat: 13.8,
  lng: 100.51,
  province: "",
  value: 1,
  bank: 3,
  status: 3,
  rain1h: null,
  observedAt: "2026-10-06T05:50:00Z",
  source: "ThaiWater",
};
const rain = {
  ...water,
  id: "rain",
  kind: "rain",
  name: "Rain gauge",
  value: 0,
  rain1h: 0,
  bank: null,
  status: null,
};
const decide = (stations) => projectDecision(assessProject(project, stations, 5, now));
const evidence = (decision, id) => decision.evidence.find((item) => item.id === id);

test("compound water and rain signals inform action without inventing a higher risk", () => {
  const decision = decide([{ ...water, status: 4 }, { ...rain, value: 40 }]);
  assert.equal(decision.risk, "watch");
  assert.equal(decision.compoundSignals, true);
  assert.match(decision.why, /ทั้งน้ำสูงและฝน/);
  assert.match(decision.impact, /ยังไม่ยืนยันผลกระทบ/);
  assert.equal(evidence(decision, "water").severity, "watch");
  assert.equal(evidence(decision, "rain24h").severity, "watch");
});

test("each factor retains its own strongest station and original timestamp", () => {
  const hourly = { ...rain, id: "hourly", lat: 13.82, rain1h: 60, value: 12 };
  const daily = { ...rain, id: "daily", lat: 13.83, rain1h: 2, value: 100 };
  const overflow = { ...water, id: "overflow", lat: 13.82, status: 5 };
  const decision = decide([water, rain, hourly, daily, overflow]);
  assert.equal(decision.risk, "priority");
  assert.equal(evidence(decision, "water").station.id, "overflow");
  assert.equal(evidence(decision, "rain1h").station.id, "hourly");
  assert.equal(evidence(decision, "rain24h").station.id, "daily");
  assert.equal(evidence(decision, "rain1h").station.observedAt, hourly.observedAt);
  assert.ok(evidence(decision, "rain1h").station.distance > 0);
  assert.match(decision.timeHorizon, /ตรวจสอบหน้างานตอนนี้/);
});

test("stale elevated observations cannot create compound signals or observed evidence", () => {
  const decision = decide([
    { ...water, status: 5, observedAt: "2026-10-05T05:00:00Z" },
    { ...rain, rain1h: 60 },
  ]);
  assert.equal(decision.risk, "priority");
  assert.equal(decision.compoundSignals, false);
  assert.equal(evidence(decision, "water").state, "stale");
  assert.equal(evidence(decision, "water").severity, "unknown");
  assert.equal(evidence(decision, "rain1h").state, "observed");
  assert.match(decision.why, /ฝน 1 ชั่วโมง/);
  assert.doesNotMatch(decision.why, /น้ำล้นตลิ่ง/);
});

test("missing hourly rain stays unknown even when daily rain and water look normal", () => {
  const decision = decide([water, { ...rain, rain1h: null }]);
  assert.equal(decision.risk, "unknown");
  assert.equal(evidence(decision, "rain1h").state, "missing");
  assert.equal(evidence(decision, "rain24h").state, "observed");
  assert.match(decision.impact, /ข้อมูลล่าสุดไม่พอ/);
  assert.match(decision.confidenceLabel, /บางส่วน/);
});

test("normal status describes observed signals without claiming project safety", () => {
  for (const status of [1, 2, 3]) {
    const decision = decide([{ ...water, status }, rain]);
    assert.equal(decision.risk, "normal");
    assert.equal(decision.compoundSignals, false);
    assert.match(decision.headline, /ยังไม่พบสัญญาณสูง/);
    assert.match(decision.impact, /ยังรับรองความปลอดภัยของโครงการไม่ได้/);
    assert.equal(evidence(decision, "water").severity, "normal");
  }
});

test("a missing project coordinate yields explicit unknown evidence", () => {
  const decision = projectDecision(
    assessProject({ ...project, lat: null }, [water, rain], 5, now),
  );
  assert.equal(decision.risk, "unknown");
  assert.match(decision.why, /ยังไม่มีพิกัด/);
  assert.equal(evidence(decision, "water").state, "missing");
  assert.equal(evidence(decision, "rain1h").state, "missing");
});

test("future, invalid-status and missing observations are excluded from factual evidence", () => {
  const future = decide([
    { ...water, status: 5, observedAt: "2026-10-06T06:16:00Z" },
    rain,
  ]);
  assert.equal(future.risk, "unknown");
  assert.equal(evidence(future, "water").state, "stale");
  const invalid = decide([{ ...water, status: 9 }, { ...rain, value: null, rain1h: null }]);
  assert.equal(invalid.risk, "unknown");
  assert.equal(evidence(invalid, "water").state, "missing");
  assert.equal(evidence(invalid, "rain24h").state, "missing");
});

test("forecast, hydrology and flood extent gaps remain explicit at every risk level", () => {
  for (const stations of [[], [water, rain], [{ ...water, status: 4 }], [{ ...rain, rain1h: 60 }]]) {
    const decision = decide(stations);
    for (const id of ["rain48h", "forecast", "connectivity", "floodZone"]) {
      assert.equal(evidence(decision, id).state, "unavailable");
      assert.equal(evidence(decision, id).severity, "unknown");
      assert.equal(evidence(decision, id).station, undefined);
    }
    assert.equal(decision.forecast.status, "unavailable");
    assert.match(decision.forecast.summary, /ไม่ใช่พยากรณ์/);
    assert.match(decision.timeHorizon, /ยังระบุเวลาน้ำถึงโครงการไม่ได้/);
    for (const horizon of decision.forecast.horizons.slice(1))
      assert.match(horizon.summary, /ยังประเมินผลกระทบล่วงหน้าไม่ได้/);
  }
});

test("input assessment and shared unavailable factors cannot be mutated by decisions", () => {
  const assessment = assessProject(project, [water, rain], 5, now);
  const snapshot = JSON.stringify(assessment);
  const first = projectDecision(assessment);
  evidence(first, "forecast").summary = "changed";
  const second = projectDecision(assessment);
  assert.equal(JSON.stringify(assessment), snapshot);
  assert.notEqual(evidence(second, "forecast").summary, "changed");
});
