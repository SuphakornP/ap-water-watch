import { assessProject, bankMargin } from "./assessment.ts";
import { RISK_COLOR, RISK_LABEL, RISK_ORDER, type Assessment, type Feed, type Risk } from "./flood-types.ts";
import { projectDecision, type DecisionEvidence } from "./project-decision.ts";
import { dwrStatusLabel, nearbyDwrStations } from "./dwr-context.ts";

export type SnapshotMode = "project" | "portfolio";
export interface SnapshotMetric {
  id: "water" | "rain1h" | "rain24h";
  label: string;
  state: DecisionEvidence["state"];
  value: number | null;
  displayValue: string;
  unit: string;
  context: string;
  severity: Risk;
  stationName: string | null;
  observedAt: string | null;
  source: string | null;
  distance: number | null;
}
export interface SnapshotProject {
  id: string;
  name: string;
  code: string;
  province: string | null;
  risk: Risk;
  headline: string;
  confidence: string;
  why: string;
  impact: string;
  action: string;
  actions: string[];
  evidence: string;
  metrics: SnapshotMetric[];
  dwrEvidence: string[];
}
export interface DecisionSnapshot {
  mode: SnapshotMode;
  scope: string;
  fetchedAt: string;
  generatedAt: string;
  radius: number;
  demo: boolean;
  total: number;
  counts: Record<Risk, number>;
  projects: SnapshotProject[];
  sources: string;
  nextReview: string;
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

const actions: Record<Risk, string[]> = {
  priority: ["ติดต่อทีมโครงการ ยืนยันน้ำขังและทางเข้า–ออก", "ตรวจปั๊มน้ำ ไฟสำรอง และจุดระบายน้ำ", "เตรียมอุปกรณ์สำคัญและเส้นทางปลอดภัย"],
  watch: ["ตรวจท่อระบาย บ่อพัก และจุดต่ำในโครงการ", "เตรียมปั๊มน้ำและตรวจความพร้อมอุปกรณ์", "ติดตามค่ารอบถัดไปและประกาศท้องถิ่น"],
  normal: ["ยืนยันสภาพพื้นที่กับทีมโครงการ", "ตรวจทางระบายน้ำและอุปกรณ์ตามรอบ", "ติดตามค่ารอบถัดไปและประกาศท้องถิ่น"],
  unknown: ["ขอข้อมูลล่าสุดและภาพหน้างานจากทีมโครงการ", "ตรวจจุดน้ำขังและความพร้อมระบบระบายน้ำ", "ตรวจประกาศท้องถิ่นและรอข้อมูลรอบถัดไป"],
};
const finite = (value: number | null | undefined): value is number => value !== null && value !== undefined && Number.isFinite(value);

function snapshotMetric(entry: DecisionEvidence): SnapshotMetric {
  if (entry.id !== "water" && entry.id !== "rain1h" && entry.id !== "rain24h") throw new Error("ชนิดข้อมูลไม่รองรับในภาพสรุป");
  const station = entry.station;
  const metric: SnapshotMetric = {
    id: entry.id,
    label: entry.id === "water" ? "ระดับน้ำที่สถานี" : entry.id === "rain1h" ? "ฝน 1 ชั่วโมง" : "ฝนสะสม 24 ชั่วโมง",
    state: entry.state, value: null, displayValue: entry.state === "stale" ? "ใช้ไม่ได้" : "ไม่มีค่า",
    unit: "ไม่มีค่าที่ใช้ประเมินได้",
    context: entry.state === "stale" ? "เวลาวัดไม่ผ่านเกณฑ์ · ไม่นำมาประเมิน" : "ยังไม่มีข้อมูลที่ใช้ประเมินได้ในรัศมีนี้",
    severity: entry.severity,
    stationName: station?.name ?? null, observedAt: station?.observedAt ?? null,
    source: station?.source ?? null, distance: station?.distance ?? null,
  };
  if (entry.state !== "observed" || !station) return metric;
  if (entry.id === "water") {
    const margin = finite(station.bank) && finite(station.value) ? bankMargin(station) : null;
    if (margin !== null) {
      metric.value = margin;
      metric.displayValue = Math.abs(margin).toFixed(2);
      metric.unit = margin > 0 ? "ม. ต่ำกว่าตลิ่ง" : margin < 0 ? "ม. สูงกว่าตลิ่ง" : "ม. เท่าระดับตลิ่ง";
      metric.context = "ส่วนต่างระดับน้ำกับตลิ่ง ณ สถานี";
    } else {
      metric.value = station.value;
      metric.displayValue = finite(station.value) ? station.value.toFixed(2) : "ไม่มีค่า";
      metric.unit = "ม.รทก. (MSL)";
      metric.context = "ไม่มีระดับตลิ่งอ้างอิง · ไม่ใช่ความลึกน้ำท่วม";
    }
  } else {
    metric.value = entry.id === "rain1h" ? station.rain1h : station.value;
    metric.displayValue = finite(metric.value) ? metric.value.toFixed(1) : "ไม่มีค่า";
    metric.unit = entry.id === "rain1h" ? "มม. / 1 ชม." : "มม. / 24 ชม.";
    metric.context = entry.severity === "priority" ? "เข้าเกณฑ์ตรวจสอบเร่งด่วน" : entry.severity === "watch" ? "เข้าเกณฑ์เฝ้าระวัง" : "ยังไม่เข้าเกณฑ์เฝ้าระวัง";
  }
  return metric;
}

function metricProvenance(metric: SnapshotMetric): string {
  return metric.stationName
    ? `${metric.stationName} · ${snapshotTime(metric.observedAt)} · ${metric.source ?? "ไม่ทราบแหล่งข้อมูล"}${metric.distance !== null ? ` · ห่าง ${metric.distance.toFixed(1)} กม.` : ""}${metric.state === "stale" ? " (เวลาไม่ผ่านเกณฑ์)" : ""}`
    : "ไม่มีค่าที่ใช้ประเมินได้";
}

function dwrEvidence(item: Assessment, feed: Feed, radius: number, now: string): string[] {
  if (!feed.dwr) return feed.sources.some(source => source.id === "dwr-ews") ? ["DWR: เชื่อมต่อข้อมูลไม่ได้ในรอบนี้ ยังสรุปสถานะจากแหล่งนี้ไม่ได้"] : [];
  if (item.project.lat === null || item.project.lng === null) return ["DWR: โครงการไม่มีพิกัดสำหรับจับคู่สถานี ยังสรุปข้อมูลใกล้โครงการไม่ได้"];
  const nearby = nearbyDwrStations(item.project, feed.dwr.stations, radius, Date.parse(now));
  if (!nearby.length) return [`DWR: ไม่พบสถานีในรัศมี ${radius} กม. · ไม่ใช่การยืนยันความปลอดภัย`];
  const currentWarnings = nearby.filter(station => station.fresh && [1, 2, 3].includes(station.alertStatus ?? -1)).length;
  const coverage = `DWR ในระยะ ${radius} กม. มี ${nearby.length} สถานี · ${currentWarnings} สถานะเตือนที่รายงานไม่เกิน 6 ชม.${nearby.length > 3 ? " · แสดงรายละเอียด 3 สถานีใกล้ที่สุด ตรวจสถานีที่เหลือบนแผนที่" : ""}`;
  return [coverage, ...nearby.slice(0, 3).map(station => {
    const readings = station.fresh ? [
      station.rain15m !== null ? `ฝน 15 นาที ${station.rain15m.toFixed(1)} มม.` : "",
      station.rain12h !== null ? `ฝน 12 ชม. ${station.rain12h.toFixed(1)} มม.` : "",
      station.rainDaily07 !== null ? `ฝนรายวัน ณ 07:00 ${station.rainDaily07.toFixed(1)} มม.` : "",
      station.waterLevel !== null ? `ระดับน้ำ ${station.waterLevel.toFixed(2)} ม. (ยังไม่ยืนยันจุดอ้างอิง ไม่ใช่ ม.รทก.)` : "",
    ].filter(Boolean).join(" · ") : "ข้อมูลเก่าหรือไม่ทราบเวลา ไม่แสดงเป็นค่าปัจจุบัน";
    return `DWR ${station.code} ${station.name} · ${station.distance.toFixed(1)} กม. · ${dwrStatusLabel(station.alertStatus, station.fresh)} · ${station.reportTimeKind === "warning" ? "ค่าประกอบรายงานเตือน" : "รายงาน"} ${snapshotTime(station.reportAt)} · ${readings}`;
  }), "สถานะ DWR เป็นข้อมูลประกอบ ใช้เกณฑ์ต่างจากสีโครงการ และไม่นับสถานีเดียวกับ ThaiWater เป็นหลักฐานอิสระซ้ำ"];
}

export function createDecisionSnapshot({ items, feed, radius, scopeLabel, demo = false, mode = "portfolio", projectId }: {
  items: Assessment[]; feed: Feed; radius: number; scopeLabel: string; demo?: boolean; mode?: SnapshotMode; projectId?: string;
}, now = new Date().toISOString()): DecisionSnapshot {
  if (!feed.fetchedAt || !Number.isFinite(Date.parse(feed.fetchedAt)) || !Number.isFinite(Date.parse(now))) throw new Error("ยังไม่มีข้อมูลสำหรับสร้างภาพสรุป");
  let scoped = items;
  if (mode === "project") {
    const selected = items.find((item) => item.project.id === projectId);
    if (!selected) throw new Error("ไม่พบโครงการที่เลือกสำหรับสร้างภาพสรุปรายโครงการ");
    scoped = [selected];
  }
  // Recheck age at export time: an open dashboard may outlive a reading's freshness window.
  const current = scoped.map((item) => assessProject(item.project, [...item.water, ...item.rain], radius, Date.parse(now)));
  const counts: Record<Risk, number> = { priority: 0, watch: 0, normal: 0, unknown: 0 };
  for (const item of current) counts[item.risk] += 1;
  const projects = [...current].sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]).slice(0, 5).map((item): SnapshotProject => {
    const decision = projectDecision(item);
    const metrics = decision.evidence.filter((entry) => entry.id === "water" || entry.id === "rain1h" || entry.id === "rain24h").map(snapshotMetric);
    return {
      id: item.project.id, name: item.project.name, code: item.project.code, province: item.project.province,
      risk: item.risk, headline: decision.headline, confidence: decision.confidenceLabel,
      why: decision.why, impact: decision.impact, action: decision.action, actions: [...actions[item.risk]], metrics,
      dwrEvidence: dwrEvidence(item, feed, radius, now),
      evidence: metrics.map((metric) => `${metric.label}: ${metricProvenance(metric)}`).join(" / "),
    };
  });
  return {
    mode, scope: scopeLabel, fetchedAt: feed.fetchedAt, generatedAt: now, radius, demo,
    total: current.length, counts, projects,
    nextReview: "ตรวจค่ารอบถัดไป · รับข้อมูลทุก 5 นาทีเมื่อเปิดหน้า Dashboard",
    sources: feed.sources.length
      ? feed.sources.map((source) => `${source.name}: ${source.state === "ok" ? `ดึงข้อมูล ${snapshotTime(source.fetchedAt)}` : `ดึงข้อมูลไม่สำเร็จ · ตรวจเมื่อ ${snapshotTime(source.fetchedAt)}`}`).join(" / ")
      : "ไม่มีสถานะแหล่งข้อมูล",
  };
}

export const SNAPSHOT_FONT_FAMILY = "Tahoma, sans-serif";
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

const INK = "#203443", DIM = "#596e7b", LINE = "#dce3e8";
const riskTint: Record<Risk, string> = { priority: "#fff0f1", watch: "#fff6e8", normal: "#edf8f3", unknown: "#f0f3f7" };

export function drawDecisionSnapshot(snapshot: DecisionSnapshot, measure: MeasureText): SnapshotDrawing {
  const width = 1080, inset = 52, contentWidth = width - inset * 2;
  const commands: DrawingCommand[] = [];
  let y = 40;
  const rect = (x: number, top: number, w: number, height: number, color: string) => commands.push({ kind: "rect", x, y: top, width: w, height, color });
  const textAt = (value: string, top: number, size = 22, color = INK, weight = 400, x = inset, maxWidth = contentWidth) => {
    const lines = wrappedLines(value, maxWidth, size, weight, measure);
    for (const [index, line] of lines.entries()) commands.push({ kind: "text", x, y: top + size + index * size * 1.4, value: line, size, weight, color });
    return top + lines.length * size * 1.4;
  };
  const text = (value: string, size = 22, color = INK, weight = 400, x = inset, maxWidth = contentWidth) => { y = textAt(value, y, size, color, weight, x, maxWidth); };
  const gap = (amount = 18) => { y += amount; };
  const rule = () => { rect(inset, y, contentWidth, 1, LINE); gap(20); };
  rect(0, 0, width, 9, "#b82d3b");
  text(`AP WATER WATCH / ${snapshot.mode === "project" ? "PROJECT BRIEF" : "PORTFOLIO BRIEF"}`, 19, "#b82d3b", 700);
  if (snapshot.demo) { gap(7); text("ข้อมูลสาธิต · ห้ามใช้ตัดสินใจสถานการณ์จริง", 21, "#b82d3b", 700); }
  gap(16);

  if (snapshot.mode === "project") {
    const project = snapshot.projects[0];
    if (!project) throw new Error("ไม่มีข้อมูลโครงการในภาพสรุป");
    text("สรุปติดตามรายโครงการ", 22, DIM);
    gap(4);
    text(project.name, 48, INK, 700);
    gap(6);
    text([project.province, project.code ? `รหัส ${project.code}` : null].filter(Boolean).join(" · ") || "ยังไม่มีข้อมูลจังหวัด", 20, DIM);
    text(`ภาพ ณ ${snapshotTime(snapshot.generatedAt)}`, 19, DIM);
    gap(23);

    const statusTop = y, backgroundIndex = commands.length;
    y += 18;
    text("สถานะการคัดกรองจากข้อมูลโดยรอบ", 18, DIM, 400, inset + 22, contentWidth - 44);
    text(RISK_LABEL[project.risk], 36, RISK_COLOR[project.risk], 700, inset + 22, contentWidth - 44);
    text(project.why, 23, INK, 500, inset + 22, contentWidth - 44);
    gap(10);
    text(project.confidence, 18, DIM, 400, inset + 22, contentWidth - 44);
    gap(18);
    commands.splice(backgroundIndex, 0,
      { kind: "rect", x: inset, y: statusTop, width: contentWidth, height: y - statusTop, color: riskTint[project.risk] },
      { kind: "rect", x: inset, y: statusTop, width: 6, height: y - statusTop, color: RISK_COLOR[project.risk] });
    gap(24);
    text("ค่าที่ใช้ติดตามขณะนี้", 25, INK, 700);
    text(`สถานีใกล้เคียงในรัศมี ${snapshot.radius} กม. · ยังไม่ยืนยันเส้นทางน้ำถึงโครงการ`, 18, DIM);
    gap(18);
    const metricsTop = y, cardWidth = (contentWidth - 32) / 3;
    let metricsBottom = y;
    project.metrics.forEach((metric, index) => {
      const x = inset + index * (cardWidth + 16), innerX = x + 18, innerWidth = cardWidth - 36;
      const start = commands.length;
      let top = metricsTop + 18;
      top = textAt(metric.label, top, 19, INK, 600, innerX, innerWidth);
      top += 9;
      const valueSize = metric.value === null ? 35 : Math.min(54, 54 * (innerWidth - 1) / Math.max(1, measure(metric.displayValue, 54, 700)));
      top = textAt(metric.displayValue, top, valueSize, RISK_COLOR[metric.severity], 700, innerX, innerWidth);
      top = textAt(metric.unit, top, 21, INK, 600, innerX, innerWidth);
      top += 8;
      top = textAt(metric.context, top, 17, DIM, 400, innerX, innerWidth);
      top += 16;
      rect(innerX, top, innerWidth, 1, LINE);
      top += 13;
      top = textAt(metric.stationName ?? "ไม่พบสถานีที่ใช้ประเมินได้", top, 18, INK, 500, innerX, innerWidth);
      if (metric.stationName) {
        top = textAt(`วัด ${snapshotTime(metric.observedAt)}`, top + 4, 16, DIM, 400, innerX, innerWidth);
        top = textAt(`${metric.source ?? "ไม่ทราบแหล่งข้อมูล"}${metric.distance !== null ? ` · ห่าง ${metric.distance.toFixed(1)} กม.` : ""}`, top + 4, 16, DIM, 400, innerX, innerWidth);
      }
      top += 18;
      commands.splice(start, 0, { kind: "rect", x, y: metricsTop, width: cardWidth, height: top - metricsTop, color: "#f5f7f9" });
      metricsBottom = Math.max(metricsBottom, top);
    });
    // Equal card heights follow the longest station name, so no text is clipped.
    for (const command of commands) if (command.kind === "rect" && command.y === metricsTop && command.color === "#f5f7f9") command.height = metricsBottom - metricsTop;
    y = metricsBottom + 24;
    text("ผลต่อโครงการ · ต้องยืนยันหน้างาน", 24, INK, 700);
    text(project.impact, 22);
    if (project.dwrEvidence.length) {
      gap(12);
      text("ข้อมูลประกอบจากกรมทรัพยากรน้ำ", 20, INK, 600);
      for (const evidence of project.dwrEvidence) text(evidence, 17, DIM);
    }
    gap(22);
    rule();
    text("สิ่งที่ทีมโครงการควรทำต่อ", 27, INK, 700);
    gap(10);
    project.actions.forEach((action, index) => {
      const top = y;
      rect(inset, top + 4, 38, 38, "#203443");
      textAt(String(index + 1).padStart(2, "0"), top + 8, 20, "#fff", 700, inset + 6, 30);
      y = textAt(action, top + 4, 24, INK, 500, inset + 56, contentWidth - 56) + 12;
    });
  } else {
    text("ภาพรวมโครงการที่ต้องติดตาม", 42, INK, 700);
    text(snapshot.scope, 23);
    text(`ภาพ ณ ${snapshotTime(snapshot.generatedAt)} · รัศมีคัดกรอง ${snapshot.radius} กม.`, 19, DIM);
    gap(20);
    text(`${snapshot.total} โครงการตามตัวกรอง`, 30, INK, 700);
    gap(20);
    const countTop = y, countWidth = (contentWidth - 36) / 4;
    let countBottom = y;
    (["priority", "watch", "normal", "unknown"] as const).forEach((risk, index) => {
      const x = inset + index * (countWidth + 12);
      rect(x, countTop, countWidth, 5, RISK_COLOR[risk]);
      let bottom = textAt(String(snapshot.counts[risk]), countTop + 14, 48, RISK_COLOR[risk], 700, x, countWidth);
      bottom = textAt(RISK_LABEL[risk], bottom + 2, 17, INK, 500, x, countWidth);
      countBottom = Math.max(countBottom, bottom);
    });
    y = countBottom + 25;
    text(snapshot.total > snapshot.projects.length ? `แสดง ${snapshot.projects.length} โครงการแรกตามลำดับที่ควรตรวจสอบ` : "ลำดับโครงการที่ควรติดตาม", 23, INK, 700);
    gap(12);
    if (!snapshot.projects.length) text("ไม่พบโครงการที่ตรงกับตัวกรอง", 23, DIM);
    for (const [index, project] of snapshot.projects.entries()) {
      rule();
      text(`${String(index + 1).padStart(2, "0")}  ${RISK_LABEL[project.risk]}`, 18, RISK_COLOR[project.risk], 700);
      text(project.name, 28, INK, 700);
      const observed = project.metrics.filter((metric) => metric.state === "observed");
      text(observed.length ? observed.map((metric) => `${metric.label} ${metric.displayValue} ${metric.unit}`).join(" · ") : "ไม่มีค่าน้ำและฝนล่าสุดที่ใช้ประเมินได้", 19, INK, 500);
      text(`ทำต่อ · ${project.actions[0]}`, 20, INK, 600);
      for (const metric of project.metrics.filter((entry) => entry.stationName)) text(`${metric.label}: ${metricProvenance(metric)}`, 15, DIM);
      if (observed.length < 3) text("ข้อมูลบางส่วนขาดหายหรือเวลาไม่ผ่านเกณฑ์ ต้องยืนยันหน้างาน", 16, DIM);
      for (const evidence of project.dwrEvidence) text(evidence, 15, DIM);
      gap(16);
    }
  }
  gap(14);
  rule();
  text(snapshot.nextReview, 21, INK, 600);
  text("ภาพนี้เป็นข้อมูล ณ เวลาส่งออก · ไม่มีการอัปเดตหรือแจ้งเตือนอัตโนมัติในภาพ", 17, DIM);
  gap(18);
  text(SNAPSHOT_LIMITATION, 17, INK, 600);
  text(SNAPSHOT_FORECAST, 17, DIM);
  gap(12);
  text(`ระบบดึงข้อมูล ${snapshotTime(snapshot.fetchedAt)} · เวลาทั้งหมดเป็นเวลาไทย (UTC+7)`, 16, DIM);
  text(snapshot.sources, 15, DIM);
  return { width, height: Math.ceil(y + 36), commands };
}

export function snapshotSvg(drawing: SnapshotDrawing): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${drawing.width}" height="${drawing.height}" viewBox="0 0 ${drawing.width} ${drawing.height}" role="img" aria-label="AP Water Watch สรุปสถานการณ์โครงการ"><rect width="100%" height="100%" fill="#fff"/>${drawing.commands.map((command) => command.kind === "rect"
    ? `<rect x="${command.x}" y="${command.y}" width="${command.width}" height="${command.height}" fill="${command.color}"/>`
    : `<text x="${command.x}" y="${command.y}" font-family="${escapeMarkup(SNAPSHOT_FONT_FAMILY)}" font-size="${command.size}" font-weight="${command.weight}" fill="${command.color}">${escapeMarkup(command.value)}</text>`).join("")}</svg>`;
}

function metricHtml(metric: SnapshotMetric): string {
  return `<div class="metric"><h3>${escapeMarkup(metric.label)}</h3><b style="color:${RISK_COLOR[metric.severity]}">${escapeMarkup(metric.displayValue)}</b><strong>${escapeMarkup(metric.unit)}</strong><p>${escapeMarkup(metric.context)}</p><small>${escapeMarkup(metricProvenance(metric))}</small></div>`;
}

export function snapshotPrintHtml(snapshot: DecisionSnapshot): string {
  const escape = escapeMarkup;
  const project = snapshot.mode === "project" ? snapshot.projects[0] : undefined;
  if (snapshot.mode === "project" && !project) throw new Error("ไม่มีข้อมูลโครงการในภาพสรุป");
  const body = project
    ? `<p class="meta">สรุปติดตามรายโครงการ</p><h1>${escape(project.name)}</h1><p class="meta">${escape([project.province, project.code ? `รหัส ${project.code}` : null].filter(Boolean).join(" · "))}</p><section class="risk" style="background:${riskTint[project.risk]};border-color:${RISK_COLOR[project.risk]}"><small>สถานะการคัดกรองจากข้อมูลโดยรอบ</small><h2 style="color:${RISK_COLOR[project.risk]}">${RISK_LABEL[project.risk]}</h2><p>${escape(project.why)}</p><small>${escape(project.confidence)}</small></section><h2>ค่าที่ใช้ติดตามขณะนี้</h2><div class="metrics">${project.metrics.map(metricHtml).join("")}</div><h2>ผลต่อโครงการ · ต้องยืนยันหน้างาน</h2><p>${escape(project.impact)}</p>${project.dwrEvidence.length ? `<h2>ข้อมูลประกอบจากกรมทรัพยากรน้ำ</h2>${project.dwrEvidence.map((evidence) => `<p class="meta">${escape(evidence)}</p>`).join("")}` : ""}<h2>สิ่งที่ทีมโครงการควรทำต่อ</h2><ol>${project.actions.map((action) => `<li>${escape(action)}</li>`).join("")}</ol>`
    : `<h1>ภาพรวมโครงการที่ต้องติดตาม</h1><p>${escape(snapshot.scope)}</p><h2>${snapshot.total} โครงการตามตัวกรอง</h2><div class="counts">${(["priority", "watch", "normal", "unknown"] as const).map((risk) => `<div><b style="color:${RISK_COLOR[risk]}">${snapshot.counts[risk]}</b><span>${RISK_LABEL[risk]}</span></div>`).join("")}</div><p class="meta">${snapshot.total > snapshot.projects.length ? `แสดง ${snapshot.projects.length} โครงการแรกตามลำดับที่ควรตรวจสอบ` : "ลำดับโครงการที่ควรติดตาม"}</p>${snapshot.projects.map((item, index) => `<article><small style="color:${RISK_COLOR[item.risk]}">${index + 1}. ${RISK_LABEL[item.risk]}</small><h2>${escape(item.name)}</h2><p>${item.metrics.map((metric) => escape(`${metric.label}: ${metric.displayValue} ${metric.unit}`)).join(" · ")}</p><p><b>ทำต่อ · ${escape(item.actions[0])}</b></p><small>${escape(item.evidence)}</small>${item.dwrEvidence.map((evidence) => `<p class="meta">${escape(evidence)}</p>`).join("")}</article>`).join("") || "<p>ไม่พบโครงการที่ตรงกับตัวกรอง</p>"}`;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>AP Water Watch · ${escape(project?.name ?? "ภาพรวมโครงการ")}</title><style>@page{size:A4;margin:13mm}*{box-sizing:border-box}body{font-family:${SNAPSHOT_FONT_FAMILY};color:${INK};font-size:10pt;line-height:1.6;margin:0}h1{font-size:25pt;line-height:1.4;margin:4px 0 9px;overflow-wrap:anywhere}h2{font-size:14pt;margin:12px 0 5px}h3{font-size:10pt;margin:0 0 6px}p{margin:5px 0}.brand{color:#b82d3b;font-weight:700;letter-spacing:1px}.meta,small{color:${DIM};font-size:8pt}.risk{border-left:5px solid;padding:10px 14px;margin:16px 0}.risk h2{font-size:21pt;margin:3px 0}.metrics{display:flex;gap:10px;margin:10px 0 16px}.metric{flex:1;min-width:0;background:#f5f7f9;padding:12px;overflow-wrap:anywhere}.metric b{display:block;font-size:27pt;line-height:1.3}.metric strong{display:block;font-size:10pt}.metric p{font-size:8pt}.metric small{display:block;border-top:1px solid ${LINE};padding-top:8px;font-size:7.5pt}.counts{display:flex;gap:25px;margin:18px 0}.counts b{font-size:25pt}.counts span{display:block;font-size:8pt}article{break-inside:avoid;border-top:1px solid ${LINE};padding:10px 0}article h2{margin:3px 0}ol{padding-left:25px;margin:8px 0}li{padding:4px 0}footer{border-top:2px solid ${INK};padding-top:12px;margin-top:16px;font-size:8pt;break-inside:avoid}.review{font-size:10pt;font-weight:700}.demo{color:#b82d3b;font-weight:700}</style></head><body><p class="brand">AP WATER WATCH / ${snapshot.mode === "project" ? "PROJECT BRIEF" : "PORTFOLIO BRIEF"}</p>${snapshot.demo ? '<p class="demo">ข้อมูลสาธิตสำหรับทดสอบการแสดงผล ห้ามใช้ตัดสินใจสถานการณ์จริง</p>' : ""}<p class="meta">ภาพ ณ ${escape(snapshotTime(snapshot.generatedAt))} · รัศมีคัดกรอง ${snapshot.radius} กม.</p>${body}<footer><p class="review">${escape(snapshot.nextReview)}</p><p>ภาพนี้เป็นข้อมูล ณ เวลาส่งออก · ไม่มีการอัปเดตหรือแจ้งเตือนอัตโนมัติในภาพ</p><p><b>${SNAPSHOT_LIMITATION}</b></p><p>${SNAPSHOT_FORECAST}</p><p>ระบบดึงข้อมูล ${escape(snapshotTime(snapshot.fetchedAt))} · เวลาไทย (UTC+7)</p><p>${escape(snapshot.sources)}</p></footer></body></html>`;
}
