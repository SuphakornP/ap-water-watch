"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface WaterSceneProps {
  /** Bank elevation minus measured river elevation, in metres. */
  margin: number | null;
  status: "priority" | "watch" | "normal" | "unknown";
  reducedMotion?: boolean;
}

const STATUS_COLORS: Record<WaterSceneProps["status"], string> = {
  priority: "#b74735",
  watch: "#a36719",
  normal: "#256963",
  unknown: "#65747e",
};

export default function WaterScene({
  margin,
  status,
  reducedMotion = false,
}: WaterSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<{
    rotate: (direction: number) => void;
    reset: () => void;
  } | null>(null);
  const motionRef = useRef({ paused: false, reduced: reducedMotion });
  const requestFrameRef = useRef<(() => void) | null>(null);
  const [paused, setPaused] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const labelId = useId();
  const descriptionId = useId();
  const measuredMargin =
    margin !== null && Number.isFinite(margin) ? margin : null;
  const effectiveStatus = measuredMargin === null ? "unknown" : status;

  useEffect(() => {
    motionRef.current.paused = paused;
    motionRef.current.reduced = reducedMotion;
    requestFrameRef.current?.();
  }, [paused, reducedMotion]);

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch (error) {
      console.warn("WaterScene could not initialize WebGL.", error);
      setUnsupported(true);
      return;
    }
    setUnsupported(false);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 50);
    const initialPosition = new THREE.Vector3(6.4, 5.3, 7.6);
    camera.position.copy(initialPosition);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.24;
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute(
      "aria-label",
      "ภาพสามมิติของระดับน้ำเทียบตลิ่งสถานี ลากเพื่อหมุน หรือใช้ปุ่มลูกศรซ้ายและขวา",
    );
    renderer.domElement.tabIndex = 0;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    renderer.domElement.style.touchAction = "pan-y";
    controls.target.set(0, 0.06, 0);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minPolarAngle = Math.PI / 5;
    controls.maxPolarAngle = Math.PI / 2.5;
    controls.minAzimuthAngle = -Math.PI / 3;
    controls.maxAzimuthAngle = Math.PI / 2.5;
    controls.update();

    scene.add(new THREE.HemisphereLight(0xe8f5ff, 0xb9b4a7, 2.8));
    const sunlight = new THREE.DirectionalLight(0xffffff, 3.3);
    sunlight.position.set(-3, 7, 5);
    scene.add(sunlight);
    const fill = new THREE.DirectionalLight(0xb3dfff, 1.2);
    fill.position.set(4, 2, -3);
    scene.add(fill);

    const model = new THREE.Group();
    scene.add(model);
    const materials: THREE.Material[] = [];
    const material = (
      color: THREE.ColorRepresentation,
      extra: THREE.MeshStandardMaterialParameters = {},
    ) => {
      const result = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.8,
        ...extra,
      });
      materials.push(result);
      return result;
    };
    const chalk = material(0xf6f4ee);
    const earth = material(0xd2c6b4);
    const earthLayer = material(0xe5d9c5);
    const surface = material(0xdce2d5);
    const concrete = material(0xd4dce0);
    const darkMetal = material(0x526675, { metalness: 0.35, roughness: 0.5 });
    const gaugeColor = material(STATUS_COLORS[effectiveStatus], {
      roughness: 0.55,
    });

    const box = (
      width: number,
      height: number,
      depth: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material,
    ) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        mat,
      );
      mesh.position.set(x, y, z);
      model.add(mesh);
      return mesh;
    };

    // All elevations are schematic; the measured margin controls only the water-to-bank gap.
    const bankY = 0.54;
    const floorY = -0.58;
    const waterY =
      measuredMargin === null
        ? -0.05
        : THREE.MathUtils.clamp(
            bankY - measuredMargin * 0.29,
            floorY + 0.08,
            bankY + 0.46,
          );
    box(5.05, 0.16, 3.65, 0, floorY - 0.08, 0, chalk);
    box(2.35, 0.055, 3.5, 0, floorY + 0.01, 0, earthLayer);

    for (const side of [-1, 1]) {
      const x = side * 1.86;
      box(1.37, 0.97, 3.5, x, floorY + 0.485, 0, earth);
      box(1.38, 0.055, 3.52, x, -0.33, 0, earthLayer);
      box(1.38, 0.045, 3.52, x, -0.1, 0, earthLayer);
      box(1.4, 0.15, 3.55, x, bankY - 0.075, 0, surface);
      box(0.13, 0.045, 3.55, side * 1.23, bankY + 0.022, 0, concrete);
    }

    const waterColor = measuredMargin === null ? 0x8fbdce : 0x479fc5;
    const waterBodyMaterial = material(waterColor, {
      transparent: true,
      opacity: 0.7,
      roughness: 0.3,
      metalness: 0.06,
    });
    box(
      2.31,
      waterY - floorY,
      3.46,
      0,
      (waterY + floorY) / 2,
      0,
      waterBodyMaterial,
    );
    const waterSurfaceMaterial = material(
      measuredMargin === null ? 0xa7cbd8 : 0x76c5df,
      {
        transparent: true,
        opacity: 0.9,
        roughness: 0.25,
        metalness: 0.08,
        side: THREE.DoubleSide,
      },
    );
    const waterGeometry = new THREE.PlaneGeometry(2.32, 3.47, 16, 24);
    waterGeometry.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(waterGeometry, waterSurfaceMaterial);
    water.position.y = waterY;
    model.add(water);
    const positions = waterGeometry.getAttribute("position");
    const originalPositions = Float32Array.from(positions.array);

    const rippleMaterial = material(0xe9fbff, {
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
    });
    const ripples: THREE.Mesh[] = [];
    for (let i = 0; i < 9; i += 1) {
      const ripple = box(
        0.1 + (i % 3) * 0.035,
        0.008,
        0.28 + (i % 2) * 0.16,
        -0.89 + (i % 3) * 0.81,
        waterY + 0.022,
        -1.45 + Math.floor(i / 3) * 1.12,
        rippleMaterial,
      );
      ripples.push(ripple);
    }

    // Gauge and fixed bank reference are visible together at the open cross-section.
    const gaugeX = 1.02;
    const gaugeZ = 1.79;
    box(0.11, 1.8, 0.085, gaugeX, 0.22, gaugeZ, chalk);
    for (let i = 0; i <= 12; i += 1) {
      box(
        i % 3 === 0 ? 0.095 : 0.053,
        0.017,
        0.013,
        gaugeX + (i % 3 === 0 ? 0 : 0.021),
        -0.52 + i * 0.12,
        gaugeZ + 0.049,
        darkMetal,
      );
    }
    box(0.2, 0.043, 0.13, gaugeX, waterY, gaugeZ + 0.025, gaugeColor);
    const bankReference = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-1.18, bankY, 1.82),
        new THREE.Vector3(1.14, bankY, 1.82),
      ]),
      new THREE.LineDashedMaterial({
        color: 0x6b7f8c,
        dashSize: 0.085,
        gapSize: 0.055,
        transparent: true,
        opacity: 0.7,
      }),
    );
    bankReference.computeLineDistances();
    model.add(bankReference);

    // A small station cabinet communicates monitoring infrastructure, never project homes.
    box(0.39, 0.08, 0.43, 1.9, bankY + 0.04, -0.8, concrete);
    box(0.31, 0.47, 0.32, 1.9, bankY + 0.315, -0.8, chalk);
    box(0.33, 0.035, 0.34, 1.9, bankY + 0.567, -0.8, darkMetal);
    box(0.15, 0.095, 0.012, 1.9, bankY + 0.41, -0.633, gaugeColor);
    box(0.022, 0.68, 0.022, 2.1, bankY + 0.34, -0.8, darkMetal);
    const aerial = new THREE.Mesh(new THREE.SphereGeometry(0.041, 8, 6), chalk);
    aerial.position.set(2.1, bankY + 0.7, -0.8);
    model.add(aerial);
    for (const z of [-0.4, 0.28, 0.96]) {
      box(0.038, 0.25, 0.038, 1.39, bankY + 0.125, z, darkMetal);
    }
    box(0.028, 0.027, 1.4, 1.39, bankY + 0.23, 0.28, darkMetal);

    let frame = 0;
    let disposed = false;
    let visible = true;
    let previousTime = 0;
    let animationTime = 0;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const shouldAnimate = () =>
      !motionRef.current.paused &&
      !motionRef.current.reduced &&
      !motionQuery.matches &&
      visible &&
      document.visibilityState !== "hidden";

    const render = (time: number) => {
      frame = 0;
      if (disposed) return;
      const animated = shouldAnimate();
      const delta = previousTime
        ? Math.min((time - previousTime) / 1000, 0.05)
        : 0;
      previousTime = time;
      if (animated) {
        animationTime += delta;
        for (let i = 0; i < positions.count; i += 1) {
          const x = originalPositions[i * 3];
          const z = originalPositions[i * 3 + 2];
          positions.setY(
            i,
            Math.sin(z * 4.1 - animationTime * 1.4 + x * 1.5) * 0.009,
          );
        }
        positions.needsUpdate = true;
        ripples.forEach((ripple, index) => {
          const seed = -1.45 + Math.floor(index / 3) * 1.12;
          ripple.position.z =
            ((seed + 1.73 + animationTime * 0.15) % 3.46) - 1.73;
        });
      }
      renderer.render(scene, camera);
      if (animated) frame = window.requestAnimationFrame(render);
    };
    const requestRender = () => {
      if (!disposed && !frame) frame = window.requestAnimationFrame(render);
    };
    requestFrameRef.current = requestRender;
    controls.addEventListener("change", requestRender);

    const rotate = (direction: number) => {
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta = THREE.MathUtils.clamp(
        spherical.theta + direction * 0.2,
        controls.minAzimuthAngle,
        controls.maxAzimuthAngle,
      );
      camera.position
        .copy(controls.target)
        .add(new THREE.Vector3().setFromSpherical(spherical));
      controls.update();
      requestRender();
    };
    const reset = () => {
      camera.position.copy(initialPosition);
      controls.target.set(0, 0.06, 0);
      controls.update();
      requestRender();
    };
    controlRef.current = { rotate, reset };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        rotate(event.key === "ArrowLeft" ? -1 : 1);
      }
      if (event.key === "Home") {
        event.preventDefault();
        reset();
      }
    };
    renderer.domElement.addEventListener("keydown", onKeyDown);
    const onContextLost = (event: Event) => {
      event.preventDefault();
      setUnsupported(true);
      visible = false;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    };
    const onContextRestored = () => {
      setUnsupported(false);
      visible = true;
      requestRender();
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    renderer.domElement.addEventListener(
      "webglcontextrestored",
      onContextRestored,
    );

    const resizeObserver = new ResizeObserver(() => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      requestRender();
    });
    resizeObserver.observe(host);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      previousTime = 0;
      requestRender();
    });
    intersectionObserver.observe(host);
    document.addEventListener("visibilitychange", requestRender);
    motionQuery.addEventListener("change", requestRender);
    requestRender();

    return () => {
      disposed = true;
      controlRef.current = null;
      requestFrameRef.current = null;
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      controls.removeEventListener("change", requestRender);
      controls.dispose();
      document.removeEventListener("visibilitychange", requestRender);
      motionQuery.removeEventListener("change", requestRender);
      renderer.domElement.removeEventListener("keydown", onKeyDown);
      renderer.domElement.removeEventListener(
        "webglcontextlost",
        onContextLost,
      );
      renderer.domElement.removeEventListener(
        "webglcontextrestored",
        onContextRestored,
      );
      model.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line)
          object.geometry.dispose();
      });
      materials.forEach((entry) => entry.dispose());
      bankReference.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [measuredMargin, effectiveStatus]);

  const caption =
    measuredMargin === null
      ? "ไม่มีระดับน้ำสำหรับภาพจำลอง"
      : measuredMargin === 0
        ? "เท่าระดับตลิ่ง"
        : measuredMargin > 0
          ? `ต่ำกว่าตลิ่ง ${measuredMargin.toFixed(2)} ม.`
          : `สูงกว่าตลิ่ง ${Math.abs(measuredMargin).toFixed(2)} ม.`;

  return (
    <figure
      className="ap-water-scene"
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      style={
        { "--water-status": STATUS_COLORS[effectiveStatus] } as CSSProperties
      }
    >
      <div className="ap-water-scene__heading">
        <span id={labelId}>ระดับน้ำเทียบตลิ่ง</span>
        <span className="ap-water-scene__dimension">3D</span>
      </div>
      <div className="ap-water-scene__viewport" ref={mountRef} />
      {unsupported && (
        <div className="ap-water-scene__fallback" role="status">
          <svg
            width="42"
            height="30"
            viewBox="0 0 42 30"
            aria-hidden="true"
            fill="none"
          >
            <path
              d="M2 7h10v15h18V7h10M2 27h38M13 14c4-5 8 5 15 0"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
          <span>อุปกรณ์นี้ไม่รองรับภาพ 3D</span>
          <strong>{caption}</strong>
        </div>
      )}
      <div className="ap-water-scene__reading" aria-live="polite">
        <span className="ap-water-scene__dot" />
        {caption}
      </div>
      <div className="ap-water-scene__legend" aria-hidden="true">
        <i />
        แนวตลิ่ง
      </div>
      {!unsupported && (
        <div className="ap-water-scene__controls" aria-label="ควบคุมภาพสามมิติ">
          <button
            type="button"
            onClick={() => controlRef.current?.rotate(-1)}
            aria-label="หมุนภาพไปทางซ้าย"
            title="หมุนซ้าย"
          >
            ↶
          </button>
          <button
            type="button"
            onClick={() => controlRef.current?.rotate(1)}
            aria-label="หมุนภาพไปทางขวา"
            title="หมุนขวา"
          >
            ↷
          </button>
          <button
            type="button"
            onClick={() => controlRef.current?.reset()}
            aria-label="คืนมุมมองเริ่มต้น"
            title="คืนมุมมอง"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m2.5 5.1 5.5-3 5.5 3v6L8 14l-5.5-2.9v-6Zm0 0L8 8l5.5-2.9M8 8v6"
                stroke="currentColor"
                strokeWidth="1.15"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {!reducedMotion && (
            <button
              type="button"
              className="ap-water-scene__pause"
              onClick={() => setPaused((value) => !value)}
              aria-pressed={paused}
              aria-label={
                paused ? "เปิดการเคลื่อนไหวของน้ำ" : "พักการเคลื่อนไหวของน้ำ"
              }
            >
              {paused ? "เล่น" : "พัก"}
            </button>
          )}
        </div>
      )}
      <figcaption id={descriptionId} className="ap-water-scene__caption">
        ภาพอธิบายสถานี • ไม่ใช่ระดับน้ำในโครงการ
      </figcaption>
      <style>{`
        .ap-water-scene{position:relative;isolation:isolate;width:100%;height:276px;min-width:0;margin:0;overflow:hidden;border-radius:14px;background:radial-gradient(ellipse at 52% 25%,#fcfeff 0%,#edf5f8 63%,#e7f0f4 100%);color:#314e60;font-family:inherit}
        .ap-water-scene__heading{position:absolute;top:14px;left:16px;right:16px;display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:600;pointer-events:none;z-index:2}
        .ap-water-scene__dimension{font-size:10px;letter-spacing:.1em;color:#5e7987;border:1px solid #bed0d9;border-radius:4px;padding:1px 5px}
        .ap-water-scene__viewport{position:absolute;inset:26px 0 27px}
        .ap-water-scene canvas{cursor:grab;outline-offset:-4px}
        .ap-water-scene canvas:active{cursor:grabbing}
        .ap-water-scene canvas:focus-visible{outline:2px solid #226b94;border-radius:10px}
        .ap-water-scene__reading{position:absolute;left:16px;top:40px;font-size:11px;display:flex;gap:6px;align-items:center;color:var(--water-status);z-index:2;pointer-events:none}
        .ap-water-scene__dot{width:5px;height:5px;border-radius:50%;background:var(--water-status)}
        .ap-water-scene__legend{position:absolute;left:16px;bottom:43px;display:flex;align-items:center;gap:5px;font-size:10px;color:#5f7480;pointer-events:none}
        .ap-water-scene__legend i{width:18px;border-top:1px dashed #6b7f8c}
        .ap-water-scene__controls{position:absolute;right:10px;bottom:33px;display:flex;align-items:center;gap:1px;padding:2px;background:#ffffffba;border:1px solid #ffffff;border-radius:8px;z-index:3}
        .ap-water-scene__controls button{display:flex;align-items:center;justify-content:center;min-width:30px;height:30px;margin:0;padding:0 6px;border:0;border-radius:5px;background:transparent;color:#405d6e;font:inherit;font-size:18px;line-height:1;cursor:pointer;transition:background .15s ease}
        .ap-water-scene__controls button:hover{background:#e1edf2}
        .ap-water-scene__controls button:focus-visible{outline:2px solid #226b94;outline-offset:1px}
        .ap-water-scene__controls button.ap-water-scene__pause{font-size:10px;border-left:1px solid #dce6eb;border-radius:0 5px 5px 0;min-width:35px}
        .ap-water-scene__caption{position:absolute;bottom:9px;left:8px;right:8px;text-align:center;font-size:9px;line-height:1.3;letter-spacing:.015em;color:#5c7280;pointer-events:none}
        .ap-water-scene__fallback{position:absolute;inset:72px 20px 69px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;font-size:11px;background:#edf5f8;z-index:2;color:#5c7685}
        .ap-water-scene__fallback strong{font-weight:500;color:var(--water-status)}
        @media(prefers-reduced-motion:reduce){.ap-water-scene__controls button{transition:none}.ap-water-scene__controls button.ap-water-scene__pause{display:none}}
      `}</style>
    </figure>
  );
}
