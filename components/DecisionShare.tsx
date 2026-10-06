"use client";

import { useState } from "react";
import { Copy, Download, FileImage, Printer, Share2 } from "lucide-react";
import type { Assessment, Feed } from "@/lib/flood-types";
import {
  createDecisionSnapshot,
  drawDecisionSnapshot,
  snapshotPrintHtml,
  snapshotSvg,
  type DecisionSnapshot,
} from "@/lib/decision-export";
import styles from "./DecisionShare.module.css";

interface DecisionShareProps {
  items: Assessment[];
  feed: Feed;
  radius: number;
  projectId?: string;
  scopeLabel: string;
  demo?: boolean;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function exportImage(snapshot: DecisionSnapshot, format: "svg" | "png") {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("เบราว์เซอร์นี้ไม่รองรับการสร้างภาพ กรุณาใช้พิมพ์ / PDF");
  const font = (size: number, weight: number) => `${weight} ${size}px Tahoma, sans-serif`;
  const drawing = drawDecisionSnapshot(snapshot, (value, size, weight) => {
    context.font = font(size, weight);
    return context.measureText(value).width;
  });
  const filename = `ap-water-watch${snapshot.demo ? "-demo" : ""}-${snapshot.generatedAt.replace(/[:.]/g, "-")}.${format}`;
  if (format === "svg") {
    downloadBlob(new Blob([snapshotSvg(drawing)], { type: "image/svg+xml;charset=utf-8" }), filename);
    return;
  }
  canvas.width = drawing.width;
  canvas.height = drawing.height;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, drawing.width, drawing.height);
  for (const command of drawing.commands) {
    context.fillStyle = command.color;
    if (command.kind === "rect") context.fillRect(command.x, command.y, command.width, command.height);
    else {
      context.font = font(command.size, command.weight);
      context.fillText(command.value, command.x, command.y);
    }
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("สร้างภาพไม่สำเร็จ กรุณาลอง SVG หรือพิมพ์ / PDF")), "image/png");
  });
  downloadBlob(blob, filename);
}

function printSnapshot(snapshot: DecisionSnapshot): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.title = "รายงานสถานการณ์สำหรับพิมพ์";
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
    const timeout = window.setTimeout(() => {
      frame.remove();
      reject(new Error("เปิดรายงานสำหรับพิมพ์ไม่สำเร็จ กรุณาลองใหม่"));
    }, 15_000);
    frame.onload = () => {
      window.clearTimeout(timeout);
      const target = frame.contentWindow;
      if (!target) { frame.remove(); reject(new Error("เปิดรายงานสำหรับพิมพ์ไม่สำเร็จ")); return; }
      target.onafterprint = () => frame.remove();
      try {
        target.focus();
        target.print();
        resolve();
        window.setTimeout(() => frame.remove(), 120_000);
      } catch (error) {
        frame.remove();
        reject(error);
      }
    };
    frame.srcdoc = snapshotPrintHtml(snapshot);
    document.body.appendChild(frame);
  });
}

export default function DecisionShare(props: DecisionShareProps) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const ready = !!props.feed.fetchedAt && Number.isFinite(Date.parse(props.feed.fetchedAt));
  const disabled = !ready || busy;

  async function copyLink() {
    setBusy(true);
    setStatus(null);
    const url = new URL(window.location.href);
    if (props.projectId) url.searchParams.set("project", props.projectId);
    try {
      if (!navigator.clipboard) throw new Error("เบราว์เซอร์ไม่อนุญาตให้คัดลอกอัตโนมัติ เลือกและคัดลอกลิงก์ด้านล่าง");
      await navigator.clipboard.writeText(url.toString());
      setManualUrl("");
      setStatus({ text: "คัดลอกลิงก์พร้อมตัวกรองแล้ว ผู้รับเปิดดูข้อมูลล่าสุดตามสิทธิ์เข้าถึง", error: false });
    } catch {
      setManualUrl(url.toString());
      setStatus({ text: "คัดลอกอัตโนมัติไม่ได้ เลือกและคัดลอกลิงก์ด้านล่าง", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function exportSnapshot(format: "png" | "svg" | "print") {
    setBusy(true);
    setStatus(null);
    try {
      const snapshot = createDecisionSnapshot(props);
      if (format === "print") await printSnapshot(snapshot);
      else await exportImage(snapshot, format);
      setStatus({ text: format === "print" ? "เปิดหน้าต่างพิมพ์แล้ว เลือกบันทึกเป็น PDF ได้" : `สร้างไฟล์ ${format.toUpperCase()} และเริ่มดาวน์โหลดแล้ว`, error: false });
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : "สร้างรายงานไม่สำเร็จ กรุณาลองใหม่", error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.share} aria-label={props.projectId ? "แชร์สรุปโครงการนี้" : "แชร์สรุปตามตัวกรอง"}>
      <div className={styles.heading}>
        <Share2 size={17} aria-hidden="true" />
        <div><strong>{props.projectId ? "ส่งต่อสรุปโครงการนี้" : "ส่งต่อสถานการณ์"}</strong><small>{ready ? `${props.items.length} โครงการ${props.items.length > 5 ? " · ภาพสรุป 5 ลำดับแรก" : ""}${props.demo ? " · ข้อมูลสาธิต" : ""}` : "รอข้อมูลก่อนสร้างสรุป"}</small></div>
      </div>
      <div className={styles.actions}>
        <button type="button" onClick={copyLink} disabled={disabled}><Copy size={15} aria-hidden="true" />คัดลอกลิงก์</button>
        <button type="button" onClick={() => exportSnapshot("png")} disabled={disabled}><FileImage size={15} aria-hidden="true" />ภาพ PNG</button>
        <details className={styles.more}>
          <summary aria-label="รูปแบบส่งออกเพิ่มเติม"><Download size={15} aria-hidden="true" />เพิ่มเติม</summary>
          <div className={styles.menu}>
            <button type="button" onClick={() => exportSnapshot("svg")} disabled={disabled}><FileImage size={15} aria-hidden="true" />ภาพ SVG</button>
            <button type="button" onClick={() => exportSnapshot("print")} disabled={disabled}><Printer size={15} aria-hidden="true" />พิมพ์ / PDF</button>
          </div>
        </details>
      </div>
      {busy && <p className={styles.status} role="status">กำลังเตรียมข้อมูลสำหรับส่งต่อ…</p>}
      {status && <p className={`${styles.status} ${status.error ? styles.error : ""}`} role={status.error ? "alert" : "status"}>{status.text}</p>}
      {manualUrl && <input className={styles.manualUrl} aria-label="ลิงก์สำหรับคัดลอก" readOnly value={manualUrl} onFocus={(event) => event.target.select()} />}
      <p className={styles.note}>ลิงก์เปิดข้อมูลล่าสุดตามสิทธิ์เข้าถึง · ภาพและ PDF เก็บสถานการณ์ ณ เวลาส่งออก</p>
    </section>
  );
}
