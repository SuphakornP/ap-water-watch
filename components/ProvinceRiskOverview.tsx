"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, MapPin } from "lucide-react";
import { RISK_COLOR, type Assessment, type Risk } from "@/lib/flood-types";
import { provinceSignals } from "@/lib/map-zones";
import styles from "./ProvinceRiskOverview.module.css";

const columns: { risk: Risk; label: string }[] = [
  { risk: "priority", label: "เร่งด่วน" },
  { risk: "watch", label: "เฝ้าระวัง" },
  { risk: "normal", label: "ไม่พบสัญญาณสูง" },
  { risk: "unknown", label: "ข้อมูลไม่พอ" },
];

export default function ProvinceRiskOverview({
  items,
  province,
  onProvinceSelect,
  onViewBangkok,
}: {
  items: Assessment[];
  province: string;
  onProvinceSelect: (province: string) => void;
  onViewBangkok: () => void;
}) {
  const zones = useMemo(() => provinceSignals(items), [items]);
  const [showAll, setShowAll] = useState(false);
  const visibleZones = showAll ? zones : zones.slice(0, 5);
  const unmapped = zones.reduce((total, zone) => total + zone.unmapped, 0);

  return (
    <section className={styles.overview} aria-label="สัญญาณโครงการรายจังหวัด">
      <div className={styles.heading}>
        <div>
          <h3>พื้นที่ไหนควรตรวจสอบก่อน</h3>
          <p>สัญญาณของ {items.length} โครงการตามตัวกรอง · จัดกลุ่มตามจังหวัด ไม่ใช่ขอบเขตน้ำท่วม</p>
        </div>
        <button className={styles.regionButton} onClick={onViewBangkok}>
          <MapPin size={15} /> กรุงเทพฯ และปริมณฑล
        </button>
      </div>
      {zones.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">จังหวัด · โครงการ</th>
                {columns.map(({ risk, label }) => (
                  <th key={risk} scope="col"><span><i style={{ background: RISK_COLOR[risk] }} />{label}</span></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleZones.map(zone => (
                <tr key={zone.province} data-selected={province === zone.province}>
                  <th scope="row">
                    <button
                      onClick={() => onProvinceSelect(zone.province)}
                      aria-label={`ดู ${zone.province} ${zone.total} โครงการ`}
                      aria-pressed={province === zone.province}
                    >
                      <span>{zone.province}<small>{zone.total} โครงการ</small></span>
                      <ArrowUpRight size={14} />
                    </button>
                  </th>
                  {columns.map(({ risk, label }) => (
                    <td key={risk} style={{ color: zone.counts[risk] ? RISK_COLOR[risk] : undefined }} aria-label={`${label} ${zone.counts[risk]} โครงการ`}>
                      {zone.counts[risk]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className={styles.empty}>ไม่มีโครงการในตัวกรองนี้</p>}
      <div className={styles.footer}>
        <span>{unmapped ? `${unmapped} โครงการไม่มีพิกัด จึงไม่แสดงหมุด · ` : ""}ยังไม่มีข้อมูลยืนยันเส้นทางน้ำหรือพื้นที่น้ำท่วมรายโครงการ</span>
        {province !== "all" && <button onClick={() => onProvinceSelect("all")}>กลับทุกจังหวัด</button>}
        {zones.length > 5 && <button onClick={() => setShowAll(!showAll)}>{showAll ? "ย่อรายการจังหวัด" : `ดูทั้งหมด ${zones.length} จังหวัด`}</button>}
      </div>
    </section>
  );
}
