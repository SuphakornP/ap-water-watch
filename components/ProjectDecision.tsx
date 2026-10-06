"use client";
import { ArrowUpRight, Clock3, ShieldCheck } from "lucide-react";
import type { Assessment } from "@/lib/flood-types";
import { RISK_LABEL } from "@/lib/flood-types";
import { projectDecision } from "@/lib/project-decision";

const date = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const evidenceLabels = { observed: "ข้อมูลวัดจริง", missing: "ข้อมูลไม่ครบ", stale: "ข้อมูลล่าช้า", unavailable: "ยังไม่มีข้อมูล" };

export default function ProjectDecision({ assessment, compact = false }: { assessment: Assessment; compact?: boolean }) {
  const decision = projectDecision(assessment);
  return <article className={`project-decision ${assessment.risk} ${compact ? "compact" : ""}`} aria-label={`สรุปการตัดสินใจ ${assessment.project.name}`}>
    <div className="decision-heading"><span className={`risk-label ${assessment.risk}`}>{RISK_LABEL[assessment.risk]}</span><span className="assessment-tag">การประเมินของระบบ</span></div>
    <h3>{decision.headline}</h3>
    <p className="decision-confidence">{decision.confidenceLabel} · ยังไม่ยืนยันผลกระทบภายในโครงการ</p>
    <dl className="decision-facts">
      <div><dt>ความเสี่ยงมาจากไหน</dt><dd>{decision.why}</dd></div>
      <div><dt>ผลกระทบที่ต้องตรวจ</dt><dd>{decision.impact}</dd></div>
      <div><dt>ต้องเตรียมเมื่อไร</dt><dd>{decision.timeHorizon}</dd></div>
    </dl>
    <div className="decision-next"><ShieldCheck size={21} aria-hidden="true" /><div><span>สิ่งที่ควรทำต่อ</span><strong>{decision.action}</strong></div></div>
    <section className="forecast-outlook" aria-label="พยากรณ์และช่วงเวลาติดตาม">
      <div className="outlook-heading"><Clock3 size={16} /><b>มองล่วงหน้า</b><span>ข้อมูลพยากรณ์</span></div>
      <div className="outlook-periods"><div><b>24–48 ชม.</b><p>ยังไม่มีพยากรณ์ผลกระทบรายโครงการ</p></div><div><b>7 วัน</b><p>ตรวจแนวโน้มอากาศจากประกาศทางการ</p></div></div>
      <p>ยังระบุไม่ได้ว่าน้ำจะมาถึงหรือเมื่อไร · ช่วงเวลานี้ใช้วางแผนติดตาม ไม่ใช่เวลาที่คาดว่าน้ำจะท่วม</p>
      <a href="https://www.tmd.go.th/forecast/sevenday" target="_blank" rel="noreferrer">ดูพยากรณ์ 7 วันจาก TMD <ArrowUpRight size={15} /></a>
    </section>
    <details className="decision-evidence" open={!compact}>
      <summary>ปัจจัยที่ใช้และข้อมูลที่ยังขาด</summary>
      <div className="factor-list">{decision.evidence.map(factor => <div className={`factor-row ${factor.state}`} key={factor.id}>
        <div><b>{factor.label}</b><span>{evidenceLabels[factor.state]}</span></div>
        <p>{factor.summary}</p>
        {factor.station && <small>{factor.station.name} · {factor.station.distance.toFixed(1)} กม. · {factor.station.observedAt && Number.isFinite(Date.parse(factor.station.observedAt)) ? date.format(new Date(factor.station.observedAt)) + " น." : "ไม่ทราบเวลาวัด"} · {factor.station.source}</small>}
      </div>)}</div>
    </details>
  </article>;
}
