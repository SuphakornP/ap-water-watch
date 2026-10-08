"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RotateCcw, RotateCw } from "lucide-react";
import { RISK_COLOR, type Risk } from "@/lib/flood-types";

export default function StationCrossSection({ margin, risk, reducedMotion = false }: { margin: number | null; risk: Risk; reducedMotion?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ update: (value: number | null, severity: Risk) => void; rotate: (step: number) => void; reset: () => void } | null>(null);
  const currentMargin = useRef(margin);
  const currentRisk = useRef(risk);
  const [error, setError] = useState(false);
  useEffect(() => { currentMargin.current = margin; currentRisk.current = risk; api.current?.update(margin, risk); }, [margin, risk]);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); }
    catch (cause) { console.warn("Station cross-section unavailable", cause); setError(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 60);
    const initial = new THREE.Vector3(6.5, 5.5, 7.5);
    camera.position.copy(initial);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.1, 0);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = false;
    controls.enabled = !window.matchMedia("(pointer: coarse)").matches;
    controls.minPolarAngle = Math.PI / 6;
    controls.maxPolarAngle = Math.PI / 2.2;
    renderer.domElement.style.touchAction = "pan-y";
    controls.update();
    scene.add(new THREE.HemisphereLight(0xe8f7ff, 0x8294a3, 3));
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(3, 8, 4); scene.add(sun);
    const geometry: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number, opacity = 1) => {
      const g = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, transparent: opacity < 1, opacity });
      geometry.push(g); materials.push(m);
      const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); scene.add(mesh); return mesh;
    };
    // Schematic cross-section, never a surveyed river or a project flood model.
    const bankY = 0.7, floorY = -0.7;
    box(5.4, 0.15, 3.6, 0, -0.8, 0, 0xdde8ef);
    for (const side of [-1, 1]) {
      box(1.4, 1.4, 3.5, side * 1.98, 0, 0, 0xb8c7d0);
      box(1.45, 0.1, 3.55, side * 1.98, bankY, 0, 0xe9f1ee);
      box(1.42, 0.045, 3.53, side * 1.98, -0.25, 0, 0xd6e0e5);
    }
    const water = box(2.5, 1, 3.5, 0, 0, 0, 0x079bd6, 0.83);
    box(5.25, 0.025, 0.025, 0, bankY + 0.055, 1.85, 0x41536d);
    const measured = box(2.5, 0.035, 0.045, 0, 0, 1.85, 0x007fb5);
    const render = () => { if (!document.hidden) renderer.render(scene, camera); };
    const update = (value: number | null, severity: Risk) => {
      const valid = value !== null && Number.isFinite(value);
      water.visible = measured.visible = valid;
      if (valid && value !== null) {
        const levelY = THREE.MathUtils.clamp(bankY - value * 0.35, floorY + 0.06, bankY + 0.55);
        water.scale.y = levelY - floorY;
        water.position.y = (levelY + floorY) / 2;
        measured.position.y = levelY;
        measured.material.color.set(severity === "normal" ? "#007fb5" : RISK_COLOR[severity]);
      }
      render();
    };
    api.current = {
      update,
      rotate(step) { const offset = camera.position.clone().sub(controls.target); offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), step); camera.position.copy(controls.target).add(offset); controls.update(); render(); },
      reset() { camera.position.copy(initial); controls.update(); render(); },
    };
    controls.addEventListener("change", render);
    const resize = new ResizeObserver(() => {
      const width = container.clientWidth, height = container.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); render();
    });
    resize.observe(container);
    document.addEventListener("visibilitychange", render);
    update(currentMargin.current, currentRisk.current);
    return () => {
      resize.disconnect(); document.removeEventListener("visibilitychange", render); controls.dispose();
      geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); renderer.dispose();
      container.removeChild(renderer.domElement); api.current = null;
    };
  }, []);

  return <figure className="station-scene" data-reduced-motion={reducedMotion}>
    <figcaption><b>ภาพตัดขวางระดับน้ำ ณ สถานี</b><span>ภาพอธิบาย · ไม่ใช่สัดส่วนหรือพื้นที่จริง</span></figcaption>
    {error ? <p role="status">อุปกรณ์นี้เปิด 3D ไม่สำเร็จ อ่านค่าจากกราฟ 2D ด้านบนได้</p> : <div ref={host} className="station-scene-canvas" role="img" aria-label={`ภาพอธิบายระดับน้ำเทียบตลิ่ง ${margin === null ? "ไม่มีข้อมูล" : `${margin < 0 ? "สูง" : "ต่ำ"}กว่าตลิ่ง ${Math.abs(margin).toFixed(2)} เมตร`}`} />}
    <div className="station-scene-key"><span><i />เส้นเข้ม = ตลิ่งอ้างอิง</span><span><i />สีน้ำเงิน = ระดับน้ำสถานี</span></div>
    <div className="station-scene-controls">
      <button aria-label="หมุนภาพระดับน้ำซ้าย" onClick={() => api.current?.rotate(-0.3)}><RotateCcw size={18} /></button>
      <button aria-label="หมุนภาพระดับน้ำขวา" onClick={() => api.current?.rotate(0.3)}><RotateCw size={18} /></button>
      <button onClick={() => api.current?.reset()}>คืนมุมมอง</button>
      <span>ลากเพื่อหมุน หรือใช้ปุ่ม</span>
    </div>
    <p>ตัวเลขจริงดูที่กราฟ · ความสูงในภาพใช้เพื่ออธิบาย ไม่ใช่ความลึกน้ำท่วมโครงการหรือทิศทางน้ำไหล</p>
  </figure>;
}
