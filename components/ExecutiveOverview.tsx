"use client";
import { useState } from "react";
import { ArrowRight, MapPin, Search } from "lucide-react";
import type { Assessment } from "@/lib/flood-types";
import { RISK_LABEL } from "@/lib/flood-types";
import { projectDecision } from "@/lib/project-decision";
import ProjectDecision from "./ProjectDecision";

export default function ExecutiveOverview({ items, selectedId, loading, onFocus, onDetail, onMap }: { items: Assessment[]; selectedId: string | null; loading: boolean; onFocus: (id: string) => void; onDetail: (id: string) => void; onMap: (id: string) => void }) {
  const [limit, setLimit] = useState(8);
  const active = items.find(a => a.project.id === selectedId) ?? items[0];
  if (loading) return <div className="executive-empty" role="status">กำลังประเมินข้อมูลน้ำและฝนรอบโครงการ…</div>;
  if (!active) return <div className="executive-empty"><Search size={24} /><p>ไม่พบโครงการที่ตรงกับตัวกรอง</p></div>;
  return <div className="executive-workspace">
    <section className="executive-queue" aria-label="ลำดับโครงการที่ควรติดตาม">
      <div className="queue-heading"><b>โครงการที่ต้องติดตาม</b><span>เรียงตามสัญญาณที่ต้องตรวจสอบก่อน · {items.length} โครงการ</span></div>
      {items.slice(0, limit).map(item => { const decision = projectDecision(item); return <button className={`executive-project ${item.risk} ${active.project.id === item.project.id ? "active" : ""}`} key={item.project.id} onClick={() => {
        onFocus(item.project.id);
        if (window.matchMedia("(max-width: 700px)").matches) requestAnimationFrame(() => document.getElementById("executive-decision")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }));
      }} aria-pressed={active.project.id === item.project.id}>
        <span className="queue-project-top"><span className={`risk-label ${item.risk}`}>{RISK_LABEL[item.risk]}</span><small>{item.project.province ?? "ยังไม่ระบุจังหวัด"}</small></span>
        <strong>{item.project.name}</strong>
        <span className="queue-why">{decision.why}</span>
        <span className="queue-action"><ArrowRight size={15} />{decision.action}</span>
      </button>; })}
      {limit < items.length && <button className="queue-more" onClick={() => setLimit(limit + 12)}>แสดงเพิ่ม · อีก {items.length - limit} โครงการ</button>}
    </section>
    <section className="executive-inspector" id="executive-decision" aria-label="ผลกระทบและการเตรียมพร้อม">
      <header><div><span className="eyebrow">PROJECT / DECISION</span><h2>{active.project.name}</h2><p>{active.project.province ?? "ยังไม่ระบุจังหวัด"} · {active.project.code}</p></div><button onClick={() => onMap(active.project.id)} aria-label={`ดู ${active.project.name} บนแผนที่`}><MapPin size={18} />แผนที่</button></header>
      <ProjectDecision assessment={active} compact />
      <button className="decision-detail-button" onClick={() => onDetail(active.project.id)}>เปิดหลักฐานและ Checklist ของโครงการ <ArrowRight size={18} /></button>
    </section>
  </div>;
}
