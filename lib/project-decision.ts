import type { Assessment, NearbyStation, Risk } from "./flood-types";
import { RAIN_THRESHOLDS } from "./presentation.ts";

export type DecisionEvidenceId =
  | "water"
  | "rain1h"
  | "rain24h"
  | "rain48h"
  | "forecast"
  | "connectivity"
  | "floodZone";

export interface DecisionEvidence {
  id: DecisionEvidenceId;
  label: string;
  state: "observed" | "missing" | "stale" | "unavailable";
  summary: string;
  severity: Risk;
  station?: NearbyStation;
}

export interface ProjectDecision {
  risk: Risk;
  headline: string;
  why: string;
  impact: string;
  action: string;
  timeHorizon: string;
  confidenceLabel: string;
  compoundSignals: boolean;
  evidence: DecisionEvidence[];
  forecast: {
    status: "unavailable";
    summary: string;
    horizons: { label: string; summary: string }[];
  };
}

function isValue(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function waterStatus(station: NearbyStation): number | null {
  return isValue(station.value) &&
    station.status !== null &&
    Number.isInteger(station.status) &&
    station.status >= 1 &&
    station.status <= 5
    ? station.status
    : null;
}

function rainValue(station: NearbyStation, period: "1h" | "24h") {
  const value = period === "1h" ? station.rain1h : station.value;
  return isValue(value) && value >= 0 ? value : null;
}

function unavailableObservation(
  id: DecisionEvidenceId,
  label: string,
  stations: NearbyStation[],
  usable: (station: NearbyStation) => boolean,
): DecisionEvidence {
  const stale = stations.find((station) => !station.fresh && usable(station));
  return {
    id,
    label,
    state: stale ? "stale" : "missing",
    severity: "unknown",
    summary: stale
      ? "มีค่าวัด แต่เวลาไม่ผ่านเกณฑ์ข้อมูลล่าสุด จึงไม่นำมาประเมิน"
      : "ไม่มีค่าล่าสุดที่ใช้ประเมินได้ในระยะที่เลือก",
    ...(stale ? { station: stale } : {}),
  };
}

function waterEvidence(assessment: Assessment): DecisionEvidence {
  const valid = assessment.water.filter(
    (station) => station.fresh && waterStatus(station) !== null,
  );
  const station =
    valid.find((station) => station.status === 5) ??
    valid.find((station) => station.status === 4) ??
    valid[0];
  if (!station)
    return unavailableObservation(
      "water",
      "ระดับน้ำปัจจุบัน",
      assessment.water,
      (candidate) => waterStatus(candidate) !== null,
    );
  return {
    id: "water",
    label: "ระดับน้ำปัจจุบัน",
    state: "observed",
    station,
    severity:
      station.status === 5 ? "priority" : station.status === 4 ? "watch" : "normal",
    summary:
      station.status === 5
        ? "สถานีรายงานน้ำล้นตลิ่ง ต้องยืนยันผลต่อพื้นที่โครงการ"
        : station.status === 4
          ? "สถานีรายงานน้ำมาก ควรตรวจทางระบายและสภาพพื้นที่"
          : "สถานีน้ำที่มีค่าล่าสุดยังไม่รายงานน้ำมากหรือล้นตลิ่ง",
  };
}

function rainEvidence(
  assessment: Assessment,
  period: "1h" | "24h",
): DecisionEvidence {
  const id = period === "1h" ? "rain1h" : "rain24h";
  const label = period === "1h" ? "ฝน 1 ชั่วโมง" : "ฝนสะสม 24 ชั่วโมง";
  const candidates = assessment.rain.filter(
    (station) => station.fresh && rainValue(station, period) !== null,
  );
  // Each period keeps its own strongest observation, which may be a different station.
  const station = candidates.reduce<NearbyStation | undefined>(
    (selected, candidate) =>
      !selected || rainValue(candidate, period)! > rainValue(selected, period)!
        ? candidate
        : selected,
    undefined,
  );
  if (!station)
    return unavailableObservation(id, label, assessment.rain, (candidate) =>
      rainValue(candidate, period) !== null,
    );
  const value = rainValue(station, period)!;
  const thresholds = RAIN_THRESHOLDS[period];
  const severity =
    value >= thresholds.priority
      ? "priority"
      : value >= thresholds.watch
        ? "watch"
        : "normal";
  return {
    id,
    label,
    state: "observed",
    station,
    severity,
    summary: `${value.toFixed(1)} มม. / ${thresholds.label} · ${severity === "priority" ? "เข้าเกณฑ์ตรวจสอบเร่งด่วน" : severity === "watch" ? "เข้าเกณฑ์เฝ้าระวัง" : "ยังไม่เข้าเกณฑ์เฝ้าระวัง"}`,
  };
}

const unavailableEvidence: DecisionEvidence[] = [
  {
    id: "rain48h",
    label: "ฝนสะสม 48 ชั่วโมง",
    state: "unavailable",
    severity: "unknown",
    summary: "ยังไม่มีข้อมูลสะสม 48 ชั่วโมงที่ยืนยันได้ ไม่คำนวณแทนจากฝน 24 ชั่วโมง",
  },
  {
    id: "forecast",
    label: "พยากรณ์รายโครงการ",
    state: "unavailable",
    severity: "unknown",
    summary: "ยังไม่มีพยากรณ์น้ำท่วม 48 ชั่วโมงหรือ 7 วันที่ผูกกับโครงการ",
  },
  {
    id: "connectivity",
    label: "เส้นทางน้ำถึงโครงการ",
    state: "unavailable",
    severity: "unknown",
    summary: "ยังไม่ยืนยันคลองรับน้ำ ทิศทางไหล หรือระดับพื้นที่ของโครงการ",
  },
  {
    id: "floodZone",
    label: "พื้นที่น้ำท่วม / น้ำท่วมขัง",
    state: "unavailable",
    severity: "unknown",
    summary: "ดูภาพพื้นที่น้ำท่วมย้อนหลัง 7 วันจาก GISTDA บนแผนที่ได้ แต่ยังไม่ยืนยันสภาพปัจจุบันหรือพื้นที่ซ้อนทับกับโครงการ",
  },
];

const decisionCopy: Record<
  Risk,
  Pick<ProjectDecision, "headline" | "impact" | "action">
> = {
  priority: {
    headline: "พบสัญญาณที่ควรตรวจสอบเร่งด่วน",
    impact: "ควรตรวจจุดต่ำ ทางเข้า–ออก และระบบระบายน้ำของโครงการ ยังไม่ยืนยันว่าน้ำท่วมโครงการ",
    action: "ติดต่อทีมพื้นที่ทันที ตรวจปั๊มและไฟสำรอง เตรียมอุปกรณ์สำคัญและเส้นทางปลอดภัย",
  },
  watch: {
    headline: "ควรเตรียมพร้อมและติดตามใกล้ชิด",
    impact: "ควรเฝ้าระวังน้ำขังและข้อจำกัดการระบายน้ำ ยังไม่ยืนยันผลกระทบต่อโครงการ",
    action: "ตรวจท่อระบายและบ่อพัก เตรียมปั๊มน้ำ พร้อมติดตามค่ารอบถัดไปและประกาศท้องถิ่น",
  },
  normal: {
    headline: "ยังไม่พบสัญญาณสูงจากข้อมูลที่มี",
    impact: "สถานีน้ำและฝนที่ใช้ได้ยังไม่เข้าเกณฑ์เฝ้าระวัง แต่ยังรับรองความปลอดภัยของโครงการไม่ได้",
    action: "ติดตามต่อเนื่อง ตรวจทางระบายน้ำตามรอบ และยืนยันสภาพจริงกับทีมโครงการ",
  },
  unknown: {
    headline: "ต้องยืนยันข้อมูลก่อนประเมิน",
    impact: "ข้อมูลล่าสุดไม่พอจะสรุปผลกระทบต่อโครงการ ควรตรวจสภาพพื้นที่โดยตรง",
    action: "ขอข้อมูลล่าสุดจากทีมโครงการ ตรวจประกาศท้องถิ่น และตรวจความพร้อมระบบระบายน้ำ",
  },
};

export function projectDecision(assessment: Assessment): ProjectDecision {
  const water = waterEvidence(assessment);
  const hourly = rainEvidence(assessment, "1h");
  const daily = rainEvidence(assessment, "24h");
  const elevated = (evidence: DecisionEvidence) =>
    evidence.state === "observed" &&
    (evidence.severity === "priority" || evidence.severity === "watch");
  const compoundSignals = elevated(water) && (elevated(hourly) || elevated(daily));
  const signals = [water, hourly, daily].filter(elevated);
  const why = compoundSignals
    ? "พบทั้งน้ำสูงและฝนเข้าเกณฑ์จากสถานีใกล้เคียง ควรตรวจการระบายน้ำของโครงการร่วมกัน"
    : signals.length
      ? signals.map((signal) => `${signal.label}: ${signal.summary}`).join(" · ")
      : assessment.risk === "normal"
        ? "ค่าล่าสุดที่ใช้ได้ของน้ำและฝนทั้ง 1 และ 24 ชั่วโมงยังไม่เข้าเกณฑ์เฝ้าระวัง"
        : assessment.project.lat === null || assessment.project.lng === null
          ? "ยังไม่มีพิกัดโครงการสำหรับตรวจข้อมูลน้ำและฝนโดยรอบ"
          : "ข้อมูลน้ำหรือฝนขาดหาย เวลาไม่ผ่านเกณฑ์ หรือยังไม่มีค่าที่ใช้ประเมินได้ครบ";

  return {
    risk: assessment.risk,
    ...decisionCopy[assessment.risk],
    why,
    timeHorizon:
      assessment.risk === "priority"
        ? "ตรวจสอบหน้างานตอนนี้ · ยังระบุเวลาน้ำถึงโครงการไม่ได้"
        : "ติดตามสถานการณ์ปัจจุบัน · ยังระบุเวลาน้ำถึงโครงการไม่ได้",
    confidenceLabel:
      assessment.coverage === "complete"
        ? "มีค่าน้ำและฝน 1/24 ชม. ที่ใช้ได้ · ยังขาดข้อมูลผลกระทบหน้างาน"
        : assessment.coverage === "partial"
          ? "ข้อมูลปัจจุบันมีบางส่วน · ต้องยืนยันหน้างานเพิ่มเติม"
          : "ไม่มีค่าล่าสุดที่ใช้ประเมินได้ · ต้องยืนยันหน้างาน",
    compoundSignals,
    evidence: [water, hourly, daily, ...unavailableEvidence.map((item) => ({ ...item }))],
    forecast: {
      status: "unavailable",
      summary: "ยังไม่มีแบบจำลองที่บอกโอกาสหรือเวลาน้ำถึงโครงการ สัญญาณปัจจุบันไม่ใช่พยากรณ์หรือประกาศเตือนภัยทางการ",
      horizons: [
        { label: "ขณะนี้", summary: "ใช้ค่าวัดล่าสุดที่ผ่านเกณฑ์เวลาเพื่อจัดลำดับการตรวจสอบ" },
        { label: "48 ชั่วโมง", summary: "ยังประเมินผลกระทบล่วงหน้าไม่ได้ ตรวจพยากรณ์ทางการและความพร้อมทีม" },
        { label: "7 วัน", summary: "ยังประเมินผลกระทบล่วงหน้าไม่ได้ ทบทวนแผนรับมือร่วมกับประกาศทางการ" },
      ],
    },
  };
}
