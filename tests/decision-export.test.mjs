import test from "node:test";
import assert from "node:assert/strict";
import { assessProject } from "../lib/assessment.ts";
import {
  createDecisionSnapshot,
  drawDecisionSnapshot,
  snapshotPrintHtml,
  snapshotSvg,
  snapshotTime,
  SNAPSHOT_FORECAST,
  SNAPSHOT_LIMITATION,
} from "../lib/decision-export.ts";

const now = "2026-10-06T06:00:00Z";
const project = {
  id: "project-1", slug: "project-1", name: "โครงการทดสอบ", code: "T", brand: "Test",
  lat: 13.8, lng: 100.5, address: "", province: null, region: null, zone: null, salesStatus: "normal",
};
const water = {
  id: "water-1", kind: "water", name: "สถานีน้ำ", lat: 13.8, lng: 100.51,
  province: "", value: 1, bank: 3, status: 3, rain1h: null,
  observedAt: "2026-10-06T05:50:00Z", source: "ThaiWater",
};
const rain = { ...water, id: "rain-1", kind: "rain", name: "สถานีฝน", value: 0, rain1h: 0, bank: null, status: null };
const feed = {
  stations: [], fetchedAt: now, warning: null,
  sources: [{ id: "water", name: "ThaiWater", url: "https://example.org", state: "error", count: 0, fetchedAt: now }],
};
const assess = (stations, name = project.name) => assessProject({ ...project, name }, stations, 5, Date.parse(now));
const snapshot = (items, options = {}) => createDecisionSnapshot({ items, feed, radius: 5, scopeLabel: "ทุกโครงการตามตัวกรอง", ...options }, now);

test("export keeps complete filtered totals while showing the five highest priorities", () => {
  const items = [
    assess([water, rain], "ปกติ 1"), assess([water, rain], "ปกติ 2"),
    assess([], "ไม่ทราบ 1"), assess([], "ไม่ทราบ 2"),
    assess([{ ...water, status: 4 }], "เฝ้าระวัง 1"),
    assess([{ ...rain, rain1h: 60 }], "เร่งด่วน 1"),
    assess([{ ...water, status: 5 }], "เร่งด่วน 2"),
  ];
  const report = snapshot(items);
  assert.equal(report.total, 7);
  assert.deepEqual(report.counts, { priority: 2, watch: 1, unknown: 2, normal: 2 });
  assert.deepEqual(report.projects.map((item) => item.name), ["เร่งด่วน 1", "เร่งด่วน 2", "เฝ้าระวัง 1", "ไม่ทราบ 1", "ไม่ทราบ 2"]);
  assert.equal(items[0].project.name, "ปกติ 1", "export must not reorder the dashboard's source array");
  assert.match(snapshotPrintHtml(report), /แสดง 5 โครงการแรก/);
});

test("export carries distinct hourly and daily evidence timestamps", () => {
  const hourly = { ...rain, id: "hourly", name: "ฝนรายชั่วโมง", rain1h: 60, value: 1, observedAt: "2026-10-06T05:20:00Z" };
  const daily = { ...rain, id: "daily", name: "ฝนสะสมรายวัน", rain1h: 0, value: 100, observedAt: "2026-10-06T05:40:00Z" };
  const report = snapshot([assess([water, hourly, daily])]);
  assert.match(report.projects[0].evidence, /ฝนรายชั่วโมง/);
  assert.match(report.projects[0].evidence, /ฝนสะสมรายวัน/);
  assert.ok(report.projects[0].evidence.includes(snapshotTime(hourly.observedAt)));
  assert.ok(report.projects[0].evidence.includes(snapshotTime(daily.observedAt)));
  assert.match(report.sources, /ดึงข้อมูลไม่สำเร็จ/);
});

test("missing and stale observations remain unknown in image and print reports", () => {
  const staleWater = { ...water, status: 5, observedAt: "2026-10-05T06:00:00Z" };
  const report = snapshot([assess([staleWater])]);
  assert.equal(report.projects[0].risk, "unknown");
  assert.equal(report.counts.normal, 0);
  assert.match(report.projects[0].evidence, /เวลาไม่ผ่านเกณฑ์/);
  assert.match(report.projects[0].evidence, /ไม่มีค่าที่ใช้ประเมินได้/);
  const html = snapshotPrintHtml(report);
  assert.ok(html.includes(SNAPSHOT_LIMITATION));
  assert.ok(html.includes(SNAPSHOT_FORECAST));
  assert.throws(() => snapshot([], { feed: { ...feed, fetchedAt: "" } }), /ยังไม่มีข้อมูล/);
  assert.throws(() => snapshot([], { feed: { ...feed, fetchedAt: "invalid" } }), /ยังไม่มีข้อมูล/);
});

test("downloaded SVG and print HTML escape upstream names and preserve demo limitations", () => {
  const injected = '<script>alert("x")</script> & โครงการ';
  const report = snapshot([assess([], injected)], { demo: true, scopeLabel: injected });
  const drawing = drawDecisionSnapshot(report, (value, size) => [...value].length * size * 0.45);
  const svg = snapshotSvg(drawing);
  const html = snapshotPrintHtml(report);
  for (const output of [svg, html]) {
    assert.ok(!output.includes("<script>"));
    assert.ok(output.includes("&lt;script&gt;"));
    assert.ok(output.includes("&amp;"));
    assert.match(output, /ข้อมูลสาธิต/);
    assert.match(output, /ห้ามใช้ตัดสินใจสถานการณ์จริง/);
  }
  assert.equal(drawing.width, 1200);
  assert.ok(drawing.commands.every((command) => command.y < drawing.height));
});
