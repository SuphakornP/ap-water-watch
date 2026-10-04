"use client";

import {
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { bankMargin } from "@/lib/assessment";
import type { NearbyStation } from "@/lib/flood-types";
import styles from "./WaterLevelGauge.module.css";

interface WaterLevelGaugeProps {
  station: Omit<NearbyStation, "distance"> | undefined;
}

export default function WaterLevelGauge({ station }: WaterLevelGaugeProps) {
  const margin = bankMargin(station);
  const validMargin = margin !== null && Number.isFinite(margin);

  if (!validMargin) {
    const reason = !station
      ? "ไม่มีสถานีที่ใช้เทียบระดับได้"
      : !station.fresh
        ? "รอข้อมูลสถานีที่เป็นปัจจุบัน"
        : station.bank === null
          ? "ไม่มีค่าระดับตลิ่งอ้างอิง"
          : "ข้อมูลสถานีไม่ครบสำหรับเทียบระดับ";

    return (
      <figure className={`${styles.gauge} ${styles.unavailable}`}>
        <figcaption className={styles.caption}>
          ระดับน้ำเทียบตลิ่ง ณ สถานี
        </figcaption>
        <div className={styles.emptyState}>
          <span>ยังเทียบระดับไม่ได้</span>
          <p>{reason}</p>
        </div>
      </figure>
    );
  }

  // A signed difference from the station bank, never a project flood depth.
  const level = margin === 0 ? 0 : -margin;
  const magnitude = Math.abs(level);
  const extent = Math.max(1, Math.ceil(magnitude + Math.min(magnitude / 4, 1)));
  const overflow = level > 0;
  const waterColor = "#007fb5";
  const signedValue = `${level > 0 ? "+" : ""}${level.toFixed(2)}`;
  const description =
    level === 0
      ? "น้ำเท่าระดับตลิ่ง"
      : `น้ำ${overflow ? "สูง" : "ต่ำ"}กว่าตลิ่ง ${magnitude.toFixed(2)} เมตร`;

  return (
    <figure className={styles.gauge}>
      <figcaption className={styles.caption}>
        ระดับน้ำเทียบตลิ่ง ณ สถานี
        <span>เมตร</span>
      </figcaption>
      <div
        className={styles.chart}
        role="img"
        aria-label={`${description} โดยใช้ระดับตลิ่งเป็นศูนย์ ไม่ใช่ความลึกน้ำท่วมในโครงการ`}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart
            data={[{ position: 0, level }, { position: 1, level }]}
            accessibilityLayer={false}
            margin={{ top: 15, right: 8, bottom: 20, left: 0 }}
          >
            <XAxis dataKey="position" type="number" domain={[0, 1]} hide />
            <YAxis
              dataKey="level"
              type="number"
              domain={[-extent, extent]}
              ticks={[-extent, 0, extent]}
              tickFormatter={(value: number) => `${value > 0 ? "+" : ""}${value}`}
              tick={{ fill: "#687775", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <ReferenceArea
              y1={-extent}
              y2={level}
              fill={waterColor}
              fillOpacity={0.12}
              stroke="none"
            />
            <Line
              dataKey="level"
              stroke={waterColor}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            {level !== 0 && (
              <ReferenceLine
                y={0}
                stroke="#7c8678"
                strokeDasharray="4 4"
                label={{
                  value: "ตลิ่ง 0 ม.",
                  position: overflow ? "insideTopRight" : "insideBottomRight",
                  offset: 8,
                  fill: "#596653",
                  fontSize: 12,
                }}
              />
            )}
            <ReferenceLine
              y={level}
              stroke="none"
              label={{
                value: level === 0 ? "น้ำเท่าตลิ่ง 0.00 ม." : `น้ำ ${signedValue} ม.`,
                position:
                  level >= 0 ? "insideBottomLeft" : "insideTopLeft",
                offset: 8,
                fill: overflow ? "#d6293e" : waterColor,
                fontSize: 13,
                fontWeight: 500,
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className={styles.scaleNote}>จุดอ้างอิง 0 = ระดับตลิ่ง</p>
    </figure>
  );
}
