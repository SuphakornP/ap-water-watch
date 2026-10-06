"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Radio, Search } from "lucide-react";
import type { Feed, Project } from "@/lib/flood-types";
import { isFresh } from "@/lib/assessment";
import { dwrStatusColor, dwrStatusLabel, matchDwrStations, nearbyDwrStations } from "@/lib/dwr-context";
import { DWR_SOURCE_URL } from "@/lib/dwr-normalize";
import DwrStationDetails from "./DwrStationDetails";
import styles from "./DwrSourcePanel.module.css";

export default function DwrSourcePanel({ feed, project, radius = 5, now }: { feed: Feed; project?: Project; radius?: number; now: number }) {
  const [query, setQuery] = useState("");
  const [province, setProvince] = useState("all");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [limit, setLimit] = useState(12);
  const stations = feed.dwr?.stations;
  const source = feed.sources.find((item) => item.id === "dwr-ews");
  const matches = useMemo(() => matchDwrStations(stations ?? [], feed.stations), [stations, feed.stations]);
  const nearby = useMemo(() => project ? nearbyDwrStations(project, stations ?? [], radius, now) : [], [project, stations, radius, now]);
  const provinces = useMemo(() => [...new Set((stations ?? []).map((station) => station.province))].sort((a, b) => a.localeCompare(b, "th")), [stations]);
  const rows = useMemo(() => (stations ?? []).filter((station) =>
    (province === "all" || station.province === province) &&
    (!alertsOnly || [1, 2, 3].includes(station.alertStatus ?? -1)) &&
    `${station.code} ${station.name} ${station.province} ${station.district}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  ).sort((a, b) => {
    const score = (station: typeof a) => [1, 2, 3].includes(station.alertStatus ?? -1) ? (isFresh(station.reportAt, now) ? 10 : 0) + (station.alertStatus ?? 0) : -1;
    return score(b) - score(a) || a.name.localeCompare(b.name, "th");
  }), [stations, province, alertsOnly, query, now]);
  const selected = rows.find((station) => station.id === selectedId) ?? rows[0];
  const freshCount = (stations ?? []).filter((station) => isFresh(station.reportAt, now)).length;
  const warningCount = (stations ?? []).filter((station) => [1, 2, 3].includes(station.alertStatus ?? -1)).length;

  function linkedName(id: string) {
    const link = matches.links[id];
    return link?.linkedThaiWaterId ? feed.stations.find((station) => station.id === link.linkedThaiWaterId)?.name : undefined;
  }

  const unavailable = source?.state === "error" ? "เชื่อมต่อ DWR ไม่สำเร็จในรอบนี้ ยังสรุปสถานะจากแหล่งนี้ไม่ได้" : "กำลังรอข้อมูลจาก DWR";
  if (project) return <section className={`${styles.panel} ${styles.project}`} aria-label="ข้อมูลกรมทรัพยากรน้ำใกล้โครงการ">
    <div className={styles.heading}><Radio size={18} /><h3>DWR ใกล้โครงการ</h3><span>{stations ? nearby.length : "—"} สถานี · {radius} กม.</span></div>
    {!stations ? <p className={styles.note} role={source?.state === "error" ? "alert" : "status"}>{unavailable}</p> : nearby.length ? <>
      <p className={styles.note}>ข้อมูลเสริมจากกรมทรัพยากรน้ำ · สถานะ DWR ใช้เกณฑ์ต่างจากสีโครงการ และไม่นับเป็นหลักฐานซ้ำกับฝนจากสถานีเดียวกันใน ThaiWater</p>
      {nearby.slice(0, 3).map((station) => <details key={station.id} className={styles.projectStation} open={nearby.length === 1}>
        <summary><span>{station.name} · {station.distance.toFixed(1)} กม.</span><b style={{ color: dwrStatusColor(station.alertStatus, station.fresh) }}>{dwrStatusLabel(station.alertStatus, station.fresh)}</b></summary>
        <DwrStationDetails station={station} fetchedAt={feed.dwr?.fetchedAt} distance={station.distance} linkedThaiWaterName={linkedName(station.id)} now={now} />
      </details>)}
      {nearby.length > 3 && <p className={styles.note}>แสดง 3 สถานีใกล้ที่สุดจาก {nearby.length} สถานี · ดูเพิ่มเติมในชั้นข้อมูล DWR บนแผนที่</p>}
    </> : <p className={styles.note}>{project.lat === null || project.lng === null ? "โครงการไม่มีพิกัดสำหรับจับคู่สถานี" : `ไม่พบสถานี DWR ในระยะ ${radius} กม. ที่เลือก ไม่ได้แปลว่าโครงการปลอดภัยหรือไม่มีฝน`}</p>}
    <a className={styles.sourceLink} href={DWR_SOURCE_URL} target="_blank" rel="noreferrer">ตรวจสอบกับ DWR <ExternalLink size={13} /></a>
  </section>;

  return <section className={styles.panel} aria-label="ข้อมูล DWR ทั่วประเทศ">
    <header className={styles.heading}><Radio size={21} /><div><span className={styles.eyebrow}>DEPARTMENT OF WATER RESOURCES</span><h3>กรมทรัพยากรน้ำ · Early Warning</h3></div><a className={styles.sourceLink} href={DWR_SOURCE_URL} target="_blank" rel="noreferrer">เปิดต้นทาง <ExternalLink size={14} /></a></header>
    <p className={styles.note}>เครือข่ายเตือนภัยน้ำท่วมฉับพลันและน้ำป่าไหลหลากในพื้นที่ลาดชันและที่ราบเชิงเขา ครอบคลุมตามสถานีที่มีในชุดข้อมูล ไม่ใช่ทุกจังหวัดหรือทุกพื้นที่</p>
    {!stations ? <p className={styles.empty} role={source?.state === "error" ? "alert" : "status"}>{unavailable}</p> : <>
      <div className={styles.stats}>
        <div><strong>{stations.length.toLocaleString("th-TH")}</strong><span>สถานีในชุดข้อมูล</span></div>
        <div><strong>{matches.stats.provinces}</strong><span>จังหวัดที่มีสถานี</span></div>
        <div><strong>{warningCount}</strong><span>มีสถานะเตือนจากต้นทาง*</span></div>
        <div><strong>{freshCount.toLocaleString("th-TH")}</strong><span>เวลารายงานไม่เกิน 6 ชม.</span></div>
      </div>
      <p className={styles.note}>*รวมสถานะเตือนที่อาจค้างจากรายงานเก่า ตรวจเวลาแต่ละสถานี · เวลาเชื่อมต่อสำเร็จไม่ได้ยืนยันว่าอุปกรณ์ทุกแห่งรายงานล่าสุด</p>
      <details className={styles.provenance}><summary>ข้อมูลนี้ซ้ำกับ ThaiWater หรือไม่</summary><p>ฝนของกรมทรัพยากรน้ำบางสถานีถูกส่งต่อผ่าน ThaiWater อยู่แล้ว จับคู่ได้ {matches.stats.matched.toLocaleString("th-TH")} สถานีจากหน่วยงาน รหัส และพิกัดไม่เกิน 100 เมตร จึงไม่นับเป็นแหล่งวัดอิสระสองแห่ง</p><p>อีก {matches.stats.conflicting} รหัสมีพิกัดไม่ตรงเกณฑ์ และ {matches.stats.directOnly} รหัสไม่พบคู่ในข้อมูล ThaiWater ที่รับได้รอบนี้ ตัวเลขนี้ไม่ใช่จำนวนสถานีใหม่ที่ออนไลน์ทั้งหมด</p><p>DWR เพิ่มฝน 15 นาที / 12 ชั่วโมง / ฝนรายวัน ณ 07:00 และระดับน้ำที่ยังไม่ยืนยันจุดอ้างอิง จึงแสดงแยกจากฝน 24 ชั่วโมงและระดับ ม.รทก. ของชุดเดิม สถานะ DWR ไม่ถูกแปลงเป็นสีความเสี่ยงโครงการอัตโนมัติ</p></details>
      <div className={styles.filters}>
        <label><Search size={16} /><input type="search" aria-label="ค้นหาสถานี DWR" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(12); }} placeholder="ชื่อสถานี รหัส หรือจังหวัด" /></label>
        <select aria-label="จังหวัดของสถานี DWR" value={province} onChange={(event) => { setProvince(event.target.value); setLimit(12); }}><option value="all">ทุกจังหวัดที่มีสถานี</option>{provinces.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <button type="button" aria-pressed={alertsOnly} onClick={() => { setAlertsOnly(!alertsOnly); setLimit(12); }}>เฉพาะสถานะเตือน 1–3</button>
      </div>
      <p className={styles.note}>พบ {rows.length} สถานีตามตัวกรอง · สถานะเป็นการรายงานของ DWR ไม่ใช่การยืนยันว่าน้ำท่วมโครงการ</p>
      <div className={styles.explorer}>
        <div className={styles.list} aria-label="รายการสถานี DWR">
          {rows.slice(0, limit).map((station) => { const fresh = isFresh(station.reportAt, now); return <button type="button" key={station.id} className={selected?.id === station.id ? styles.selected : ""} aria-pressed={selected?.id === station.id} onClick={() => setSelectedId(station.id)}><span><strong>{station.name}</strong><small>{station.code} · {station.province}</small></span><b style={{ color: dwrStatusColor(station.alertStatus, fresh) }}>{dwrStatusLabel(station.alertStatus, fresh)}</b></button>; })}
          {rows.length > limit && <button type="button" className={styles.more} onClick={() => setLimit(limit + 20)}>แสดงเพิ่ม · อีก {rows.length - limit} สถานี</button>}
          {!rows.length && <p className={styles.empty}>ไม่พบสถานีที่ตรงกับตัวกรอง</p>}
        </div>
        {selected && <div className={styles.detail}><DwrStationDetails station={selected} fetchedAt={feed.dwr?.fetchedAt} linkedThaiWaterName={linkedName(selected.id)} now={now} /></div>}
      </div>
    </>}
  </section>;
}
