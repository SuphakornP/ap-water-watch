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
const dwr = {
  id: "dwr-STN001", code: "STN001", name: "สถานี DWR ทดสอบ", province: "ทดสอบ", district: "", subdistrict: "",
  lat: 13.8, lng: 100.51, kind: "water", reportAt: "2026-10-06T05:50:00Z", reportTimeKind: "warning",
  alertStatus: 3, alertIssuedAt: "2026-10-06T05:50:00Z", warningType: "rain",
  rain15m: 12.3, rain12h: 45.6, rainDaily07: 78.9, waterLevel: 1.23, sourceUrl: "https://ews.dwr.go.th/ews/index.php",
};

test("DWR exports preserve periods and warning context without changing project risk or confidence", () => {
  const item = assess([water, rain]);
  const original = snapshot([item]);
  const report = snapshot([item], { mode: "project", projectId: project.id, feed: { ...feed, dwr: { stations: [dwr], fetchedAt: now } } });
  assert.equal(report.projects[0].risk, original.projects[0].risk);
  assert.equal(report.projects[0].confidence, original.projects[0].confidence);
  assert.deepEqual(report.projects[0].metrics, original.projects[0].metrics);
  const drawing = drawDecisionSnapshot(report, (value, size) => [...value].length * size * 0.45);
  const imageText = drawing.commands.filter((command) => command.kind === "text").map((command) => command.value).join(" ");
  for (const output of [snapshotPrintHtml(report), imageText]) {
    for (const phrase of ["ฝน 15 นาที 12.3", "ฝน 12 ชม. 45.6", "ฝนรายวัน ณ 07:00 78.9", "ยังไม่ยืนยันจุดอ้างอิง", "ค่าประกอบรายงานเตือน", "หลักฐานอิสระซ้ำ"]) {
      assert.ok(output.replaceAll(/\s/g, "").includes(phrase.replaceAll(/\s/g, "")), phrase);
    }
  }
});

test("DWR stale readings, missing coverage and failed collection stay distinct in exports", () => {
  const item = assess([water, rain]);
  const stale = snapshot([item], { feed: { ...feed, dwr: { stations: [{ ...dwr, reportAt: "2026-10-05T05:50:00Z", name: "<img src=x>" }], fetchedAt: now } } });
  const html = snapshotPrintHtml(stale);
  assert.match(html, /ข้อมูลเก่า/);
  assert.ok(!html.includes("12.3"));
  assert.ok(!html.includes("45.6"));
  assert.ok(!html.includes("<img src=x>"));
  assert.ok(html.includes("&lt;img src=x&gt;"));
  const absent = snapshot([item], { feed: { ...feed, dwr: { stations: [{ ...dwr, lat: 18 }], fetchedAt: now } } });
  assert.match(absent.projects[0].dwrEvidence[0], /ไม่พบสถานี/);
  assert.match(absent.projects[0].dwrEvidence[0], /ไม่ใช่การยืนยันความปลอดภัย/);
  const failed = snapshot([item], { feed: { ...feed, sources: [{ id: "dwr-ews", name: "DWR", state: "error", count: 0, fetchedAt: now }] } });
  assert.match(failed.projects[0].dwrEvidence[0], /เชื่อมต่อข้อมูลไม่ได้/);
  assert.ok(!failed.projects[0].dwrEvidence[0].includes("ไม่พบสถานี"));
});

test("DWR exports disclose warnings beyond the three nearest detailed stations", () => {
  const stations = [0, 1, 2, 3].map((index) => ({ ...dwr, id: `dwr-${index}`, code: `STN000${index}`, name: `สถานี ${index}`, lng: 100.501 + index / 1000, alertStatus: index === 3 ? 3 : 0 }));
  const report = snapshot([assess([water, rain])], { feed: { ...feed, dwr: { stations, fetchedAt: now } } });
  assert.match(report.projects[0].dwrEvidence[0], /มี 4 สถานี/);
  assert.match(report.projects[0].dwrEvidence[0], /1 สถานะเตือน/);
  assert.match(report.projects[0].dwrEvidence[0], /3 สถานีใกล้ที่สุด/);
  assert.match(snapshotPrintHtml(report), /ตรวจสถานีที่เหลือบนแผนที่/);
});

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
  assert.equal(drawing.width, 1080);
  assert.ok(drawing.commands.every((command) => command.y < drawing.height));
});

test("project mode exports the selected project beyond the portfolio top five without counts", () => {
  const items = Array.from({ length: 7 }, (_, index) => assessProject(
    { ...project, id: `project-${index}`, name: `โครงการ ${index}` },
    index === 6 ? [water, rain] : [{ ...water, status: 5 }], 5, Date.parse(now),
  ));
  const report = snapshot(items, { mode: "project", projectId: "project-6" });
  assert.equal(report.mode, "project");
  assert.equal(report.total, 1);
  assert.equal(report.projects.length, 1);
  assert.equal(report.projects[0].id, "project-6");
  assert.equal(report.projects[0].risk, "normal");
  assert.equal(report.projects[0].actions.length, 3);
  const html = snapshotPrintHtml(report);
  assert.ok(!html.includes('<div class="counts">'));
  assert.ok(!html.includes("โครงการ 0"));
  const drawing = drawDecisionSnapshot(report, (value, size) => [...value].length * size * 0.45);
  assert.ok(!drawing.commands.some((entry) => entry.kind === "text" && entry.value === "1 โครงการตามตัวกรอง"));
  assert.throws(() => snapshot(items, { mode: "project", projectId: "missing" }), /ไม่พบโครงการ/);
  assert.throws(() => snapshot(items, { mode: "project" }), /ไม่พบโครงการ/);
});

test("numeric water metrics preserve direction relative to a real bank datum and label MSL fallback", () => {
  const metric = (station) => snapshot([assess([station, rain])]).projects[0].metrics[0];
  const below = metric(water);
  assert.equal(below.value, 2);
  assert.equal(below.displayValue, "2.00");
  assert.equal(below.unit, "ม. ต่ำกว่าตลิ่ง");
  const above = metric({ ...water, value: 3.65, status: 5 });
  assert.equal(above.value, -0.65);
  assert.equal(above.displayValue, "0.65");
  assert.equal(above.unit, "ม. สูงกว่าตลิ่ง");
  assert.equal(metric({ ...water, value: 3 }).unit, "ม. เท่าระดับตลิ่ง");
  for (const bank of [null, Number.NaN, Number.POSITIVE_INFINITY]) {
    const fallback = metric({ ...water, bank });
    assert.equal(fallback.value, 1);
    assert.equal(fallback.unit, "ม.รทก. (MSL)");
    assert.match(fallback.context, /ไม่ใช่ความลึกน้ำท่วม/);
  }
});

test("hourly and daily numbers each keep their selected station, time, distance and source", () => {
  const hourly = { ...rain, id: "hourly", name: "สถานีรายชั่วโมง", source: "Hourly Agency", rain1h: 65.2, value: 10, observedAt: "2026-10-06T05:20:00Z" };
  const daily = { ...rain, id: "daily", name: "สถานีรายวัน", source: "Daily Agency", rain1h: 1.5, value: 101.5, observedAt: "2026-10-06T05:40:00Z" };
  const report = snapshot([assess([water, hourly, daily])]);
  const metrics = report.projects[0].metrics;
  assert.deepEqual(metrics.map((metric) => metric.value), [2, 65.2, 101.5]);
  assert.deepEqual(metrics.slice(1).map((metric) => [metric.stationName, metric.observedAt, metric.source]), [
    [hourly.name, hourly.observedAt, hourly.source], [daily.name, daily.observedAt, daily.source],
  ]);
  assert.ok(metrics.every((metric) => metric.distance > 0 && metric.distance <= 5));
  const html = snapshotPrintHtml({ ...report, mode: "project" });
  assert.match(html, /65\.2/);
  assert.match(html, /101\.5/);
  assert.match(html, /Hourly Agency/);
  assert.match(html, /Daily Agency/);
});

test("partial rainfall never substitutes an hourly value for daily data or treats missing as zero", () => {
  const report = snapshot([assess([water, { ...rain, rain1h: 28, value: null }])]);
  const metrics = report.projects[0].metrics;
  assert.equal(report.projects[0].risk, "watch");
  assert.equal(metrics[1].value, 28);
  assert.equal(metrics[2].value, null);
  assert.equal(metrics[2].displayValue, "ไม่มีค่า");
  assert.equal(metrics[2].state, "missing");
  assert.match(report.projects[0].confidence, /บางส่วน/);
});

test("export rechecks freshness even when assessment was produced earlier", () => {
  const items = [assess([{ ...water, status: 5 }, { ...rain, rain1h: 125.3, value: 190.7 }])];
  const report = createDecisionSnapshot({ items, feed, radius: 5, scopeLabel: "ทดสอบ", mode: "project", projectId: project.id }, "2026-10-06T13:00:00Z");
  assert.equal(items[0].risk, "priority");
  assert.equal(report.projects[0].risk, "unknown");
  assert.ok(report.projects[0].metrics.every((metric) => metric.state === "stale" && metric.value === null));
  assert.ok(report.projects[0].metrics.every((metric) => metric.displayValue === "ใช้ไม่ได้"));
  assert.ok(report.projects[0].metrics.every((metric) => metric.observedAt === water.observedAt));
  const html = snapshotPrintHtml(report);
  assert.ok(!html.includes("125.3"));
  assert.ok(!html.includes("190.7"));
  assert.match(html, /เวลาไม่ผ่านเกณฑ์/);
  assert.match(html, /ไม่มีการอัปเดตหรือแจ้งเตือนอัตโนมัติในภาพ/);
});

test("long Thai names wrap intact, all drawing content stays within bounds, and export scopes remain distinct", () => {
  const name = "โครงการสาธิตอรุณรุ่งโซนตะวันออก DEMO RESIDENCE โครงการทดสอบชื่อยาวสำหรับติดตามสถานการณ์";
  const report = snapshot([assess([{ ...water, name: name + name }, rain], name)], { mode: "project", projectId: project.id });
  const measure = (value, size) => [...new Intl.Segmenter("th", { granularity: "grapheme" }).segment(value)].length * size * 0.6;
  const drawing = drawDecisionSnapshot(report, measure);
  const nameLines = drawing.commands.filter((entry) => entry.kind === "text" && entry.size === 48);
  assert.ok(nameLines.length > 1);
  assert.equal(nameLines.map((entry) => entry.value).join("").replaceAll(" ", ""), name.replaceAll(" ", ""));
  for (const command of drawing.commands) {
    assert.ok(command.y >= 0 && command.y < drawing.height);
    if (command.kind === "rect") {
      assert.ok(command.x + command.width <= drawing.width);
      assert.ok(command.y + command.height <= drawing.height);
    } else assert.ok(command.x + measure(command.value, command.size) <= drawing.width - 30, command.value);
  }
  const portfolio = snapshot([], { scopeLabel: "นนทบุรี · เฝ้าระวัง", mode: "portfolio" });
  assert.equal(portfolio.scope, "นนทบุรี · เฝ้าระวัง");
  assert.match(snapshotPrintHtml(portfolio), /ไม่พบโครงการที่ตรงกับตัวกรอง/);
  assert.match(snapshotPrintHtml(portfolio), /นนทบุรี · เฝ้าระวัง/);
});

test("long numerical measurements fit their card without splitting a number across lines", () => {
  const report = snapshot([assess([{ ...water, value: 123456789.12, bank: null }, rain])], { mode: "project", projectId: project.id });
  const measure = (value, size) => [...value].length * size * 0.6;
  const drawing = drawDecisionSnapshot(report, measure);
  const valueCommand = drawing.commands.find((entry) => entry.kind === "text" && entry.value === "123456789.12");
  assert.ok(valueCommand, "the complete numeric value must stay on a single line");
  assert.ok(valueCommand.size < 54);
  assert.ok(measure(valueCommand.value, valueCommand.size) <= (1080 - 104 - 32) / 3 - 36 + 0.001);
});
