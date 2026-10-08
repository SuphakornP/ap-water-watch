import test from "node:test";
import assert from "node:assert/strict";
import { assessProject, representativeWater, waterRisk } from "../lib/assessment.ts";
import { stationRisk } from "../lib/map-signals.ts";
import { projectDecision } from "../lib/project-decision.ts";
import { createDecisionSnapshot, snapshotPrintHtml } from "../lib/decision-export.ts";

const now = "2026-10-08T06:00:00Z";
const nowMs = Date.parse(now);
const project = {
  id: "threshold-test", slug: "threshold-test", name: "Synthetic threshold test",
  code: "T", brand: "Test", lat: 13.8, lng: 100.5, address: "",
  province: null, region: null, zone: null, salesStatus: "normal",
};
const water = {
  id: "water", kind: "water", name: "Water gauge", lat: 13.8, lng: 100.51,
  province: "", value: 3.02, bank: 3, status: 5, rain1h: null,
  observedAt: "2026-10-08T05:50:00Z", source: "ThaiWater",
};
const rain = {
  ...water, id: "rain", kind: "rain", name: "Rain gauge",
  value: 0, rain1h: 0, bank: null, status: null,
};
const assess = (stations) => assessProject(project, stations, 5, nowMs);
const waterEvidence = (assessment) => projectDecision(assessment).evidence.find((entry) => entry.id === "water");
const snapshot = (assessment) => createDecisionSnapshot({
  items: [assessment], radius: 5, scopeLabel: "Synthetic threshold test",
  mode: "project", projectId: project.id,
  feed: { stations: [], fetchedAt: now, warning: null, sources: [] },
}, now);

test("water screening uses an inclusive 10 cm threshold before display rounding", () => {
  for (const [bank, value, expected] of [
    [3, 3.02, "watch"], [3, 3.05, "watch"], [3, 3.09, "watch"],
    [3, 3.099, "watch"], [3, 3.099999, "watch"],
    [3, 3.10, "priority"], [3, 3.11, "priority"],
    [2.3, 2.4, "priority"], [100.2, 100.3, "priority"],
    [0, 0.10, "priority"], [-0.3, -0.2, "priority"],
  ]) {
    const station = { ...water, bank, value };
    const assessment = assess([station, rain]);
    const label = `${value} - ${bank}`;
    assert.equal(waterRisk(station), expected, label);
    assert.equal(stationRisk(station, nowMs), expected, label);
    assert.equal(assessment.risk, expected, label);
    assert.equal(waterEvidence(assessment).severity, expected, label);
  }
});

test("reported overflow without a confirmed positive bank difference stays watch", () => {
  for (const bank of [null, Number.NaN, Number.POSITIVE_INFINITY, 3.02, 4]) {
    const station = { ...water, bank };
    const assessment = assess([station, rain]);
    assert.equal(assessment.risk, "watch");
    assert.equal(stationRisk(station, nowMs), "watch");
    assert.equal(waterEvidence(assessment).severity, "watch");
    assert.match(assessment.reason, /ยังยืนยันส่วนต่างระดับน้ำกับตลิ่งไม่ได้/);
    assert.match(waterEvidence(assessment).summary, /ยังยืนยันส่วนต่างระดับน้ำกับตลิ่งไม่ได้/);
    assert.equal(snapshot(assessment).projects[0].risk, "watch");
  }
});

test("the urgent station wins across assessment, displayed water, decision and export", () => {
  const urgent = { ...water, id: "far-urgent", name: "Far urgent gauge", lat: 13.82, value: 3.10 };
  const assessment = assess([water, rain, urgent]);
  assert.equal(assessment.water[0].id, water.id);
  assert.equal(assessment.risk, "priority");
  assert.equal(assessment.trigger.id, urgent.id);
  assert.equal(representativeWater(assessment).id, urgent.id);
  assert.equal(waterEvidence(assessment).station.id, urgent.id);
  const report = snapshot(assessment);
  assert.equal(report.projects[0].metrics[0].stationName, urgent.name);
  assert.equal(report.projects[0].metrics[0].severity, "priority");
  assert.match(report.projects[0].why, /อย่างน้อย 0\.10 ม\./);
});

test("a 2 cm overflow exports watch while preserving the observed numeric level", () => {
  const assessment = assess([water, rain]);
  assert.equal(representativeWater(assessment).id, water.id);
  const report = snapshot(assessment);
  assert.equal(report.projects[0].risk, "watch");
  assert.equal(report.projects[0].metrics[0].severity, "watch");
  assert.equal(report.projects[0].metrics[0].displayValue, "0.02");
  assert.equal(report.projects[0].metrics[0].unit, "ม. สูงกว่าตลิ่ง");
  assert.match(snapshotPrintHtml(report), /ควรเฝ้าระวัง/);
  assert.match(report.projects[0].why, /ยังไม่ถึง 0\.10 ม\./);
});

test("freshness, missing readings and other water statuses keep their existing meaning", () => {
  for (const observedAt of [null, "2026-10-07T06:00:00Z", "2026-10-08T06:16:00Z"]) {
    const station = { ...water, value: 3.20, observedAt };
    const assessment = assess([station, rain]);
    assert.equal(assessment.risk, "unknown");
    assert.equal(stationRisk(station, nowMs), "unknown");
    assert.equal(waterEvidence(assessment).severity, "unknown");
  }
  for (const value of [null, Number.NaN, Number.POSITIVE_INFINITY]) {
    const station = { ...water, value };
    assert.equal(assess([station, rain]).risk, "unknown");
    assert.equal(stationRisk(station, nowMs), "unknown");
  }
  for (const status of [1, 2, 3, 4]) {
    const station = { ...water, status, value: 2.90 };
    const expected = status === 4 ? "watch" : "normal";
    assert.equal(assess([station, rain]).risk, expected);
    assert.equal(stationRisk(station, nowMs), expected);
  }
});

test("severe rain retains priority when nearby overflow is below 10 cm", () => {
  for (const station of [{ ...rain, rain1h: 50.1 }, { ...rain, value: 90.1 }]) {
    const assessment = assess([water, station]);
    assert.equal(assessment.risk, "priority");
    assert.equal(assessment.trigger.id, rain.id);
    assert.equal(waterEvidence(assessment).severity, "watch");
    assert.equal(projectDecision(assessment).compoundSignals, true);
  }
});
