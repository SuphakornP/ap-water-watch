"use client";

import { ExternalLink } from "lucide-react";
import { isFresh } from "@/lib/assessment";
import { dwrStatusColor, dwrStatusLabel } from "@/lib/dwr-context";
import type { DwrStation } from "@/lib/dwr-types";
import styles from "./DwrStationDetails.module.css";

type Props = {
  station: DwrStation;
  fetchedAt?: string;
  distance?: number;
  linkedThaiWaterName?: string;
  now: number;
};

function reportTime(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "ไม่ทราบเวลา";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

export default function DwrStationDetails({ station, fetchedAt, distance, linkedThaiWaterName, now }: Props) {
  const fresh = isFresh(station.reportAt, now);
  const color = dwrStatusColor(station.alertStatus, fresh);
  const metrics = [
    ...(station.kind === "water" ? [{ label: "ระดับน้ำที่สถานีรายงาน", value: station.waterLevel, unit: "ม.", key: "water" }] : []),
    { label: "ฝน 15 นาที", value: station.rain15m, unit: "มม.", key: "rain15m" },
    { label: "ฝนสะสม 12 ชม.", value: station.rain12h, unit: "มม.", key: "rain12h" },
    { label: "ฝนรายวัน เวลา 07:00 น.", value: station.rainDaily07, unit: "มม.", key: "rainDaily07" },
  ];
  return (
    <article className={styles.details} aria-label={`รายละเอียดสถานี DWR ${station.name}`}>
      <div className={styles.identity}>
        <span>DWR · กรมทรัพยากรน้ำ</span>
        <h3>{station.name}</h3>
        <p>{[station.subdistrict, station.district, station.province].filter(Boolean).join(" · ")}</p>
        <small>รหัส {station.code} · {station.kind === "water" ? "สถานีระดับน้ำ" : "สถานีฝน"}</small>
      </div>
      <div className={styles.status} style={{ borderColor: color }}>
        <i style={{ background: color }} />
        <strong>{dwrStatusLabel(station.alertStatus, fresh)}</strong>
        <small>เกณฑ์เตือนภัยของ DWR · แยกจากสีคัดกรองโครงการ</small>
      </div>
      <p className={fresh ? styles.fresh : styles.stale}>
        {fresh ? "รายงานอยู่ในช่วง 6 ชั่วโมง" : station.reportAt ? "ข้อมูลเกินช่วง 6 ชั่วโมงหรือเวลาไม่สอดคล้อง · ไม่นับเป็นค่าปัจจุบัน" : "ไม่ทราบเวลารายงาน · ยังยืนยันความสดของข้อมูลไม่ได้"}
      </p>
      <dl className={styles.times}>
        <div><dt>{station.reportTimeKind === "warning" ? "เวลารายงานเตือนภัย" : "เวลาตรวจวัดที่รายงาน"}</dt><dd>{reportTime(station.reportAt)}</dd></div>
        {station.alertIssuedAt && <div><dt>เวลาออกคำเตือน</dt><dd>{reportTime(station.alertIssuedAt)}</dd></div>}
        {fetchedAt && <div><dt>ระบบรับข้อมูล</dt><dd>{reportTime(fetchedAt)}</dd></div>}
      </dl>
      {station.reportTimeKind === "warning" && <p className={styles.note}>ค่าที่แนบกับรายงานเตือนภัย ไม่ใช่ข้อมูลตรวจวัดต่อเนื่องล่าสุด{station.warningType ? ` · คำเตือนด้าน${station.warningType === "rain" ? "ฝน" : "ระดับน้ำ"}` : ""}</p>}
      <dl className={styles.metrics}>
        {metrics.map(metric => <div key={metric.key}>
          <dt>{metric.label}</dt>
          <dd>{fresh && metric.value !== null ? metric.value.toFixed(metric.key === "water" ? 2 : 1) : "—"}<small>{metric.unit}</small></dd>
          {!fresh && <span>รอรายงานที่เป็นปัจจุบัน</span>}
        </div>)}
      </dl>
      <p className={styles.note}>ฝนรายวัน 07:00 น. เป็นรอบรายงานของ DWR ไม่ใช่ฝนสะสมย้อนหลัง 24 ชั่วโมง</p>
      {station.kind === "water" && <p className={styles.datum}>ระดับน้ำเป็นเมตรตามจุดอ้างอิงของสถานี ยังไม่ยืนยันฐานระดับ จึงไม่ใช้เป็น ม.รทก. เทียบตลิ่ง หรือความลึกน้ำท่วมโครงการ</p>}
      {!fresh && metrics.some(metric => metric.value !== null) && <details className={styles.history}>
        <summary>ดูค่าจากรายงานเดิม · {reportTime(station.reportAt)}</summary>
        <dl>{metrics.map(metric => <div key={metric.key}><dt>{metric.label}</dt><dd>{metric.value === null ? "ไม่มีค่า" : `${metric.value.toFixed(metric.key === "water" ? 2 : 1)} ${metric.unit}`}</dd></div>)}</dl>
        <p>เก็บไว้เพื่ออ้างอิง ไม่ใช่สถานการณ์ปัจจุบัน</p>
      </details>}
      {distance !== undefined && <p className={styles.note}>ห่างโครงการ {distance.toFixed(1)} กม. ตามพิกัด · ยังไม่ยืนยันทางน้ำเชื่อมถึงโครงการ</p>}
      {linkedThaiWaterName && <p className={styles.note}>ข้อมูลเกี่ยวข้องบน ThaiWater: {linkedThaiWaterName} · อาจเป็นข้อมูลจากสถานีเดียวกัน ไม่ถือเป็นหลักฐานอิสระสองแหล่ง</p>}
      <p className={styles.note}>สถานะไม่มีคำเตือนหรือมีฝนไม่ใช่การรับรองว่าพื้นที่ปลอดภัย · แสดงเพื่อประกอบการตรวจสอบ และไม่เปลี่ยนระดับคัดกรองโครงการโดยอัตโนมัติ</p>
      <a className={styles.sourceLink} href={station.sourceUrl} target="_blank" rel="noreferrer">เปิดระบบเตือนภัยล่วงหน้า DWR <ExternalLink size={14} /></a>
    </article>
  );
}
