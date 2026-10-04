"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, ChevronRight, ExternalLink, Info, MapPin, Maximize2, RefreshCw, VideoOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cameraImageState, failedSnapshot, type CameraCatalog, type CameraRadius, type CameraSnapshot, type NearbyCamera } from "@/lib/cameras";
import styles from "./NearbyCameras.module.css";

const format = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
function timestamp(value: string | null | undefined, empty: string) {
  return value && Number.isFinite(Date.parse(value)) ? `${format.format(new Date(value))} น.` : empty;
}

type Props = {
  projectName: string;
  hasCoordinates: boolean;
  cameras: NearbyCamera[];
  catalog: CameraCatalog | null;
  loading: boolean;
  error: string;
  radius: CameraRadius;
  onRadiusChange: (radius: CameraRadius) => void;
  cameraId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onMap: (id: string) => void;
  onAction: () => void;
};

export default function NearbyCameras({ projectName, hasCoordinates, cameras, catalog, loading, error, radius, onRadiusChange, cameraId, onSelect, onRefresh, onMap, onAction }: Props) {
  const selected = cameras.find(c => c.id === cameraId) ?? cameras[0];
  const [pageSize, setPageSize] = useState(8);
  useEffect(() => setPageSize(8), [radius, projectName]);
  const visible = cameras.slice(0, pageSize);
  if (selected && !visible.some(c => c.id === selected.id)) visible.push(selected);
  const failedSources = catalog?.sources.filter(source => source.state === "error") ?? [];
  return (
    <section id="nearby-cameras" className={styles.panel} aria-labelledby="camera-heading">
      <div className={styles.heading}>
        <div><span className="eyebrow">CHECK THE SURROUNDINGS</span><h3 id="camera-heading"><Camera size={24} /> กล้องใกล้โครงการ</h3><p>{projectName} · ระยะเส้นตรงจากพิกัดโครงการ</p></div>
        <button className={styles.refresh} onClick={onRefresh} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} /> รีเฟรชรายชื่อ</button>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.radius} role="group" aria-label="รัศมีกล้อง">{([5, 10, 20] as const).map(value => <button key={value} aria-pressed={radius === value} onClick={() => onRadiusChange(value)}>{value} กม.</button>)}</div>
        <span role="status">{loading && !catalog ? "กำลังค้นหากล้อง…" : `${cameras.length} กล้องในระยะ ${radius} กม.`}</span>
        <small>รัศมีกล้องแยกจากรัศมีสถานีน้ำ/ฝน</small>
      </div>
      {(error || failedSources.length > 0) && <div className={styles.warning} role="alert">{error || failedSources.map(source => source.note).join(" · ")}</div>}
      {!hasCoordinates ? <div className={styles.empty}><MapPin size={26} /><b>โครงการนี้ไม่มีพิกัดที่ใช้ค้นหากล้องได้</b><p>ตรวจสอบตำแหน่งกับทีมโครงการ</p></div> : cameras.length === 0 ? <div className={styles.empty}><Camera size={28} /><b>{loading ? "กำลังอ่านทะเบียนกล้อง" : `ไม่พบกล้องในทะเบียนที่มี ภายใน ${radius} กม.`}</b><p>ไม่ได้หมายความว่าพื้นที่นี้ไม่มีกล้องหรือปลอดภัย</p>{radius < 20 && <button className="button-outline" onClick={() => onRadiusChange(radius === 5 ? 10 : 20)}>ขยายเป็น {radius === 5 ? 10 : 20} กม. <ChevronRight size={16} /></button>}</div> : (
        <div className={styles.workspace}>
          <div className={styles.list} aria-label="รายการกล้องเรียงตามระยะ">
            {visible.map((camera, i) => <button key={camera.id} className={styles.item} aria-pressed={camera.id === selected?.id} onClick={() => onSelect(camera.id)}>
              <span className={styles.number}>{cameras.indexOf(camera) + 1 || i + 1}</span><span><b>{camera.name}</b><small>{camera.province} · {camera.owner}</small><em>{camera.availability === "offline" ? "ต้นทางปิดใช้งานในทะเบียน" : camera.display === "link" ? "ดูภาพที่ต้นทาง" : "เปิดดูภาพนิ่ง"}</em></span><strong>{camera.distance.toFixed(1)}<small>กม.</small></strong>
            </button>)}
            {pageSize < cameras.length && <button className={styles.more} onClick={() => setPageSize(value => value + 8)}>ดูอีก {Math.min(8, cameras.length - pageSize)} กล้อง จากทั้งหมด {cameras.length} <ChevronRight size={15} /></button>}
          </div>
          {selected && <CameraView key={selected.id} camera={selected} catalogTime={catalog?.sources.find(s => s.id === selected.sourceId)?.fetchedAt ?? null} onMap={() => onMap(selected.id)} />}
        </div>
      )}
      <div className={styles.limit}><Info size={18} /><p>ภาพแสดงเฉพาะมุมมองของกล้อง ความใกล้ไม่ยืนยันว่าสภาพในภาพตรงกับภายในโครงการ ไม่ใช้ภาพเพียงอย่างเดียวสรุปว่าโครงการน้ำท่วมหรือปลอดภัย</p></div>
      <div className={styles.footer}><span>พื้นที่รองรับ: ถนน กทม. จุดเฝ้าระวังน้ำ ThaiWater และคลอง/สถานีสูบน้ำกรมชลประทานบางจุด · ไม่ครอบคลุมทุกพื้นที่</span><button onClick={onAction}>ตรวจสอบกับทีมและสิ่งที่ควรทำ <ChevronRight size={16} /></button></div>
      <details className={styles.sources}><summary>ที่มาและเวลาของทะเบียนกล้อง</summary>{catalog?.sources.map(source => <p key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.name} <ExternalLink size={12} /></a> · {source.count} จุด<br />อ่านทะเบียน {timestamp(source.fetchedAt, "ยังอ่านไม่สำเร็จ")}<br />{source.note}</p>)}<p>ยังไม่ยืนยันสิทธิ์เผยแพร่ภาพซ้ำ จึงไม่ดึงภาพหรือสตรีมจากกล้องเหล่านี้ · เวลาอ่านทะเบียนไม่ใช่เวลาถ่ายภาพ</p></details>
    </section>
  );
}

function CameraView({ camera, catalogTime, onMap }: { camera: NearbyCamera; catalogTime: string | null; onMap: () => void }) {
  const [snapshot, setSnapshot] = useState<CameraSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const controller = useRef<AbortController | null>(null);
  const lastAttempt = useRef(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => { clearInterval(timer); controller.current?.abort(); };
  }, []);
  async function load() {
    if (loading || Date.now() - lastAttempt.current < 60_000 || camera.display !== "snapshot") return;
    lastAttempt.current = Date.now();
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    try {
      const response = await fetch(`/api/cameras/${encodeURIComponent(camera.id)}`, { signal: request.signal });
      if (!response.ok) throw new Error(`Camera snapshot HTTP ${response.status}`);
      const result: CameraSnapshot = await response.json();
      if (result.cameraId !== camera.id) throw new Error("Camera response does not match selected camera");
      if (request.signal.aborted) return;
      setSnapshot(previous => result.state === "error" && previous?.imageUrl ? { ...previous, state: "error", reused: true, checkedAt: result.checkedAt, message: result.message } : result);
    } catch (error) {
      if (request.signal.aborted) return;
      console.error("Camera snapshot request failed", error);
      setSnapshot(previous => failedSnapshot(camera.id, previous, "โหลดภาพรอบใหม่ไม่ได้ กรุณาตรวจสอบที่ต้นทาง"));
    } finally { if (!request.signal.aborted) setLoading(false); }
  }
  const isLink = camera.display === "link" || snapshot?.state === "link";
  const state = isLink ? "ดูภาพที่ต้นทางเท่านั้น" : cameraImageState(snapshot, now);
  const image = snapshot?.imageUrl;
  function imageError() {
    setSnapshot(previous => previous ? { ...previous, imageUrl: null, state: "error", reused: false, message: "ไฟล์ภาพโหลดไม่ได้ เปิดดูที่ต้นทาง" } : previous);
  }
  return <article className={styles.viewer} aria-label="รายละเอียดกล้องที่เลือก">
    <div className={styles.viewerHeading}><span><Camera size={16} /> กล้องที่เลือก</span><button onClick={onMap}><MapPin size={15} /> ดูบนแผนที่</button></div>
    <h4>{camera.name}</h4><p className={styles.location}>{camera.location || camera.province} · {camera.distance.toFixed(2)} กม.</p>
    {image ? <button className={styles.imageButton} onClick={() => setExpanded(true)} aria-label={`ขยายภาพ ${camera.name}`}><img src={image} alt={`ภาพจากกล้อง ${camera.name}`} onError={imageError} /><span><Maximize2 size={16} /> ขยายภาพ</span></button> : <div className={styles.sourceView}>
      {camera.availability === "offline" || snapshot?.state === "offline" ? <VideoOff size={32} /> : <Camera size={32} />}
      <b>{camera.availability === "offline" ? "ต้นทางปิดใช้งานกล้องนี้ในทะเบียน" : isLink ? "เปิดภาพจากหน่วยงานเจ้าของกล้อง" : state}</b>
      <p>{isLink ? camera.sourceNote : snapshot?.message || "โหลดเฉพาะกล้องที่เปิดดู"}</p>
      {isLink && <a className={styles.sourceButton} href={camera.sourceUrl} target="_blank" rel="noopener noreferrer">เปิดดูที่ต้นทาง <ExternalLink size={17} /></a>}
    </div>}
    <p className={styles.state} role="status">{loading ? "กำลังดึงภาพ…" : state}{camera.availability === "unknown" && isLink ? " · ยังยืนยันสถานะออนไลน์ไม่ได้" : ""}</p>
    <dl className={styles.facts}><div><dt>เวลาที่บันทึกภาพ</dt><dd>{timestamp(snapshot?.capturedAt, "ไม่ทราบเวลาของภาพ")}</dd></div><div><dt>เวลาที่ระบบดึงภาพ</dt><dd>{timestamp(snapshot?.fetchedAt, "ยังไม่ได้ดึงภาพ")}</dd></div><div><dt>หน่วยงานเจ้าของ</dt><dd>{camera.owner}</dd></div><div><dt>ตำแหน่งกล้อง</dt><dd>{camera.lat.toFixed(5)}, {camera.lng.toFixed(5)}</dd></div></dl>
    <div className={styles.viewerActions}>{!isLink && <button disabled={loading || now - lastAttempt.current < 60_000} onClick={() => void load()}><RefreshCw size={16} /> {snapshot ? "รีเฟรชภาพ" : "เปิดดูภาพนิ่ง"}</button>}<a href={camera.sourceUrl} target="_blank" rel="noopener noreferrer">แหล่งต้นทาง <ExternalLink size={14} /></a></div>
    {camera.sourceUrl.startsWith("http:") && <small className={styles.httpNote}>เว็บไซต์เดิมของ กทม. ใช้ HTTP · เปิดในแท็บใหม่ และอาจไม่พร้อมใช้งานบางช่วง</small>}
    <small className={styles.catalogTime}>อ่านทะเบียน {timestamp(catalogTime, "ไม่ทราบเวลา")} · ไม่ใช่เวลาถ่ายภาพ</small>
    <Dialog open={expanded} onOpenChange={setExpanded}><DialogContent className={styles.dialog}><DialogHeader><DialogTitle>{camera.name}</DialogTitle><DialogDescription>{state} · บันทึกภาพ {timestamp(snapshot?.capturedAt, "ไม่ทราบเวลาของภาพ")}</DialogDescription></DialogHeader>{image && <img src={image} alt={`ภาพขยายจากกล้อง ${camera.name}`} onError={imageError} />}<p>มุมมองของกล้อง ไม่ยืนยันสภาพภายในโครงการ</p></DialogContent></Dialog>
  </article>;
}
