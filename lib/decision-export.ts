import { RISK_COLOR, RISK_LABEL, RISK_ORDER, type Assessment, type Feed, type Risk } from "./flood-types.ts";
import { projectDecision } from "./project-decision.ts";

export interface DecisionSnapshot {
  scope: string;
  fetchedAt: string;
  generatedAt: string;
  radius: number;
  demo: boolean;
  total: number;
  counts: Record<Risk, number>;
  projects: {
    name: string;
    risk: Risk;
    why: string;
    impact: string;
    action: string;
    evidence: string;
  }[];
  sources: string;
}

const dateFormat = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok", year: "numeric", month: "short", day: "numeric",
  hour: "2-digit", minute: "2-digit",
});

export function snapshotTime(value: string | null): string {
  return value && Number.isFinite(Date.parse(value))
    ? `${dateFormat.format(new Date(value))} น.`
    : "ไม่ทราบเวลาวัด";
}

export function createDecisionSnapshot({ items, feed, radius, scopeLabel, demo = false }: {
  items: Assessment[]; feed: Feed; radius: number; scopeLabel: string; demo?: boolean;
}, now = new Date().toISOString()): DecisionSnapshot {
  if (!feed.fetchedAt || !Number.isFinite(Date.parse(feed.fetchedAt))) {
    throw new Error("ยังไม่มีข้อมูลสำหรับสร้างภาพสรุป");
  }
  const counts: Record<Risk, number> = { priority: 0, watch: 0, normal: 0, unknown: 0 };
  for (const item of items) counts[item.risk] += 1;
  const projects = [...items].sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]).slice(0, 5).map((item) => {
    const decision = projectDecision(item);
    const evidence = decision.evidence.filter((entry) => ["water", "rain1h", "rain24h"].includes(entry.id)).map((entry) =>
      entry.station
        ? `${entry.label}: ${entry.station.name} · ${snapshotTime(entry.station.observedAt)}${entry.state === "observed" ? "" : " (เวลาไม่ผ่านเกณฑ์)"}`
        : `${entry.label}: ไม่มีค่าที่ใช้ประเมินได้`,
    ).join(" / ");
    return { name: item.project.name, risk: item.risk, why: decision.why, impact: decision.impact, action: decision.action, evidence };
  });
  return {
    scope: scopeLabel, fetchedAt: feed.fetchedAt, generatedAt: now, radius, demo,
    total: items.length, counts, projects,
    sources: feed.sources.length
      ? feed.sources.map((source) => `${source.name}: ${source.state === "ok" ? `ดึงข้อมูล ${snapshotTime(source.fetchedAt)}` : "ดึงข้อมูลไม่สำเร็จ"}`).join(" / ")
      : "ไม่มีสถานะแหล่งข้อมูล",
  };
}

export const SNAPSHOT_LIMITATION = "การประเมินของระบบจากสถานีใกล้เคียง ไม่ใช่ประกาศเตือนภัยอย่างเป็นทางการ และไม่ยืนยันว่าน้ำจะท่วมโครงการ";
export const SNAPSHOT_FORECAST = "ยังไม่มีพยากรณ์ผลกระทบรายโครงการ 48 ชม. / 7 วัน หรือเวลาที่น้ำจะถึง ต้องตรวจสภาพพื้นที่และประกาศทางการประกอบ";

export function escapeMarkup(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

type DrawingCommand =
  | { kind: "text"; x: number; y: number; value: string; size: number; weight: number; color: string }
  | { kind: "rect"; x: number; y: number; width: number; height: number; color: string };
export interface SnapshotDrawing { width: number; height: number; commands: DrawingCommand[] }
type MeasureText = (text: string, size: number, weight: number) => number;

const graphemes = new Intl.Segmenter("th", { granularity: "grapheme" });
function wrappedLines(value: string, width: number, size: number, weight: number, measure: MeasureText): string[] {
  const lines: string[] = [];
  let line = "";
  for (const { segment } of graphemes.segment(value)) {
    if (segment === "\n") { lines.push(line); line = ""; continue; }
    if (line && measure(line + segment, size, weight) > width) { lines.push(line.trimEnd()); line = segment.trimStart(); }
    else line += segment;
  }
  if (line) lines.push(line.trimEnd());
  return lines.length ? lines : [""];
}

export function drawDecisionSnapshot(snapshot: DecisionSnapshot, measure: MeasureText): SnapshotDrawing {
  const width = 1200;
  const commands: DrawingCommand[] = [];
  let y = 58;
  const rect = (x: number, top: number, w: number, height: number, color: string) => commands.push({ kind: "rect", x, y: top, width: w, height, color });
  const text = (value: string, size = 22, color = "#203443", weight = 400, x = 52, maxWidth = 1096) => {
    for (const line of wrappedLines(value, maxWidth, size, weight, measure)) {
      commands.push({ kind: "text", x, y: y + size, value: line, size, weight, color });
      y += size * 1.55;
    }
  };
  rect(0, 0, width, 8, "#b82d3b");
  text("AP WATER WATCH / PROJECT BRIEF", 20, "#b82d3b", 700);
  text(snapshot.demo ? "ข้อมูลสาธิต · สถานการณ์โครงการ" : "สถานการณ์โครงการ", 40, "#203443", 700);
  text(snapshot.scope, 23);
  text(`ดึงข้อมูล ${snapshotTime(snapshot.fetchedAt)} · สร้างภาพ ${snapshotTime(snapshot.generatedAt)}`, 19, "#596e7b");
  text(`คัดกรองสถานีในรัศมี ${snapshot.radius} กม. · ${snapshot.total} โครงการตามตัวกรอง`, 19, "#596e7b");
  y += 15;
  const countTop = y;
  (["priority", "watch", "normal", "unknown"] as const).forEach((risk, index) => {
    const x = 52 + index * 278;
    rect(x, countTop - 9, 252, 4, RISK_COLOR[risk]);
    y = countTop + 18;
    text(String(snapshot.counts[risk]), 39, RISK_COLOR[risk], 700, x, 252);
    text(RISK_LABEL[risk], 18, "#203443", 400, x, 252);
  });
  y = countTop + 125;
  text(snapshot.total > snapshot.projects.length ? `แสดง ${snapshot.projects.length} โครงการแรกตามลำดับที่ควรตรวจสอบ` : "ข้อสรุปและสิ่งที่ควรทำ", 22, "#203443", 700);
  if (snapshot.projects.length === 0) text("ไม่พบโครงการที่ตรงกับตัวกรอง", 23, "#596e7b");
  for (const project of snapshot.projects) {
    y += 14;
    rect(52, y - 9, 1096, 1, "#dce3e8");
    y += 20;
    text(RISK_LABEL[project.risk], 20, RISK_COLOR[project.risk], 700);
    text(project.name, 28, "#203443", 700);
    text(`สาเหตุ · ${project.why}`, 22);
    text(`ผลกระทบ · ${project.impact}`, 22);
    text(`สิ่งที่ควรทำ · ${project.action}`, 22, "#203443", 700);
    text(project.evidence, 17, "#596e7b");
  }
  y += 26;
  rect(52, y - 9, 1096, 2, "#203443");
  y += 24;
  if (snapshot.demo) text("ข้อมูลสาธิตสำหรับทดสอบการแสดงผล ห้ามใช้ตัดสินใจสถานการณ์จริง", 22, "#b82d3b", 700);
  text(SNAPSHOT_LIMITATION, 20, "#203443", 700);
  text(SNAPSHOT_FORECAST, 19, "#596e7b");
  text("เวลาในรายงานเป็นเวลาไทย (UTC+7) · เวลาอัปเดตระบบอาจต่างจากเวลาวัดของแต่ละสถานี", 18, "#596e7b");
  text(snapshot.sources, 17, "#596e7b");
  return { width, height: Math.ceil(y + 35), commands };
}

export function snapshotSvg(drawing: SnapshotDrawing): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${drawing.width}" height="${drawing.height}" viewBox="0 0 ${drawing.width} ${drawing.height}" role="img" aria-label="AP Water Watch สรุปสถานการณ์โครงการ"><rect width="100%" height="100%" fill="#fff"/>${drawing.commands.map((command) => command.kind === "rect"
    ? `<rect x="${command.x}" y="${command.y}" width="${command.width}" height="${command.height}" fill="${command.color}"/>`
    : `<text x="${command.x}" y="${command.y}" font-family="Tahoma, sans-serif" font-size="${command.size}" font-weight="${command.weight}" fill="${command.color}">${escapeMarkup(command.value)}</text>`).join("")}</svg>`;
}

export function snapshotPrintHtml(snapshot: DecisionSnapshot): string {
  const escape = escapeMarkup;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>AP Water Watch · สรุปสถานการณ์โครงการ</title><style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font-family:Tahoma,sans-serif;color:#203443;font-size:11pt;line-height:1.65;margin:0}h1{font-size:23pt;line-height:1.4;margin:0 0 8px}h2{font-size:15pt;margin:3px 0}p{margin:5px 0}.brand{color:#b82d3b;font-weight:bold;letter-spacing:1px}.meta,small{color:#596e7b;font-size:9pt}.counts{display:flex;gap:18px;margin:20px 0;flex-wrap:wrap}.counts b{font-size:17pt}.counts span{display:block;font-size:9pt}article{break-inside:avoid;border-top:1px solid #dce3e8;padding:15px 0}footer{border-top:2px solid #203443;padding-top:12px;margin-top:10px;font-size:9pt}footer p{margin:6px 0}.demo{color:#b82d3b;font-weight:bold}</style></head><body><p class="brand">AP WATER WATCH / PROJECT BRIEF</p><h1>${snapshot.demo ? "ข้อมูลสาธิต · " : ""}สถานการณ์โครงการ</h1><p>${escape(snapshot.scope)}</p><p class="meta">ดึงข้อมูล ${escape(snapshotTime(snapshot.fetchedAt))} · สร้างรายงาน ${escape(snapshotTime(snapshot.generatedAt))}<br>คัดกรองสถานีในรัศมี ${snapshot.radius} กม. · ${snapshot.total} โครงการตามตัวกรอง</p><div class="counts">${(["priority", "watch", "normal", "unknown"] as const).map((risk) => `<div><b style="color:${RISK_COLOR[risk]}">${snapshot.counts[risk]}</b><span>${RISK_LABEL[risk]}</span></div>`).join("")}</div><p class="meta">${snapshot.total > snapshot.projects.length ? `แสดง ${snapshot.projects.length} โครงการแรกตามลำดับที่ควรตรวจสอบ` : "ข้อสรุปและสิ่งที่ควรทำ"}</p>${snapshot.projects.map((project) => `<article><small style="color:${RISK_COLOR[project.risk]}">${RISK_LABEL[project.risk]}</small><h2>${escape(project.name)}</h2><p>สาเหตุ · ${escape(project.why)}</p><p>ผลกระทบ · ${escape(project.impact)}</p><p><b>สิ่งที่ควรทำ · ${escape(project.action)}</b></p><p class="meta">${escape(project.evidence)}</p></article>`).join("") || "<p>ไม่พบโครงการที่ตรงกับตัวกรอง</p>"}<footer>${snapshot.demo ? '<p class="demo">ข้อมูลสาธิตสำหรับทดสอบการแสดงผล ห้ามใช้ตัดสินใจสถานการณ์จริง</p>' : ""}<p><b>${SNAPSHOT_LIMITATION}</b></p><p>${SNAPSHOT_FORECAST}</p><p>เวลาไทย (UTC+7) · เวลาอัปเดตระบบอาจต่างจากเวลาวัดของแต่ละสถานี</p><p>${escape(snapshot.sources)}</p></footer></body></html>`;
}
