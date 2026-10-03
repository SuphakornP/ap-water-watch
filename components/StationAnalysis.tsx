"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import {
  Bar,
  BarChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { bankMargin, representativeWater } from "@/lib/assessment";
import type { Assessment, NearbyStation } from "@/lib/flood-types";
import WaterLevelGauge from "./WaterLevelGauge";
import styles from "./StationAnalysis.module.css";

type StationKind = "water" | "rain";
type RainPeriod = "1h" | "24h";

// These are the same AP screening thresholds used in assessProject.
const RAIN_THRESHOLDS = {
  "1h": { watch: 25.1, priority: 50.1, label: "1 ชั่วโมง" },
  "24h": { watch: 35.1, priority: 90.1, label: "24 ชั่วโมง" },
};

function initialRainPeriod(station: NearbyStation | undefined): RainPeriod {
  if (!station?.fresh) return "1h";
  const score = (value: number | null, period: RainPeriod) => {
    if (value === null || !Number.isFinite(value) || value < 0) return -1;
    const thresholds = RAIN_THRESHOLDS[period];
    return value >= thresholds.priority ? 2 : value >= thresholds.watch ? 1 : 0;
  };
  return score(station.value, "24h") > score(station.rain1h, "1h") ? "24h" : "1h";
}

const dateFormat = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function stationTime(station: NearbyStation | undefined) {
  const timestamp = station?.observedAt;
  return timestamp && Number.isFinite(Date.parse(timestamp))
    ? `${dateFormat.format(new Date(timestamp))} น.`
    : "ไม่ทราบเวลาวัด";
}

function RainReading({
  station,
  period,
}: {
  station: NearbyStation | undefined;
  period: RainPeriod;
}) {
  const reading = period === "1h" ? station?.rain1h : station?.value;
  const valid =
    station?.fresh &&
    reading !== null &&
    reading !== undefined &&
    Number.isFinite(reading) &&
    reading >= 0;
  const thresholds = RAIN_THRESHOLDS[period];

  if (!valid) {
    return (
      <div className={styles.emptyRain}>
        <strong>ยังแสดงค่าฝนช่วงนี้ไม่ได้</strong>
        <p>
          {!station
            ? "ไม่พบสถานีฝนใกล้เคียง"
            : !station.fresh
              ? "รอข้อมูลสถานีที่เป็นปัจจุบัน"
              : `ไม่มีค่าฝนสะสม ${thresholds.label} ที่ใช้ได้`}
        </p>
      </div>
    );
  }

  const color =
    reading >= thresholds.priority
      ? "#ac4945"
      : reading >= thresholds.watch
        ? "#a47217"
        : "#376e91";
  const maximum = Math.ceil(Math.max(thresholds.priority * 1.2, reading * 1.15) / 10) * 10;

  return (
    <div className={styles.visualization}>
      <figure className={styles.rainFigure}>
        <figcaption>ฝนสะสม ณ สถานี <span>มม.</span></figcaption>
        <div
          className={styles.rainChart}
          role="img"
          aria-label={`ฝนสะสม ${thresholds.label} ${reading.toFixed(1)} มิลลิเมตร เกณฑ์คัดกรอง AP เฝ้าระวัง ${thresholds.watch} และตรวจสอบเร่งด่วน ${thresholds.priority} มิลลิเมตร`}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart
              data={[{ value: reading, name: "ฝนสะสม" }]}
              layout="vertical"
              accessibilityLayer={false}
              margin={{ top: 16, right: 18, bottom: 2, left: 8 }}
            >
              <XAxis
                type="number"
                domain={[0, maximum]}
                ticks={[0, thresholds.watch, thresholds.priority]}
                tick={{ fontSize: 12, fill: "#687775" }}
                tickLine={false}
                axisLine={{ stroke: "#d5ded7" }}
              />
              <YAxis type="category" dataKey="name" hide />
              <Bar dataKey="value" fill={color} barSize={28} isAnimationActive={false} />
              <ReferenceLine x={thresholds.watch} stroke="#a47217" strokeDasharray="4 4" />
              <ReferenceLine x={thresholds.priority} stroke="#ac4945" strokeDasharray="4 4" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className={styles.thresholdLegend}>
          <span><i className={styles.watchMarker} />เฝ้าระวัง ≥ {thresholds.watch} มม.</span>
          <span><i className={styles.priorityMarker} />ตรวจสอบเร่งด่วน ≥ {thresholds.priority} มม.</span>
        </div>
      </figure>
      <div className={styles.readout}>
        <span>ฝนสะสม {thresholds.label}</span>
        <strong style={{ color }}>{reading.toFixed(1)} <small>มม.</small></strong>
        <b>ค่าที่วัดได้ ณ สถานี</b>
        <p>ค่าล่าสุดของช่วงเวลาที่เลือก</p>
      </div>
    </div>
  );
}

export default function StationAnalysis({ assessment }: { assessment: Assessment }) {
  const id = useId();
  const waterTab = useRef<HTMLButtonElement>(null);
  const rainTab = useRef<HTMLButtonElement>(null);
  const defaultWater = representativeWater(assessment);
  const defaultRain =
    (assessment.trigger?.kind === "rain" ? assessment.trigger : undefined) ??
    assessment.rain[0];
  const [kind, setKind] = useState<StationKind>(
    assessment.trigger?.kind ?? (assessment.water.length ? "water" : "rain"),
  );
  const [waterId, setWaterId] = useState(defaultWater?.id ?? "");
  const [rainId, setRainId] = useState(defaultRain?.id ?? "");
  const [period, setPeriod] = useState<RainPeriod>(() => initialRainPeriod(defaultRain));
  const stations = kind === "water" ? assessment.water : assessment.rain;
  const selectedId = kind === "water" ? waterId : rainId;
  const station =
    stations.find((candidate) => candidate.id === selectedId) ??
    (kind === "water" ? defaultWater : defaultRain);
  const rawMargin = bankMargin(station);
  const margin = rawMargin !== null && Number.isFinite(rawMargin) ? rawMargin : null;
  const referenceWater =
    station?.fresh && station.value !== null && Number.isFinite(station.value)
      ? station.value
      : null;
  const referenceBank =
    station?.fresh && station.bank !== null && Number.isFinite(station.bank)
      ? station.bank
      : null;
  const triggering =
    station && assessment.trigger?.id === station.id && assessment.trigger.kind === kind;

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    let next: StationKind;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      next = kind === "water" ? "rain" : "water";
    } else if (event.key === "Home") {
      next = "water";
    } else if (event.key === "End") {
      next = "rain";
    } else {
      return;
    }
    event.preventDefault();
    setKind(next);
    (next === "water" ? waterTab : rainTab).current?.focus();
  }

  return (
    <div className={styles.analysis}>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="ประเภทข้อมูลสถานี">
          {(["water", "rain"] as const).map((value) => (
            <button
              key={value}
              ref={value === "water" ? waterTab : rainTab}
              type="button"
              role="tab"
              id={`${id}-tab-${value}`}
              aria-controls={`${id}-panel`}
              aria-selected={kind === value}
              tabIndex={kind === value ? 0 : -1}
              onClick={() => setKind(value)}
              onKeyDown={onTabKeyDown}
            >
              {value === "water" ? "ระดับน้ำ" : "ฝน"}
              <span>{assessment[value].length}</span>
            </button>
          ))}
        </div>
        <span className={styles.latestLabel}>ค่าล่าสุด ณ สถานี</span>
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${kind}`}>
        <div className={styles.selection}>
          <label htmlFor={`${id}-station`}>สถานีใกล้โครงการ</label>
          <select
            id={`${id}-station`}
            value={station?.id ?? ""}
            disabled={!stations.length}
            onChange={(event) =>
              (kind === "water" ? setWaterId : setRainId)(event.target.value)
            }
          >
            {!stations.length && <option value="">ไม่มีสถานีในรัศมีที่เลือก</option>}
            {stations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.distance.toFixed(1)} กม.
                {assessment.trigger?.id === item.id && assessment.trigger.kind === kind
                  ? " · ใช้คัดกรองโครงการ"
                  : ""}
                {!item.fresh ? " · ข้อมูลล่าช้า" : ""}
              </option>
            ))}
          </select>
        </div>
        {kind === "rain" && (
          <div className={styles.periods} role="group" aria-label="ช่วงเวลาสะสมฝน">
            {(["1h", "24h"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={period === value}
                onClick={() => setPeriod(value)}
              >
                {RAIN_THRESHOLDS[value].label}
              </button>
            ))}
          </div>
        )}
        {kind === "water" ? (
          <div className={styles.visualization}>
            <WaterLevelGauge station={station} />
            <div className={styles.readout}>
              <span>ระยะน้ำถึงตลิ่ง ณ สถานี</span>
              <strong className={margin !== null && margin <= 0 ? styles.warningValue : undefined}>
                {margin === null ? "—" : Math.abs(margin).toFixed(2)} <small>เมตร</small>
              </strong>
              <b>
                {margin === null
                  ? "ยังเทียบระดับไม่ได้"
                  : margin < 0
                    ? "น้ำสูงกว่าตลิ่ง"
                    : margin === 0
                      ? "น้ำเท่าระดับตลิ่ง"
                      : "น้ำต่ำกว่าตลิ่ง"}
              </b>
              <p>ใช้ระดับตลิ่งของสถานีเป็นจุดอ้างอิง</p>
              {(referenceWater !== null || referenceBank !== null) && (
                <dl className={styles.referenceLevels} aria-label="ค่าสถานีเทียบระดับทะเลปานกลาง">
                  {referenceWater !== null && (
                    <div><dt>ระดับน้ำ</dt><dd>{referenceWater.toFixed(2)} ม.รทก.</dd></div>
                  )}
                  {referenceBank !== null && (
                    <div><dt>ตลิ่ง</dt><dd>{referenceBank.toFixed(2)} ม.รทก.</dd></div>
                  )}
                </dl>
              )}
            </div>
          </div>
        ) : (
          <RainReading station={station} period={period} />
        )}
        {station && (
          <div className={styles.stationMeta}>
            <p><b>{station.name}</b> · ห่าง {station.distance.toFixed(1)} กม.</p>
            <span>วัด {stationTime(station)}{!station.fresh && " · ข้อมูลล่าช้า / ใช้ประเมินไม่ได้"}</span>
            {triggering && <span className={styles.triggerLabel}>สถานีที่ใช้คัดกรองโครงการนี้</span>}
          </div>
        )}
        <p className={styles.measurementNote}>
          {kind === "water"
            ? "ระดับสถานีไม่ใช่ความลึกน้ำท่วมในโครงการ และระยะใกล้ไม่ได้ยืนยันว่าน้ำเชื่อมถึงกัน"
            : "เส้นเกณฑ์ใช้คัดกรองโครงการของ AP ไม่ใช่ประกาศเตือนภัยจากทางราชการ หรือการยืนยันน้ำท่วมในโครงการ"}
        </p>
      </div>
    </div>
  );
}
