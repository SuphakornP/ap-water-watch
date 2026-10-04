import {
  MercatorCoordinate,
  type CustomLayerInterface,
  type Map as MapLibreMap,
} from "maplibre-gl";
import * as THREE from "three";

export type BeaconPoint = {
  id: string;
  lng: number;
  lat: number;
  color: string;
  kind: "project" | "water" | "rain";
  severity: "priority" | "watch" | "normal" | "unknown";
};

/** Geographic symbols only: column heights encode categories, never flood depth. */
export function createWaterBeacons(map: MapLibreMap): {
  layer: CustomLayerInterface;
  update(points: BeaconPoint[], selectedId?: string): void;
  setAnimated(enabled: boolean): void;
  setVisible(visible: boolean): void;
} {
  const MAX = 250;
  const origin = MercatorCoordinate.fromLngLat([100.5, 13.75]);
  const metres = origin.meterInMercatorCoordinateUnits();
  // Local scene: X east, Y north, Z up. Mercator Y increases southwards.
  const world = new THREE.Matrix4()
    .makeTranslation(origin.x, origin.y, origin.z)
    .scale(new THREE.Vector3(metres, -metres, metres));
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const rank = { priority: 0, watch: 1, normal: 2, unknown: 3 };
  const fills = { priority: 0.94, watch: 0.67, normal: 0.28, unknown: 0 };
  let points: BeaconPoint[] = [],
    selectedId: string | undefined;
  let renderer: THREE.WebGLRenderer | undefined;
  let ready = false,
    visible = true,
    animated = !reduced.matches,
    phase = 0,
    lastFrame = 0;
  type Pulse = {
    x: number;
    y: number;
    size: number;
    color: string;
    offset: number;
  };
  let pulses: Pulse[] = [];
  const geometry: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const meshes: THREE.InstancedMesh[] = [];
  let bases: THREE.InstancedMesh, stems: THREE.InstancedMesh;
  let diamonds: THREE.InstancedMesh, droplets: THREE.InstancedMesh;
  let shells: THREE.InstancedMesh, liquid: THREE.InstancedMesh;
  let rims: THREE.InstancedMesh,
    rings: THREE.InstancedMesh,
    waves: THREE.InstancedMesh;

  function instance(g: THREE.BufferGeometry, m: THREE.Material, capacity = MAX) {
    geometry.push(g);
    materials.push(m);
    const mesh = new THREE.InstancedMesh(g, m, capacity);
    mesh.count = 0;
    mesh.frustumCulled = false; // Bounds are culled geographically before instancing.
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    meshes.push(mesh);
    return mesh;
  }
  const solid = () =>
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.25,
      roughness: 0.3,
    });
  const flat = (opacity = 1) =>
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity === 1,
    });
  function cylinder() {
    // Build upright, ground-anchored geometry once; per-instance scale stays positive.
    return new THREE.CylinderGeometry(1, 1, 1, 16)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.5);
  }
  function put(
    mesh: THREE.InstancedMesh,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    tint: string,
  ) {
    dummy.position.set(x, y, z);
    dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(mesh.count, dummy.matrix);
    mesh.setColorAt(mesh.count, color.set(tint));
    mesh.count++;
  }
  function flush(mesh: THREE.InstancedMesh) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  function repaint() {
    if (ready && !document.hidden) map.triggerRepaint();
  }
  function pulseGeometry() {
    waves.count = 0;
    for (const p of pulses) {
      const t = (((phase * 0.48 + p.offset) % 1) + 1) % 1;
      const scale = p.size * (1.08 + t * 0.72);
      put(waves, p.x, p.y, p.size * 0.07, scale, scale, scale, p.color);
    }
    flush(waves);
  }
  function rebuild() {
    if (!ready) return;
    const bounds = map.getBounds();
    const visible = points
      .filter((p) => bounds.contains([p.lng, p.lat]))
      .sort(
        (a, b) =>
          Number(b.id === selectedId) - Number(a.id === selectedId) ||
          rank[a.severity] - rank[b.severity] ||
          Number(b.kind === "project") - Number(a.kind === "project"),
      )
      .slice(0, MAX);
    // Approximately constant screen size. These display dimensions are not real metres.
    const pixelMetres =
      (40075016.686 * Math.cos((13.75 * Math.PI) / 180)) /
      (512 * 2 ** map.getZoom());
    const radius = Math.max(2, Math.min(1200, pixelMetres * 4.3));
    for (const mesh of meshes) mesh.count = 0;
    pulses = [];
    for (const p of visible) {
      const mercator = MercatorCoordinate.fromLngLat([p.lng, p.lat]);
      const x = (mercator.x - origin.x) / metres;
      const y = (origin.y - mercator.y) / metres;
      const selected = p.id === selectedId;
      const r = radius * (selected ? 1.3 : 1);
      const tint = p.color;
      put(bases, x, y, r * 0.015, r * 0.8, r * 0.8, r * 0.1, "#f5f8f5");
      put(rings, x, y, r * 0.14, r, r, r, tint);
      if (selected) put(rings, x, y, r * 0.15, r * 1.65, r * 1.65, r * 1.65, "#1769e0");
      if (p.kind === "water") {
        const h = r * 7.8;
        put(shells, x, y, r * 0.12, r * 0.51, r * 0.51, h, "#b5e4eb");
        put(rims, x, y, h + r * 0.12, r * 0.51, r * 0.51, r * 0.51, "#d0eff4");
        if (fills[p.severity] > 0) {
          put(
            liquid,
            x,
            y,
            r * 0.14,
            r * 0.45,
            r * 0.45,
            h * fills[p.severity],
            tint,
          );
        }
      } else if (p.kind === "project") {
        put(stems, x, y, r * 0.1, r * 0.065, r * 0.065, r * 2.35, tint);
        put(diamonds, x, y, r * 2.95, r * 0.58, r * 0.58, r * 0.78, tint);
      } else {
        put(stems, x, y, r * 0.1, r * 0.055, r * 0.055, r * 1.05, tint);
        put(droplets, x, y, r * 1.6, r * 0.5, r * 0.5, r * 0.7, tint);
      }
      if (selected || p.severity === "priority" || p.severity === "watch") {
        const seed = [...p.id].reduce(
          (n, c) => (n * 31 + c.charCodeAt(0)) >>> 0,
          0,
        );
        pulses.push({ x, y, size: r, color: tint, offset: (seed % 100) / 100 });
      }
    }
    for (const mesh of meshes) flush(mesh);
    pulseGeometry();
    repaint();
  }
  function visibilityChanged() {
    lastFrame = 0;
    repaint();
  }
  function motionPreferenceChanged() {
    if (reduced.matches) animated = false;
    lastFrame = 0;
    repaint();
  }

  const layer: CustomLayerInterface = {
    id: "ap-water-beacons",
    type: "custom",
    renderingMode: "3d",
    onAdd(_map, gl) {
      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      scene.add(new THREE.AmbientLight(0xffffff, 1.1));
      const sun = new THREE.DirectionalLight(0xfff3da, 1.4);
      sun.position.set(-1, -2, 4);
      scene.add(sun);
      bases = instance(cylinder(), solid());
      stems = instance(cylinder(), solid());
      diamonds = instance(new THREE.OctahedronGeometry(1), solid());
      droplets = instance(new THREE.IcosahedronGeometry(1, 1), solid());
      liquid = instance(
        cylinder(),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          metalness: 0.2,
          roughness: 0.2,
        }),
      );
      shells = instance(
        cylinder(),
        new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.19,
          depthWrite: false,
          roughness: 0.12,
          metalness: 0.05,
          side: THREE.DoubleSide,
        }),
      );
      rims = instance(new THREE.TorusGeometry(1, 0.045, 5, 24), flat(0.8));
      rings = instance(new THREE.TorusGeometry(1, 0.065, 5, 24), flat(), MAX + 1);
      waves = instance(new THREE.TorusGeometry(1, 0.028, 4, 24), flat(0.35));
      ready = true;
      map.on("move", rebuild);
      map.on("resize", rebuild);
      document.addEventListener("visibilitychange", visibilityChanged);
      reduced.addEventListener("change", motionPreferenceChanged);
      rebuild();
    },
    render(_gl, args) {
      if (!renderer || !ready || !visible || document.hidden) return;
      const running = animated && pulses.length > 0;
      const now = performance.now();
      if (running) {
        phase += lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
        pulseGeometry();
      }
      lastFrame = running ? now : 0;
      camera.projectionMatrix
        .fromArray(args.defaultProjectionData.mainMatrix)
        .multiply(world);
      // MapLibre owns the shared context/canvas; never resize, clear, or lose it here.
      renderer.resetState();
      renderer.render(scene, camera);
      renderer.resetState();
      if (running) map.triggerRepaint();
    },
    onRemove() {
      ready = false;
      map.off("move", rebuild);
      map.off("resize", rebuild);
      document.removeEventListener("visibilitychange", visibilityChanged);
      reduced.removeEventListener("change", motionPreferenceChanged);
      for (const mesh of meshes) mesh.dispose();
      for (const g of geometry) g.dispose();
      for (const m of materials) m.dispose();
      meshes.length = geometry.length = materials.length = 0;
      scene.clear();
      renderer?.dispose();
      renderer = undefined;
      pulses = [];
      lastFrame = 0;
    },
  };
  return {
    layer,
    setVisible(next) { visible = next; lastFrame = 0; repaint(); },
    update(next, nextSelectedId) {
      for (const p of next) {
        if (
          !Number.isFinite(p.lng) ||
          !Number.isFinite(p.lat) ||
          Math.abs(p.lng) > 180 ||
          Math.abs(p.lat) >= 85.051129
        ) {
          throw new RangeError(
            `Invalid geographic beacon coordinates: ${p.id}`,
          );
        }
      }
      points = [...next];
      selectedId = nextSelectedId;
      rebuild();
    },
    setAnimated(enabled) {
      animated = enabled;
      lastFrame = 0;
      repaint();
    },
  };
}
