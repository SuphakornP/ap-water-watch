"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Download, FileImage, Printer, RefreshCw, Share2 } from "lucide-react";
import { RISK_LABEL, type Assessment, type Feed } from "@/lib/flood-types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  createDecisionSnapshot,
  drawDecisionSnapshot,
  snapshotPrintHtml,
  snapshotSvg,
  snapshotTime,
  SNAPSHOT_FONT_FAMILY,
  SNAPSHOT_FORECAST,
  SNAPSHOT_LIMITATION,
  type DecisionSnapshot,
  type SnapshotDrawing,
} from "@/lib/decision-export";
import styles from "./DecisionShare.module.css";

interface DecisionShareProps {
  items: Assessment[];
  feed: Feed;
  radius: number;
  projectId?: string;
  preferredProjectId?: string;
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

interface PreviewSource extends DecisionShareProps {
  mode: "project" | "portfolio";
  generatedAt: string;
}

interface PreparedPreview {
  snapshot: DecisionSnapshot;
  drawing: SnapshotDrawing;
  png: Blob;
  imageUrl: string;
}

async function preparePreview(snapshot: DecisionSnapshot): Promise<PreparedPreview> {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("เบราว์เซอร์นี้ไม่รองรับการสร้างภาพ กรุณาใช้พิมพ์ / PDF");
  const font = (size: number, weight: number) => `${weight} ${size}px ${SNAPSHOT_FONT_FAMILY}`;
  const drawing = drawDecisionSnapshot(snapshot, (value, size, weight) => {
    context.font = font(size, weight);
    return context.measureText(value).width;
  });
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
  return { snapshot, drawing, png: blob, imageUrl: canvas.toDataURL("image/png") };
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
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<PreviewSource | null>(null);
  const [preview, setPreview] = useState<PreparedPreview | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [search, setSearch] = useState("");
  const requestId = useRef(0);
  const previewButton = useRef<HTMLButtonElement>(null);
  useEffect(() => () => { requestId.current += 1; }, []);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const ready = !!props.feed.fetchedAt && Number.isFinite(Date.parse(props.feed.fetchedAt));
  const disabled = !ready || !props.items.length || busy;

  async function buildPreview(next: PreviewSource) {
    const request = ++requestId.current;
    setSource(next);
    setPreview(null);
    setPreparing(true);
    setPreviewError("");
    setStatus(null);
    try {
      const result = await preparePreview(createDecisionSnapshot(next, next.generatedAt));
      if (request === requestId.current) setPreview(result);
    } catch (error) {
      if (request === requestId.current) setPreviewError(error instanceof Error ? error.message : "สร้างภาพตัวอย่างไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      if (request === requestId.current) setPreparing(false);
    }
  }

  function openPreview() {
    const preferred = props.projectId ?? props.preferredProjectId;
    const selected = props.items.find((item) => item.project.id === preferred) ?? props.items[0];
    setSearch("");
    setOpen(true);
    void buildPreview({ ...props, mode: "project", projectId: selected?.project.id, generatedAt: new Date().toISOString() });
  }

  function refreshPreview() {
    if (!source) return;
    // Keep the selected project explicit: a changed filter must not silently export a different one.
    void buildPreview({ ...props, mode: source.mode, projectId: source.projectId, generatedAt: new Date().toISOString() });
  }

  function changeOpen(value: boolean) {
    setOpen(value);
    if (!value) {
      requestId.current += 1;
      setPreview(null);
      setSource(null);
      setPreparing(false);
    }
  }

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
    if (!preview) return;
    setBusy(true);
    setStatus(null);
    try {
      const { snapshot, drawing, png } = preview;
      if (format === "print") await printSnapshot(snapshot);
      else {
        const project = snapshot.mode === "project" ? `-${source?.projectId ?? "project"}` : "-portfolio";
        const filename = `ap-water-watch${snapshot.demo ? "-demo" : ""}${project}-${snapshot.generatedAt.replace(/[:.]/g, "-")}.${format}`;
        downloadBlob(format === "png" ? png : new Blob([snapshotSvg(drawing)], { type: "image/svg+xml;charset=utf-8" }), filename);
      }
      setStatus({ text: format === "print" ? "เปิดหน้าต่างพิมพ์แล้ว เลือกบันทึกเป็น PDF ได้" : `สร้างไฟล์ ${format.toUpperCase()} และเริ่มดาวน์โหลดแล้ว`, error: false });
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : "สร้างรายงานไม่สำเร็จ กรุณาลองใหม่", error: true });
    } finally {
      setBusy(false);
    }
  }

  const selected = source?.items.find((item) => item.project.id === source.projectId);
  const selectedSnapshot = preview?.snapshot.mode === "project" ? preview.snapshot.projects[0] : null;
  const matching = source?.items.filter((item) => item.project.id === source.projectId || item.project.name.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim())) ?? [];
  const feedback = status && <p className={`${styles.status} ${status.error ? styles.error : ""}`} role={status.error ? "alert" : "status"}>{status.text}</p>;

  return (
    <section className={styles.share} aria-label={props.projectId ? "แชร์สรุปโครงการนี้" : "แชร์สรุปตามตัวกรอง"}>
      <div className={styles.heading}>
        <Share2 size={17} aria-hidden="true" />
        <div><strong>{props.projectId ? "ส่งต่อสรุปโครงการนี้" : "ส่งต่อสถานการณ์"}</strong><small>{ready ? `${props.items.length} โครงการ · เลือกสรุปรายโครงการหรือภาพรวม${props.demo ? " · ข้อมูลสาธิต" : ""}` : "รอข้อมูลก่อนสร้างสรุป"}</small></div>
      </div>
      <div className={styles.actions}>
        <button type="button" onClick={copyLink} disabled={disabled}><Copy size={15} aria-hidden="true" />คัดลอกลิงก์</button>
        <button ref={previewButton} type="button" className={styles.primary} onClick={openPreview} disabled={disabled}><FileImage size={15} aria-hidden="true" />Infographic รายโครงการ</button>
      </div>
      {busy && <p className={styles.status} role="status">กำลังเตรียมข้อมูลสำหรับส่งต่อ…</p>}
      {!open && feedback}
      {manualUrl && <input className={styles.manualUrl} aria-label="ลิงก์สำหรับคัดลอก" readOnly value={manualUrl} onFocus={(event) => event.target.select()} />}
      <p className={styles.note}>ลิงก์เปิดข้อมูลล่าสุดตามสิทธิ์เข้าถึง · ภาพและ PDF เก็บสถานการณ์ ณ เวลาส่งออก</p>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className={styles.dialog} onCloseAutoFocus={(event) => { event.preventDefault(); previewButton.current?.focus(); }}>
          <DialogHeader className={styles.dialogHeader}>
            <DialogTitle>สรุปพร้อมส่งต่อ</DialogTitle>
            <DialogDescription>ตรวจชื่อโครงการ สถานะ และเวลาวัดในภาพ ก่อนส่งให้ทีมปฏิบัติการ</DialogDescription>
          </DialogHeader>
          <div className={styles.previewLayout}>
            <div className={styles.controls}>
              {!props.projectId && <div className={styles.mode} role="group" aria-label="รูปแบบสรุป">
                <button type="button" aria-pressed={source?.mode === "project"} onClick={() => source && void buildPreview({ ...source, mode: "project" })}>รายโครงการ</button>
                <button type="button" aria-pressed={source?.mode === "portfolio"} onClick={() => source && void buildPreview({ ...source, mode: "portfolio" })}>ภาพรวม</button>
              </div>}
              {source?.mode === "project" && !props.projectId && <>
                <label className={styles.field}>ค้นหาโครงการ<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="พิมพ์ชื่อโครงการ" /></label>
                <label className={styles.field}>โครงการในภาพ<select aria-label="โครงการในภาพ" value={source.projectId ?? ""} onChange={(event) => void buildPreview({ ...source, projectId: event.target.value })}>
                  {!selected && <option value="">เลือกโครงการ</option>}
                  {matching.map((item) => <option key={item.project.id} value={item.project.id}>{item.project.name}</option>)}
                </select></label>
              </>}
              <div className={styles.previewSummary}>
                <strong>{source?.mode === "project" ? selected?.project.name ?? "เลือกโครงการที่ต้องการสรุป" : "ภาพรวมตามตัวกรอง"}</strong>
                <p>{source?.mode === "project" ? selectedSnapshot ? RISK_LABEL[selectedSnapshot.risk] : "กำลังตรวจข้อมูลสำหรับภาพ" : `${source?.items.length ?? 0} โครงการ · แสดงรายละเอียดไม่เกิน 5 ลำดับแรกที่ควรตรวจสอบ`}</p>
                <p>ภาพเก็บข้อมูล ณ {snapshotTime(source?.generatedAt ?? null)} และจะไม่เปลี่ยนขณะตรวจทาน</p>
              </div>
              <div className={`${styles.actions} ${styles.exportActions}`}>
                <button type="button" className={styles.primary} disabled={!preview || busy || preparing} onClick={() => void exportSnapshot("png")}><Download size={16} aria-hidden="true" />ดาวน์โหลด PNG</button>
                <button type="button" disabled={!preview || busy || preparing} onClick={() => void exportSnapshot("svg")}><FileImage size={16} aria-hidden="true" />SVG</button>
                <button type="button" disabled={!preview || busy || preparing} onClick={() => void exportSnapshot("print")}><Printer size={16} aria-hidden="true" />พิมพ์ / PDF</button>
                <button type="button" disabled={preparing || busy || !ready} onClick={refreshPreview}><RefreshCw size={15} aria-hidden="true" />สร้างจากข้อมูลล่าสุดในหน้า</button>
              </div>
              {feedback}
              {previewError && <p className={styles.error} role="alert">{previewError}</p>}
              <p className={styles.note}>PNG ตรงกับภาพตัวอย่าง · PDF จัดเป็นรายงานสำหรับพิมพ์ · การทำเช็กลิสต์ในเครื่องไม่รวมในภาพ</p>
            </div>
            <div className={styles.previewPane} aria-busy={preparing}>
              {preparing && <p className={styles.loading} role="status">กำลังจัดภาพตัวอย่าง…</p>}
              {preview && <>
                {/* Canvas-generated local image: optimization would change the exact download preview. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.previewImage} src={preview.imageUrl} width={preview.drawing.width} height={preview.drawing.height} alt={selectedSnapshot ? `สรุป ${selectedSnapshot.name} · ${RISK_LABEL[selectedSnapshot.risk]}` : "ภาพรวมสถานการณ์โครงการตามตัวกรอง"} />
                <details className={styles.textVersion}><summary>อ่านรายละเอียดภาพเป็นข้อความ</summary>
                  <p>{preview.snapshot.demo ? "ข้อมูลสาธิต · ห้ามใช้ตัดสินใจสถานการณ์จริง" : ""} {preview.snapshot.scope} · ดึงข้อมูล {snapshotTime(preview.snapshot.fetchedAt)} · สร้างภาพ {snapshotTime(preview.snapshot.generatedAt)}</p>
                  <p>คัดกรองสถานีในรัศมี {preview.snapshot.radius} กม. · {preview.snapshot.total} โครงการ</p>
                  {preview.snapshot.mode === "portfolio" && <p>{Object.entries(preview.snapshot.counts).map(([risk, count]) => `${RISK_LABEL[risk as keyof typeof RISK_LABEL]} ${count}`).join(" · ")}</p>}
                  {preview.snapshot.projects.map((project) => <article key={project.id}>
                    <strong>{project.name} · {RISK_LABEL[project.risk]}</strong>
                    <p>{project.province} · รหัส {project.code}</p><p>{project.why}</p><p>{project.confidence}</p>
                    {project.metrics.map((metric) => <p key={metric.id}>{metric.label}: {metric.displayValue} {metric.unit} · {metric.context}</p>)}
                    <p>{project.impact}</p><ol>{project.actions.map((action) => <li key={action}>{action}</li>)}</ol><p>{project.evidence}</p>
                  </article>)}
                  <p>{preview.snapshot.nextReview}</p><p>{SNAPSHOT_LIMITATION}</p><p>{SNAPSHOT_FORECAST}</p><p>{preview.snapshot.sources}</p>
                </details>
              </>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
