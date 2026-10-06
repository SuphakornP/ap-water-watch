"use client";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Map as CityMap, GeoJSONSource, MapMouseEvent, MapSourceDataEvent, ErrorEvent as MapErrorEvent, ExpressionSpecification } from "maplibre-gl";
import type { FeatureCollection, LineString } from "geojson";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Compass,
  Expand,
  Eye,
  Globe2,
  Layers3,
  List,
  MapPin,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ScanLine,
  Waves,
  X,
  ArrowUpRight,
  Info,
  Camera,
  RadioTower,
  Satellite,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cityStyle } from "@/lib/city-style";
import { stationRisk, tourProjects } from "@/lib/map-signals";
import { CLUSTER_RISKS, PROJECT_CLUSTER_PROPERTIES, clusterMembers, projectMapFeatures } from "@/lib/map-clusters";
import { representativeWater, bankMargin, isFresh } from "@/lib/assessment";
import { initialRainPeriod, representativeRain, mapPadding } from "@/lib/presentation";
import ProvinceRiskOverview from "./ProvinceRiskOverview";
import DwrStationDetails from "./DwrStationDetails";
import { dwrStatusColor, dwrStatusLabel } from "@/lib/dwr-context";
import type { DwrStation } from "@/lib/dwr-types";
import { GISTDA_ATTRIBUTION, GISTDA_CATALOG_URL, GISTDA_LAYER_ID, GISTDA_SOURCE_ID, GISTDA_SOURCE_URL, GISTDA_TILE_TEMPLATE } from "@/lib/gistda";
import styles from "./FloodMap.module.css";
import provinceIndex from "@/data/province-index.json";
import {
  RISK_COLOR,
  RISK_LABEL,
  type Assessment,
  type Station,
  type SourceHealth,
} from "@/lib/flood-types";
import type { BeaconPoint, createWaterBeacons } from "@/lib/water-beacons";
import type { NearbyCamera } from "@/lib/cameras";
import "maplibre-gl/dist/maplibre-gl.css";

const WaterLevelGauge = lazy(() => import("./WaterLevelGauge"));

type Props = {
  items: Assessment[];
  stations?: Station[];
  dwrStations?: DwrStation[];
  sourceDwr?: SourceHealth;
  now: number;
  focusId: string | null;
  manualFocusRequest: number;
  onFocus: (id: string | null) => void;
  onSelect: (id: string) => void;
  reducedMotion: boolean;
  stationId: string | null;
  onStationSelect: (id: string | null) => void;
  province: string;
  onProvinceSelect: (province: string) => void;
  cameras: NearbyCamera[];
  cameraId: string | null;
  cameraMapRequest: number;
  onCameraSelect: (id: string) => void;
  onShowCameras: () => void;
};
const initialCamera = {
  center: [100.56, 13.87] as [number, number],
  zoom: 9.3,
  pitch: 0,
  bearing: 0,
};
const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
const clusterColor: ExpressionSpecification = [
  "case", [">", ["get", "priority"], 0], RISK_COLOR.priority,
  [">", ["get", "watch"], 0], RISK_COLOR.watch,
  [">", ["get", "unknown"], 0], RISK_COLOR.unknown, RISK_COLOR.normal,
];
const clusterRadius: ExpressionSpecification = ["step", ["get", "point_count"], 21, 10, 25, 50, 30];
type FloodLayerState = "off" | "loading" | "ready" | "error" | "outside";
const floodLayerMessage: Record<FloodLayerState, string> = {
  off: "ภาพดาวเทียมย้อนหลัง · ไม่ใช่พยากรณ์",
  loading: "กำลังโหลดภาพในมุมมอง…",
  ready: "โหลดภาพในมุมมองแล้ว",
  error: "ภาพโหลดไม่ครบ · ยังสรุปพื้นที่ไม่ได้",
  outside: "มุมมองนี้อยู่นอกขอบเขตชั้นข้อมูล",
};
const clock = (s: string | null) =>
  s
    ? new Intl.DateTimeFormat("th-TH", {
        timeZone: "Asia/Bangkok",
        hour: "2-digit",
        minute: "2-digit",
        day: "numeric",
        month: "short",
      }).format(new Date(s))
    : "ไม่ทราบเวลาวัด";

export default function FloodMap({
  items,
  stations = [],
  dwrStations = [],
  sourceDwr,
  now,
  focusId,
  manualFocusRequest,
  onFocus,
  onSelect,
  reducedMotion,
  stationId,
  onStationSelect,
  province,
  onProvinceSelect,
  cameras,
  cameraId,
  cameraMapRequest,
  onCameraSelect,
  onShowCameras,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<CityMap | null>(null);
  const beacons = useRef<ReturnType<typeof createWaterBeacons> | null>(null);
  const beaconState = useRef<{ points: BeaconPoint[]; selectedId?: string; animated: boolean }>({ points: [], animated: false });
  const [beaconError, setBeaconError] = useState("");
  const sceneReady = useRef(false);
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const [water, setWater] = useState(true),
    [boundaries, setBoundaries] = useState(true),
    [rain, setRain] = useState(false),
    [buildings, setBuildings] = useState(true),
    [city, setCity] = useState(false),
    [animated, setAnimated] = useState(true);
  const [listOpen, setListOpen] = useState(false),
    [layersOpen, setLayersOpen] = useState(false),
    [help, setHelp] = useState(false),
    [expanded, setExpanded] = useState(false);
  const [tour, setTour] = useState(false),
    [tourIndex, setTourIndex] = useState(0);
  const [zoom, setZoom] = useState(initialCamera.zoom);
  const [grouped, setGrouped] = useState(true);
  const [dwrVisible, setDwrVisible] = useState(true);
  const [dwrId, setDwrId] = useState<string | null>(null);
  const [floodVisible, setFloodVisible] = useState(true);
  const [floodOpacity, setFloodOpacity] = useState(0.65);
  const [floodState, setFloodState] = useState<FloodLayerState>("loading");
  const [floodRetry, setFloodRetry] = useState(0);
  const [groupIds, setGroupIds] = useState<string[] | null>(null);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupError, setGroupError] = useState("");
  const groupRequest = useRef(0);
  const groupPending = useRef(false);
  const groupTitle = useRef<HTMLHeadingElement>(null);
  const mappedFeatures = useMemo(() => projectMapFeatures(items), [items]);
  const stationItems = useMemo(() => stations.filter(station => station.kind === "water" ? water : rain), [stations, water, rain]);
  const mapMembership = mappedFeatures.features.map(feature => `${feature.properties?.id}:${feature.geometry.coordinates.join(",")}`).sort().join("|");
  const group = useMemo(() => clusterMembers(items, groupIds ?? []), [items, groupIds]);
  const latest = useRef({ items, stations, dwrStations, now, onFocus, onProvinceSelect, onStationSelect, onCameraSelect, reducedMotion });
  useEffect(() => {
    latest.current = { items, stations, dwrStations, now, onFocus, onProvinceSelect, onStationSelect, onCameraSelect, reducedMotion };
  }, [items, stations, dwrStations, now, onFocus, onProvinceSelect, onStationSelect, onCameraSelect, reducedMotion]);
  function closeGroup() {
    groupRequest.current++;
    groupPending.current = false;
    setGroupIds(null);
    setGroupLoading(false);
    setGroupError("");
  }
  function showFloodExtent(enabled: boolean) {
    setFloodVisible(enabled);
    setFloodState(enabled ? "loading" : "off");
  }
  function retryFloodExtent() {
    setFloodState("loading");
    setFloodRetry(value => value + 1);
  }
  // Cancel the external map worker selection when its filter or focus context changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { closeGroup(); }, [mapMembership, grouped, focusId, manualFocusRequest, cameraMapRequest]);
  useEffect(() => {
    if (groupIds) groupTitle.current?.focus({ preventScroll: true });
  }, [groupIds]);
  function setStationId(id: string | null) { latest.current.onStationSelect(id); }
  const selected = items.find((a) => a.project.id === focusId);
  const chosenStation = stations.find((s) => s.id === stationId);
  const chosenDwr = dwrVisible && !selected && !chosenStation ? dwrStations.find(station => station.id === dwrId) : undefined;
  const chosenRainPeriod = initialRainPeriod(chosenStation ? { ...chosenStation, fresh: isFresh(chosenStation.observedAt) } : undefined);
  const [showAllLinked, setShowAllLinked] = useState(false);
  useEffect(() => {
    setShowAllLinked(false);
    if (stationId) { setTour(false); closeGroup(); setDwrId(null); }
    if (focusId) setDwrId(null);
  }, [stationId, focusId]);
  const linkedProjects = chosenStation
    ? items.filter((a) => a.trigger?.id === chosenStation.id)
    : [];
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", close);
    };
  }, [expanded]);
  const stops = useMemo(() => tourProjects(items), [items]);
  const stopIds = stops.map((a) => a.project.id).join("|");

  useEffect(() => {
    setTour(false);
    setStationId(null);
    setListOpen(false);
    setLayersOpen(false);
    setDwrId(null);
  }, [manualFocusRequest]);

  useEffect(() => {
    let disposed = false;
    sceneReady.current = false;
    setReady(false);
    let observer: ResizeObserver | undefined;
    import("maplibre-gl")
      .then((ml) => {
        if (disposed || !host.current) return;
        function selectDwrStation(id: string) {
          closeGroup();
          setDwrId(id);
          setStationId(null);
          latest.current.onFocus(null);
          setTour(false);
          setListOpen(false);
          setLayersOpen(false);
        }
        ml.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
        const m = new ml.Map({
          container: host.current,
          style: cityStyle,
          ...initialCamera,
          cooperativeGestures: true,
          maxPitch: 70,
          minZoom: 4.5,
          maxZoom: 18,
          canvasContextAttributes: { antialias: true },
          attributionControl: { compact: true },
        });
        map.current = m;
        m.addControl(
          new ml.ScaleControl({ maxWidth: 90, unit: "metric" }),
          "bottom-left",
        );
        m.on("error", (e) => {
          if ("sourceId" in e && e.sourceId === GISTDA_SOURCE_ID) return;
          console.error("City map source error", e.error);
          setError("บางส่วนของแผนที่โหลดไม่สำเร็จ ลองโหลดแผนที่ใหม่");
        });
        // Install overlays as soon as the style exists, without waiting for basemap tiles.
        m.once("style.load", () => {
          if (disposed) return;
          m.addSource("ap-projects", { type: "geojson", data: empty });
          m.addSource("ap-project-clusters", {
            type: "geojson", data: empty, cluster: true, clusterRadius: 52,
            clusterMaxZoom: 18, maxzoom: 19, clusterProperties: PROJECT_CLUSTER_PROPERTIES,
          });
          m.addSource("ap-project-selection", { type: "geojson", data: empty });
          m.addSource("water-stations", { type: "geojson", data: empty });
          m.addSource("dwr-stations", { type: "geojson", data: empty });
          m.addSource("nearby-cameras", { type: "geojson", data: empty });
          m.addSource("station-link", { type: "geojson", data: empty });
          m.addLayer({
            id: "station-connection",
            type: "line",
            source: "station-link",
            paint: {
              "line-color": "#1769e0",
              "line-width": 2,
              "line-dasharray": [2, 3],
              "line-opacity": 0.7,
            },
          });
          m.addLayer({
            id: "station-dots",
            type: "circle",
            source: "water-stations",
            paint: {
              "circle-color": ["get", "color"],
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                6,
                2,
                14,
                4.5,
              ],
              "circle-stroke-color": "#f7faf4",
              "circle-stroke-width": 1.2,
            },
          });
          m.addLayer({
            id: "dwr-station-selection", type: "circle", source: "dwr-stations",
            filter: ["==", ["get", "id"], ""],
            paint: { "circle-radius": 16, "circle-color": "transparent", "circle-stroke-color": "#1769e0", "circle-stroke-width": 3 },
          });
          for (const status of [0, 1, 2, 3, 9, null] as const) {
            const icon = document.createElement("canvas");
            icon.width = 32; icon.height = 32;
            const context = icon.getContext("2d");
            if (!context) continue;
            context.fillStyle = "#ffffff"; context.fillRect(2, 2, 28, 28);
            context.fillStyle = dwrStatusColor(status, true); context.fillRect(5, 5, 22, 22);
            context.strokeStyle = "#20394e"; context.lineWidth = 1; context.strokeRect(2, 2, 28, 28);
            m.addImage(`dwr-square-${status ?? "unknown"}`, context.getImageData(0, 0, 32, 32), { pixelRatio: 2 });
          }
          m.addLayer({
            id: "dwr-station-points", type: "symbol", source: "dwr-stations",
            layout: { "icon-image": ["get", "icon"], "icon-size": ["interpolate", ["linear"], ["zoom"], 6, 0.65, 12, 1], "icon-allow-overlap": true, "icon-ignore-placement": true },
          });
          m.addLayer({
            id: "project-halos",
            type: "circle",
            source: "ap-projects",
            paint: {
              "circle-color": ["get", "color"],
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                7,
                6,
                15,
                13,
              ],
              "circle-opacity": 0.13,
            },
          });
          m.addLayer({
            id: "project-selection",
            type: "circle",
            source: "ap-project-selection",
            paint: { "circle-radius": 14, "circle-color": "transparent", "circle-stroke-color": "#1769e0", "circle-stroke-width": 3 },
          });
          m.addLayer({
            id: "project-dots",
            type: "circle",
            source: "ap-projects",
            paint: {
              "circle-color": ["get", "color"],
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                6,
                3,
                14,
                6,
              ],
              "circle-stroke-color": "#fffef7",
              "circle-stroke-width": 2,
            },
          });
          m.addLayer({
            id: "project-names",
            type: "symbol",
            source: "ap-projects",
            minzoom: 13.6,
            layout: {
              "text-field": ["get", "name"],
              "text-font": ["Noto Sans Regular"],
              "text-size": 11,
              "text-offset": [0, 1.8],
              "text-anchor": "top",
              "text-max-width": 16,
              "text-padding": 24,
            },
            paint: {
              "text-color": "#42554e",
              "text-halo-color": "#fffef6",
              "text-halo-width": 2,
            },
          });
          m.addLayer({
            id: "project-clusters", type: "circle", source: "ap-project-clusters",
            filter: ["has", "point_count"],
            paint: { "circle-radius": clusterRadius, "circle-color": clusterColor, "circle-stroke-width": 3, "circle-stroke-color": "#fffdf6" },
          });
          m.addLayer({
            id: "project-cluster-count", type: "symbol", source: "ap-project-clusters",
            filter: ["has", "point_count"],
            layout: { "text-field": ["to-string", ["get", "point_count"]], "text-font": ["Noto Sans Regular"], "text-size": 15, "text-allow-overlap": true, "text-ignore-placement": true },
            paint: { "text-color": "#ffffff" },
          });
          m.addLayer({
            id: "project-cluster-single", type: "circle", source: "ap-project-clusters",
            filter: ["!", ["has", "point_count"]],
            paint: { "circle-color": ["get", "color"], "circle-radius": 7, "circle-stroke-width": 2, "circle-stroke-color": "#fffdf6" },
          });
          m.addLayer({
            id: "project-cluster-names", type: "symbol", source: "ap-project-clusters", minzoom: 13.6,
            filter: ["!", ["has", "point_count"]],
            layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-offset": [0, 1.8], "text-anchor": "top", "text-max-width": 16, "text-padding": 24 },
            paint: { "text-color": "#42554e", "text-halo-color": "#fffef6", "text-halo-width": 2 },
          });
          m.moveLayer("project-selection");
          m.addLayer({
            id: "project-selection-center", type: "circle", source: "ap-project-selection",
            paint: { "circle-color": ["get", "color"], "circle-radius": 7, "circle-stroke-width": 2, "circle-stroke-color": "#fffdf6" },
          });
          m.moveLayer("project-cluster-count");
          sceneReady.current = true;
          m.addLayer({
            id: "station-labels",
            type: "symbol",
            source: "water-stations",
            filter: ["==", ["get", "id"], ""],
            layout: {
              "text-field": ["get", "name"],
              "text-font": ["Noto Sans Regular"],
              "text-size": 12,
              "text-offset": [0, -3],
              "text-anchor": "bottom",
              "text-max-width": 17,
              "text-allow-overlap": true,
            },
            paint: {
              "text-color": "#365f70",
              "text-halo-color": "#fffef5",
              "text-halo-width": 3,
            },
          });
          const icon = document.createElement("canvas");
          icon.width = 64; icon.height = 64;
          const ctx = icon.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#fff"; ctx.fillRect(6, 10, 52, 44);
            ctx.fillStyle = "#4c6278"; ctx.fillRect(10, 14, 44, 36);
            ctx.fillStyle = "#fff"; ctx.fillRect(16, 24, 22, 17);
            ctx.beginPath(); ctx.moveTo(38, 29); ctx.lineTo(48, 24); ctx.lineTo(48, 41); ctx.lineTo(38, 36); ctx.fill();
            m.addImage("public-camera-icon", ctx.getImageData(0, 0, 64, 64), { pixelRatio: 2 });
          }
          m.addLayer({ id: "camera-selection", type: "circle", source: "nearby-cameras", filter: ["==", ["get", "id"], ""], paint: { "circle-radius": 18, "circle-color": "#edf5ff", "circle-stroke-color": "#1769e0", "circle-stroke-width": 3 } });
          m.addLayer({ id: "camera-points", type: "symbol", source: "nearby-cameras", layout: { "icon-image": "public-camera-icon", "icon-size": 1, "icon-allow-overlap": true } });
          m.addLayer({ id: "camera-label", type: "symbol", source: "nearby-cameras", filter: ["==", ["get", "id"], ""], layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 12, "text-offset": [0, 2.2], "text-max-width": 18 }, paint: { "text-color": "#1769e0", "text-halo-color": "#fff", "text-halo-width": 2 } });
          setReady(true);
        });
        m.on("click", async (e: MapMouseEvent) => {
          if (!m.getLayer("project-dots")) return;
          const exactHits = m.queryRenderedFeatures(e.point, { layers: ["project-dots", "project-clusters", "project-cluster-single", "dwr-station-points", "camera-points"] });
          if (exactHits[0]?.layer.id === "dwr-station-points") {
            const ids = new Set(exactHits.filter(hit => hit.layer.id === "dwr-station-points").map(hit => String(hit.properties.id)));
            const candidates = latest.current.dwrStations.filter(station => ids.has(station.id));
            if (candidates.length > 1) {
              const panel = document.createElement("div");
              const title = document.createElement("b");
              title.textContent = "เลือกข้อมูล DWR ณ จุดนี้";
              panel.appendChild(title);
              const popup = new ml.Popup({ maxWidth: "320px" }).setLngLat(e.lngLat);
              for (const station of candidates) {
                const button = document.createElement("button");
                button.className = "map-popup-project";
                button.textContent = `${station.kind === "water" ? "น้ำ" : "ฝน"} · ${station.name} · ${dwrStatusLabel(station.alertStatus, isFresh(station.reportAt, latest.current.now))}`;
                button.onclick = () => { selectDwrStation(station.id); popup.remove(); };
                panel.appendChild(button);
              }
              popup.setDOMContent(panel).addTo(m);
            } else if (candidates[0]) selectDwrStation(candidates[0].id);
            return;
          }
          const hits = m.queryRenderedFeatures(
            [
              [e.point.x - 12, e.point.y - 12],
              [e.point.x + 12, e.point.y + 48],
            ],
            { layers: ["project-dots", "project-clusters", "project-cluster-single", "station-dots", "camera-points"] },
          );
          const cluster = hits.find(hit => hit.layer.id === "project-clusters");
          if (cluster && cluster.geometry.type === "Point") {
            closeGroup();
            setDwrId(null);
            setTour(false);
            setListOpen(false);
            setLayersOpen(false);
            groupPending.current = true;
            setGroupLoading(true);
            const request = groupRequest.current;
            const source = m.getSource("ap-project-clusters") as GeoJSONSource;
            try {
              const [leaves, expansionZoom] = await Promise.all([
                source.getClusterLeaves(Number(cluster.properties.cluster_id), Number(cluster.properties.point_count), 0),
                source.getClusterExpansionZoom(Number(cluster.properties.cluster_id)),
              ]);
              if (disposed || request !== groupRequest.current) return;
              const ids = leaves.flatMap(leaf => typeof leaf.properties?.id === "string" ? [leaf.properties.id] : []);
              const current = clusterMembers(latest.current.items, ids);
              if (current.members.length !== Number(cluster.properties.point_count))
                throw new Error("Cluster membership changed while loading");
              setGroupIds(ids);
              const coordinates: [number, number] = [cluster.geometry.coordinates[0], cluster.geometry.coordinates[1]];
              m.easeTo({ center: coordinates, zoom: Math.min(expansionZoom, m.getMaxZoom()), padding: cameraPadding(), duration: latest.current.reducedMotion ? 0 : 700 });
            } catch (failure) {
              if (disposed || request !== groupRequest.current) return;
              console.error("Project cluster could not be opened", failure);
              setGroupError("กลุ่มโครงการเปลี่ยนระหว่างโหลด กรุณาเลือกกลุ่มอีกครั้ง หรือเปิดรายการโครงการ");
            } finally {
              if (!disposed && request === groupRequest.current) { groupPending.current = false; setGroupLoading(false); }
            }
            return;
          }
          closeGroup();
          setDwrId(null);
          const project = hits.find((h) => h.layer.id === "project-dots" || h.layer.id === "project-cluster-single");
          if (project) {
            const candidates = latest.current.items.filter(
              (a) =>
                a.project.lat === project.properties.lat &&
                a.project.lng === project.properties.lng,
            );
            if (candidates.length > 1) {
              setGroupIds(candidates.map(candidate => candidate.project.id));
            } else latest.current.onFocus(String(project.properties.id));
            setStationId(null);
            setTour(false);
            setListOpen(false);
          } else if (hits.some(hit => hit.layer.id === "camera-points")) {
            const camera = hits.find(hit => hit.layer.id === "camera-points")!;
            setTour(false);
            setExpanded(false);
            latest.current.onCameraSelect(String(camera.properties.id));
          } else if (hits[0]) {
            setTour(false);
            const ids = new Set(hits.map((hit) => String(hit.properties.id)));
            const candidates = latest.current.stations
              .filter((s) => ids.has(s.id))
              .sort(
                (a, b) => Number(a.kind === "rain") - Number(b.kind === "rain"),
              );
            if (candidates.length > 1) {
              const panel = document.createElement("div");
              const title = document.createElement("b");
              title.textContent = "เลือกข้อมูล ณ จุดนี้";
              panel.appendChild(title);
              const popup = new ml.Popup({ maxWidth: "320px" }).setLngLat(
                e.lngLat,
              );
              candidates.forEach((s) => {
                const button = document.createElement("button");
                button.className = "map-popup-project";
                button.textContent = `${s.kind === "water" ? "ระดับน้ำ" : "ฝน"} · ${s.name} · ${RISK_LABEL[stationRisk(s)]}`;
                button.onclick = () => {
                  setStationId(s.id);
                  popup.remove();
                };
                panel.appendChild(button);
              });
              popup.setDOMContent(panel).addTo(m);
            } else setStationId(String(hits[0].properties.id));
          } else if (m.getLayer("province-areas") && m.getLayoutProperty("province-areas", "visibility") !== "none") {
            const area = m.queryRenderedFeatures(e.point, { layers: ["province-areas"] })[0];
            if (typeof area?.properties.ADM1_TH === "string") {
              setTour(false);
              latest.current.onProvinceSelect(area.properties.ADM1_TH);
            }
          }
        });
        m.on("mousemove", (e) => {
          if (m.getLayer("project-dots"))
            m.getCanvas().style.cursor = m.queryRenderedFeatures(
              [
                [e.point.x - 12, e.point.y - 12],
                [e.point.x + 12, e.point.y + 48],
              ],
              { layers: ["project-dots", "project-clusters", "project-cluster-single", "station-dots", "dwr-station-points", "camera-points"] },
            ).length
              ? "pointer"
              : "";
        });
        m.on("moveend", () => setZoom(m.getZoom()));
        m.on("dragstart", () => setTour(false));
        m.on("zoomstart", (e) => {
          if (e.originalEvent) setTour(false);
        });
        m.on("rotatestart", (e) => { if (e.originalEvent) setTour(false); });
        m.on("pitchstart", (e) => { if (e.originalEvent) setTour(false); });
        observer = new ResizeObserver(() => m.resize());
        observer.observe(host.current);
      })
      .catch((err) => {
        console.error("3D map initialization failed", err);
        setError(
          "อุปกรณ์นี้เปิดแผนที่ 3D ไม่สำเร็จ ใช้มุมมองรายการเพื่อดูข้อมูลโครงการได้",
        );
      });
    return () => {
      disposed = true;
      sceneReady.current = false;
      observer?.disconnect();
      map.current?.remove();
      map.current = null;
      beacons.current = null;
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !floodVisible) return;
    let disposed = false;
    let failed = false;
    let receivedTile = false;
    function inCoverage() {
      const bounds = m!.getBounds();
      return bounds.getWest() <= 106 && bounds.getEast() >= 97 && bounds.getSouth() <= 21 && bounds.getNorth() >= 5;
    }
    function onLoading(event: MapSourceDataEvent) {
      if (!disposed && !failed && event.sourceId === GISTDA_SOURCE_ID) setFloodState("loading");
    }
    function updateStatus() {
      if (disposed || failed || !m!.getSource(GISTDA_SOURCE_ID)) return;
      if (!inCoverage()) setFloodState("outside");
      else if (receivedTile && m!.isSourceLoaded(GISTDA_SOURCE_ID)) setFloodState("ready");
    }
    function onData(event: MapSourceDataEvent) {
      if (disposed || event.sourceId !== GISTDA_SOURCE_ID) return;
      if (event.tile?.state === "loaded") receivedTile = true;
      updateStatus();
    }
    function onError(event: MapErrorEvent) {
      if (disposed || !("sourceId" in event) || event.sourceId !== GISTDA_SOURCE_ID) return;
      failed = true;
      console.error("GISTDA flood imagery could not be loaded", event.error);
      setFloodState("error");
    }
    m.on("sourcedataloading", onLoading);
    m.on("sourcedata", onData);
    m.on("error", onError);
    m.on("moveend", updateStatus);
    m.addSource(GISTDA_SOURCE_ID, {
      type: "raster", tiles: [GISTDA_TILE_TEMPLATE], tileSize: 256,
      minzoom: 0, maxzoom: 14, bounds: [97, 5, 106, 21], attribution: GISTDA_ATTRIBUTION,
    });
    m.addLayer({
      id: GISTDA_LAYER_ID, type: "raster", source: GISTDA_SOURCE_ID,
      paint: { "raster-opacity": 0.65, "raster-fade-duration": 0 },
    }, "road-casing");
    return () => {
      disposed = true;
      m.off("sourcedataloading", onLoading);
      m.off("sourcedata", onData);
      m.off("error", onError);
      m.off("moveend", updateStatus);
      if (map.current !== m) return;
      if (m.getLayer(GISTDA_LAYER_ID)) m.removeLayer(GISTDA_LAYER_ID);
      if (m.getSource(GISTDA_SOURCE_ID)) m.removeSource(GISTDA_SOURCE_ID);
    };
  }, [floodVisible, floodRetry, ready]);
  useEffect(() => {
    const m = map.current;
    if (ready && m?.getLayer(GISTDA_LAYER_ID)) m.setPaintProperty(GISTDA_LAYER_ID, "raster-opacity", floodOpacity);
  }, [floodOpacity, floodVisible, floodRetry, ready]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !sceneReady.current) return;
    // New source data invalidates pending worker replies, while open member lists use current assessments.
    groupRequest.current++;
    if (groupPending.current) { setGroupLoading(false); setGroupError("ข้อมูลอัปเดตระหว่างเปิดกลุ่ม กรุณาเลือกกลุ่มอีกครั้ง"); }
    groupPending.current = false;
    (m.getSource("ap-projects") as GeoJSONSource).setData(mappedFeatures);
    (m.getSource("ap-project-clusters") as GeoJSONSource).setData(mappedFeatures);
  }, [mappedFeatures, ready]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    for (const id of ["project-halos", "project-dots", "project-names"])
      m.setLayoutProperty(id, "visibility", grouped ? "none" : "visible");
    for (const id of ["project-clusters", "project-cluster-count", "project-cluster-single", "project-cluster-names"])
      m.setLayoutProperty(id, "visibility", grouped ? "visible" : "none");
  }, [grouped, ready]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !sceneReady.current) return;
    (m.getSource("water-stations") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: stationItems.map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lng, s.lat] },
        properties: {
          id: s.id,
          name: s.name,
          color: RISK_COLOR[stationRisk(s, now)],
        },
      })),
    });
  }, [stationItems, ready, now]);
  useEffect(() => {
    const points: BeaconPoint[] = city ? [
        ...(grouped ? [] : items)
          .filter((a) => a.project.lat !== null && a.project.lng !== null)
          .map((a) => ({
            id: a.project.id,
            lng: a.project.lng!,
            lat: a.project.lat!,
            color: RISK_COLOR[a.risk],
            kind: "project" as const,
            severity: a.risk,
          })),
        ...stationItems.map((s) => ({
          id: s.id,
          lng: s.lng,
          lat: s.lat,
          color: RISK_COLOR[stationRisk(s, now)],
          kind: s.kind,
          severity: stationRisk(s, now),
        })),
      ] : [];
    const current = { points, selectedId: stationId ?? focusId ?? undefined, animated: animated && !reducedMotion };
    beaconState.current = current;
    beacons.current?.update(current.points, current.selectedId);
    beacons.current?.setAnimated(current.animated);
  }, [city, items, stationItems, focusId, stationId, grouped, animated, reducedMotion, now]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !city) return;
    let disposed = false;
    let layer: ReturnType<typeof createWaterBeacons> | undefined;
    // Keep Three.js and its move/resize mesh work out of the default 2D map.
    import("@/lib/water-beacons").then(({ createWaterBeacons }) => {
      if (disposed || map.current !== m) return;
      layer = createWaterBeacons(m);
      m.addLayer(layer.layer, "project-names");
      beacons.current = layer;
      const current = beaconState.current;
      layer.setAnimated(current.animated);
      layer.update(current.points, current.selectedId);
    }).catch(failure => {
      if (disposed) return;
      console.error("3D water symbols could not be loaded", failure);
      setBeaconError("โหลดสัญลักษณ์ 3D ไม่สำเร็จ · ยังดูข้อมูลบนแผนที่ 2D ได้");
    });
    return () => {
      disposed = true;
      if (beacons.current === layer) beacons.current = null;
      if (layer && map.current === m && m.getLayer(layer.layer.id)) m.removeLayer(layer.layer.id);
    };
  }, [city, ready]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    (m.getSource("dwr-stations") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: dwrStations.map(station => ({
        type: "Feature", geometry: { type: "Point", coordinates: [station.lng, station.lat] },
        properties: { id: station.id, icon: `dwr-square-${isFresh(station.reportAt, now) ? station.alertStatus ?? "unknown" : "unknown"}` },
      })),
    });
  }, [dwrStations, ready, now]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    for (const layer of ["dwr-station-points", "dwr-station-selection"])
      m.setLayoutProperty(layer, "visibility", dwrVisible ? "visible" : "none");
    m.setFilter("dwr-station-selection", ["==", ["get", "id"], chosenDwr?.id ?? ""]);
  }, [dwrVisible, chosenDwr, ready]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    (m.getSource("nearby-cameras") as GeoJSONSource).setData({ type: "FeatureCollection", features: cameras.map(c => ({ type: "Feature", geometry: { type: "Point", coordinates: [c.lng, c.lat] }, properties: { id: c.id, name: c.name } })) });
  }, [cameras, ready]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    m.setFilter("camera-selection", ["==", ["get", "id"], cameraId ?? ""]);
    m.setFilter("camera-label", ["==", ["get", "id"], cameraId ?? ""]);
  }, [cameraId, ready]);
  useEffect(() => {
    const m = map.current, camera = cameras.find(c => c.id === cameraId), p = selected?.project;
    if (!ready || !m || !cameraMapRequest || !camera || !p || p.lat === null || p.lng === null) return;
    setTour(false);
    const points = [[p.lng, p.lat], [camera.lng, camera.lat], ...(selected?.trigger ? [[selected.trigger.lng, selected.trigger.lat]] : [])];
    m.fitBounds([[Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1]))], [Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))]], { padding: cameraPadding(), maxZoom: 14.3, pitch: 0, duration: reducedMotion ? 0 : 800 });
    setCity(false);
    setWater(true);
    if (selected?.trigger?.kind === "rain") setRain(true);
  }, [cameraMapRequest, ready]);
  useEffect(() => {
    if (ready && sceneReady.current)
      map.current?.setLayoutProperty(
        "city-buildings",
        "visibility",
        buildings && city ? "visible" : "none",
      );
  }, [ready, buildings, city]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !sceneReady.current) return;
    if (boundaries && !m.getSource("thai-provinces")) {
      m.addSource("thai-provinces", { type: "geojson", data: "/gis/thailand-provinces.geojson", attribution: '<a href="https://github.com/prasertcbs/thailand_gis">RTSD / OCHA / HDX · prasertcbs</a> · <a href="https://creativecommons.org/licenses/by/3.0/igo/">CC BY-IGO 3.0 · adapted</a>' });
      m.addLayer({ id: "province-areas", type: "fill", source: "thai-provinces", paint: { "fill-color": "#1769e0", "fill-opacity": 0.015 } }, "station-connection");
      m.addLayer({ id: "province-boundaries", type: "line", source: "thai-provinces", paint: { "line-color": "#54748f", "line-width": 1.5, "line-dasharray": [3, 2] } }, "station-connection");
      m.addLayer({ id: "province-selected", type: "line", source: "thai-provinces", filter: ["==", ["get", "ADM1_TH"], province], paint: { "line-color": "#1769e0", "line-width": 3 } }, "station-connection");
    }
    if (m.getSource("thai-provinces")) {
      for (const layer of ["province-areas", "province-boundaries", "province-selected"]) m.setLayoutProperty(layer, "visibility", boundaries ? "visible" : "none");
      m.setFilter("province-selected", ["==", ["get", "ADM1_TH"], province]);
    }
  }, [boundaries, province, ready]);
  const framedProvince = useRef("all");
  useEffect(() => {
    if (!ready || !map.current || !boundaries || framedProvince.current === province) return;
    framedProvince.current = province;
    const area = provinceIndex.find(p => p.name === province);
    if (!area) return;
    setTour(false);
    map.current.fitBounds([[area.bbox[0], area.bbox[1]], [area.bbox[2], area.bbox[3]]], { padding: cameraPadding(false), pitch: 0, maxZoom: 11, duration: reducedMotion ? 0 : 1100 });
    setCity(false);
  }, [province, boundaries, ready]);
  const fitted = useRef("");
  useEffect(() => {
    if (!ready || !map.current || !sceneReady.current) return;
    const ids = items
      .map((a) => a.project.id)
      .sort()
      .join("|");
    if (fitted.current === ids) return;
    fitted.current = ids;
    setTour(false);
    setDwrId(null);
    setStationId(null);
    if (items.length && items.length < 350 && !(boundaries && province !== "all")) fitItems();
  }, [items, ready]);
  useEffect(() => {
    if (!ready || !map.current || !selected || !sceneReady.current) return;
    const p = selected.project;
    if (p.lat === null || p.lng === null) return;
    setStationId(null);
    map.current.flyTo({
      center: [p.lng, p.lat],
      zoom: 14.6,
      pitch: city ? 58 : 0,
      bearing: city ? -28 : 0,
      duration: reducedMotion ? 0 : 1700,
      padding: cameraPadding(),
    });
  }, [focusId, ready, manualFocusRequest]);
  useEffect(() => {
    if (!ready || !map.current || !sceneReady.current) return;
    const trigger =
      selected?.trigger ??
      (selected ? representativeWater(selected) : undefined);
    const data: FeatureCollection<LineString> = {
      type: "FeatureCollection",
      features:
        selected &&
        trigger &&
        selected.project.lng !== null &&
        selected.project.lat !== null
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: [
                    [selected.project.lng, selected.project.lat],
                    [trigger.lng, trigger.lat],
                  ],
                },
              },
            ]
          : [],
    };
    (map.current.getSource("station-link") as GeoJSONSource).setData(data);
    (map.current.getSource("ap-project-selection") as GeoJSONSource).setData(projectMapFeatures(selected ? [selected] : []));
    map.current.setFilter("station-labels", [
      "in",
      ["get", "id"],
      ["literal", [stationId, trigger?.id].filter((id): id is string => !!id)],
    ]);
  }, [selected, ready, stationId]);
  useEffect(() => {
    setTour(false);
    setTourIndex(0);
  }, [stopIds]);
  useEffect(() => {
    if (!tour || stops.length === 0) return;
    const current = tourIndex % stops.length;
    onFocus(stops[current].project.id);
    if (reducedMotion) return;
    const timer = setTimeout(
      () => setTourIndex((i) => (i + 1) % stops.length),
      8500,
    );
    return () => clearTimeout(timer);
  }, [tour, tourIndex, stops, onFocus, reducedMotion]);
  function fitItems() {
    const coords = items
      .filter((a) => a.project.lat !== null && a.project.lng !== null)
      .map((a) => [a.project.lng!, a.project.lat!] as [number, number]);
    if (!coords.length || !map.current) return;
    const xs = coords.map((c) => c[0]),
      ys = coords.map((c) => c[1]);
    map.current.fitBounds(
      [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ],
      {
        padding: cameraPadding(false),
        maxZoom: 14,
        pitch: city ? 45 : 0,
        duration: reducedMotion ? 0 : 1400,
      },
    );
  }
  function cameraPadding(withInspector = true) {
    const width = host.current?.clientWidth ?? 800;
    const height = host.current?.clientHeight ?? 600;
    const panel = host.current?.parentElement?.querySelector<HTMLElement>(".city-inspector");
    return mapPadding(width, height, withInspector && window.innerWidth > 1100 ? panel?.offsetWidth ?? 310 : 0);
  }
  function viewCity(next: boolean) {
    if (next !== city) setBeaconError("");
    setCity(next);
    setTour(false);
    map.current?.easeTo({
      pitch: next ? 58 : 0,
      bearing: next ? -28 : 0,
      duration: reducedMotion ? 0 : 900,
    });
  }
  function viewBangkok() {
    const areas = provinceIndex.filter(area => ["TH10", "TH11", "TH12", "TH13", "TH73", "TH74"].includes(area.id));
    if (!map.current || !areas.length) return;
    setTour(false);
    setDwrId(null);
    onFocus(null);
    setStationId(null);
    setCity(false);
    setBoundaries(true);
    map.current.fitBounds(
      [[Math.min(...areas.map(area => area.bbox[0])), Math.min(...areas.map(area => area.bbox[1]))],
        [Math.max(...areas.map(area => area.bbox[2])), Math.max(...areas.map(area => area.bbox[3]))]],
      { padding: cameraPadding(false), pitch: 0, bearing: 0, duration: reducedMotion ? 0 : 1000 },
    );
    host.current?.closest(".city-frame")?.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "center" });
  }
  function nextStop(direction: number) {
    const index = (tourIndex + direction + stops.length) % stops.length;
    setTourIndex(index);
    if (stops[index]) onFocus(stops[index].project.id);
  }
  function showEvidence() {
    const m = map.current,
      p = selected?.project;
    if (!m || !p || p.lng === null || p.lat === null || !selected) return;
    setTour(false);
    setDwrId(null);
    setStationId(null);
    const sources = [
      selected.trigger,
      representativeWater(selected),
      representativeRain(selected),
    ].filter((s) => !!s);
    const coords = [[p.lng, p.lat], ...sources.map((s) => [s.lng, s.lat])];
    const xs = coords.map((c) => c[0]),
      ys = coords.map((c) => c[1]);
    m.fitBounds(
      [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ],
      {
        padding: cameraPadding(),
        maxZoom: 14.2,
        pitch: city ? 45 : 0,
        duration: reducedMotion ? 0 : 1300,
      },
    );
    setWater(true);
    if (sources.some((s) => s.kind === "rain")) setRain(true);
  }
  const station = selected ? representativeWater(selected) : undefined,
    margin = bankMargin(station);
  const activeRain = selected ? representativeRain(selected) : undefined;
  const rainPeriod = initialRainPeriod(activeRain);
  const rainValue = activeRain?.fresh ? (rainPeriod === "1h" ? activeRain.rain1h : activeRain.value) : null;
  return (
    <>
    <div className={`${styles.frame} city-frame ${expanded ? "city-expanded" : ""} ${city ? "is-3d" : "is-2d"}`}>
      <div
        ref={host}
        className="city-canvas"
        aria-label="แผนที่โครงการ AP สถานีอ้างอิง และขอบเขตจังหวัด"
      />
      <div className="city-atmosphere" />
      <div className="city-title">
        <span className="city-kicker">
          <i /> WATER ATLAS <span> / {city ? "3D" : "2D"}</span>
        </span>
        <h2>โครงการและพื้นที่รอบข้าง</h2>
        <p>
          {selected?.project.province ?? "ขอบเขตจังหวัด · สีหมุดแสดงสัญญาณของโครงการ"}
        </p>
        <div className="city-key">
          <span>
            <i className="key-project" />
            โครงการ AP
          </span>
          <span>
            <i className="key-water" />
            สถานีตรวจวัด
          </span>
        </div>
        {dwrVisible && <small className={styles.dwrKey}><i />DWR · สีตามเกณฑ์เตือนภัยของหน่วยงาน</small>}
        <div className={styles.groupControl}>
          <label>
            <span>แสดงเป็นกลุ่ม</span>
            <Switch checked={grouped} onCheckedChange={setGrouped} aria-label="แสดงโครงการเป็นกลุ่ม" />
          </label>
          <small>{grouped ? "ตัวเลข = จำนวนโครงการ · คลิกเพื่อแยกดู" : "แสดงหมุดรายโครงการ"}</small>
          {items.length > mappedFeatures.features.length && <small>{items.length - mappedFeatures.features.length} โครงการไม่มีพิกัด · ดูในรายการ</small>}
        </div>
        <div className={`${styles.floodControl} ${floodVisible ? styles.floodActive : ""}`}>
          <label>
            <span><Satellite size={14} />พื้นที่น้ำท่วมในรอบ 7 วัน<small>(GISTDA)</small></span>
            <Switch checked={floodVisible} disabled={!ready} onCheckedChange={showFloodExtent} aria-label="พื้นที่น้ำท่วมในรอบ 7 วัน (GISTDA)" />
          </label>
          <p role="status" className={floodState === "error" ? styles.floodError : ""}>{floodLayerMessage[floodState]}</p>
          {floodVisible && <>
            <small className={styles.floodDate}><i />ไม่ทราบวันที่ถ่ายภาพ · ไม่ใช่น้ำปัจจุบัน</small>
            {floodState === "error" && <button className={styles.floodRetry} onClick={retryFloodExtent}>ลองโหลดชั้นข้อมูลอีกครั้ง</button>}
          </>}
        </div>
      </div>
      <div className="city-toolbar">
        <button
          className={listOpen ? "active" : ""}
          aria-pressed={listOpen}
          aria-label={`รายการโครงการ ${items.length} โครงการ`}
          onClick={() => {
            closeGroup();
            setListOpen(!listOpen);
            setLayersOpen(false);
          }}
        >
          <List size={17} />
          <span>โครงการ</span>
          <b>{items.length}</b>
        </button>
        <button
          className={layersOpen ? "active" : ""}
          aria-label="ชั้นข้อมูลแผนที่"
          aria-expanded={layersOpen}
          onClick={() => {
            closeGroup();
            setLayersOpen(!layersOpen);
            setListOpen(false);
          }}
        >
          <Layers3 size={18} />
          <span>ชั้นข้อมูล</span>
        </button>
        <button
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? "ออกจากเต็มจอ" : "ขยายแผนที่เต็มจอ"}
        >
          {expanded ? <X size={18} /> : <Expand size={18} />}
        </button>
      </div>
      {layersOpen && (
        <div className="city-layers glass-panel">
          <b>เลือกสิ่งที่อยากเห็น</b>
          <section className={styles.floodSettings} aria-label="รายละเอียดชั้นพื้นที่น้ำท่วม GISTDA">
            <label><Satellite size={17} /><span>พื้นที่น้ำท่วมในรอบ 7 วัน<br />(GISTDA)</span><Switch checked={floodVisible} disabled={!ready} onCheckedChange={showFloodExtent} aria-label="เปิดชั้นพื้นที่น้ำท่วม GISTDA" /></label>
            {floodVisible && <>
              <label className={styles.opacityLabel} htmlFor="flood-opacity">ความทึบของภาพ <b>{Math.round(floodOpacity * 100)}%</b></label>
              <input id="flood-opacity" className={styles.opacitySlider} type="range" min="30" max="90" step="5" value={Math.round(floodOpacity * 100)} onChange={event => setFloodOpacity(Number(event.target.value) / 100)} aria-label="ความทึบพื้นที่น้ำท่วม GISTDA" />
              <p className={styles.floodSwatch}><i />พื้นที่น้ำท่วมที่ตรวจพบจากดาวเทียม</p>
              <p role="status" className={floodState === "error" ? styles.floodError : ""}>{floodLayerMessage[floodState]}</p>
              {floodState === "error" && <button className={styles.floodRetry} onClick={retryFloodExtent}>ลองโหลด GISTDA อีกครั้ง</button>}
            </>}
            <p>ภาพสะสมย้อนหลังตามชั้นข้อมูล 7 วันของต้นทาง ไม่ใช่พยากรณ์ และยังไม่ยืนยันวันที่ถ่ายภาพแต่ละพื้นที่</p>
            <p>ภาพที่ส่งต่ออาจมีแคชนานถึง 24 ชม. · พื้นที่ไม่แสดงสีไม่ได้ยืนยันว่าไม่มีน้ำท่วม · ไม่ใช้เปลี่ยนระดับโครงการอัตโนมัติ</p>
            <div className={styles.floodSources}><a href={GISTDA_SOURCE_URL} target="_blank" rel="noreferrer">ดูต้นทาง ThaiWater</a><a href={GISTDA_CATALOG_URL} target="_blank" rel="noreferrer">ข้อมูล GISTDA</a></div>
          </section>
          <label><MapPin size={17} />ขอบเขตจังหวัด<Switch checked={boundaries} onCheckedChange={setBoundaries} aria-label="ขอบเขตจังหวัด" /></label>
          {boundaries && <div className="province-explorer">
            <label htmlFor="province-explorer">สำรวจจังหวัด</label>
            <select id="province-explorer" value={province} onChange={event => onProvinceSelect(event.target.value)}>
              <option value="all">ทุกจังหวัด</option>
              {provinceIndex.map(area => <option key={area.id} value={area.name}>{area.name}</option>)}
            </select>
            <p>คลิกพื้นที่หรือเลือกจังหวัดเพื่อกรองโครงการ · ขอบเขตการปกครอง ไม่ใช่พื้นที่น้ำท่วม</p>
            <a href="/gis/thailand-provinces.provenance.json" target="_blank" rel="noreferrer">ข้อมูลอ้างอิงปี 2565 · ที่มาและการแปลง</a>
          </div>}
          <label>
            <Building2 size={17} />
            อาคาร 3 มิติ
            <Switch
              checked={buildings}
              disabled={!city}
              onCheckedChange={setBuildings}
              aria-label="อาคาร 3 มิติ"
            />
          </label>
          <label>
            <Waves size={17} />
            สถานีระดับน้ำ
            <Switch
              checked={water}
              onCheckedChange={setWater}
              aria-label="สถานีระดับน้ำ"
            />
          </label>
          <label>
            <CloudRain size={17} />
            สถานีวัดฝน
            <Switch
              checked={rain}
              onCheckedChange={setRain}
              aria-label="สถานีวัดฝน"
            />
          </label>
          <label>
            <RadioTower size={17} />
            DWR · เตือนภัยล่วงหน้า
            <Switch checked={dwrVisible} onCheckedChange={value => { setDwrVisible(value); if (!value) setDwrId(null); }} aria-label="DWR · เตือนภัยล่วงหน้า" />
          </label>
          <small className={styles.dwrLayerNote}>
            {sourceDwr?.state === "error" ? "DWR เชื่อมต่อไม่ได้ · ยังไม่ใช้สรุปว่าปลอดภัย" : `DWR ${dwrStations.length.toLocaleString("th-TH")} รายการ · สี่เหลี่ยมแสดงแยกจากสถานี ThaiWater`}
            <br />แดง วิกฤต · ส้ม เตรียมพร้อม · เหลือง เฝ้าระวัง · ฟ้า มีฝน · เทา ไม่มีคำเตือน/ข้อมูลเก่า/ไม่ทราบ
          </small>
          <label>
            <Eye size={17} />
            ภาพเคลื่อนไหว
            <Switch
              checked={city && animated && !reducedMotion}
              disabled={reducedMotion || !city}
              onCheckedChange={setAnimated}
              aria-label="ภาพเคลื่อนไหว"
            />
          </label>
          <small>
            อาคารจาก OpenStreetMap เป็นบริบทพื้นที่
            ความสูงที่ไม่มีข้อมูลใช้ค่าประมาณ
          </small>
        </div>
      )}
      {listOpen && (
        <div className="city-projects glass-panel">
          <div className="city-panel-title">
            <b>เลือกโครงการเพื่อบินไปดู</b>
            <button
              aria-label="ปิดรายการโครงการ"
              onClick={() => setListOpen(false)}
            >
              <X size={17} />
            </button>
          </div>
          <div>
            {items.length ? (
              items.map((a) => (
                <button
                  key={a.project.id}
                  onClick={() => {
                    onFocus(a.project.id);
                    setStationId(null);
                    setListOpen(false);
                    setTour(false);
                  }}
                  className="city-project"
                  aria-pressed={focusId === a.project.id}
                >
                  <i style={{ background: RISK_COLOR[a.risk] }} />
                  <span>
                    {a.project.name}
                    <small>
                      {a.project.province ?? "ไม่ระบุจังหวัด"} ·{" "}
                      {RISK_LABEL[a.risk]}
                    </small>
                  </span>
                  <ChevronRight size={14} />
                </button>
              ))
            ) : (
              <p>ไม่พบโครงการตามตัวกรอง</p>
            )}
          </div>
        </div>
      )}
      {!ready && !error && (
        <div className="city-loading">
          <div className="city-loading-orbit" />
          <b>กำลังสร้างมุมมองเมือง</b>
          <span>อาคาร แม่น้ำ และพิกัดโครงการจริง</span>
        </div>
      )}
      {(error || (city && beaconError)) && (
        <div className="city-error" role="status">
          <Info size={16} />
          {error || beaconError}
          {error ? <button onClick={() => location.reload()}>โหลดใหม่</button> : <button onClick={() => viewCity(false)}>กลับแผนที่ 2D</button>}
        </div>
      )}
      {(groupLoading || groupIds || groupError) && !listOpen && !layersOpen && (
        <section className={`city-inspector glass-panel ${styles.groupPanel}`} aria-label="โครงการในกลุ่มที่เลือก" onKeyDown={event => { if (event.key === "Escape") closeGroup(); }}>
          <div className="city-panel-title">
            <h3 ref={groupTitle} tabIndex={-1}>โครงการในกลุ่ม {groupIds ? group.members.length : ""}</h3>
            <button aria-label="ปิดกลุ่มโครงการ" onClick={closeGroup}><X size={18} /></button>
          </div>
          {groupLoading && <p role="status">กำลังเปิดรายชื่อโครงการ…</p>}
          {groupError && <p role="alert">{groupError}</p>}
          {groupIds && <>
            <p className={styles.groupNote}>สีวงกลมใช้สัญญาณเร่งด่วนที่สุดในกลุ่ม ไม่ใช่ค่าเฉลี่ยหรือพื้นที่น้ำท่วม</p>
            <div className={styles.groupCounts} aria-label="จำนวนโครงการแยกตามสัญญาณ">
              {CLUSTER_RISKS.map(risk => <span key={risk}><i style={{ background: RISK_COLOR[risk] }} /><b>{group.counts[risk]}</b>{RISK_LABEL[risk]}</span>)}
            </div>
            <div className={styles.groupMembers}>
              {group.members.map(item => <button className="city-project" key={item.project.id} aria-pressed={focusId === item.project.id} onClick={() => {
                closeGroup(); setStationId(null); setTour(false); onFocus(item.project.id);
              }}>
                <i style={{ background: RISK_COLOR[item.risk] }} />
                <span>{item.project.name}<small>{RISK_LABEL[item.risk]} · {item.project.province ?? "ไม่ระบุจังหวัด"}</small></span>
                <ChevronRight size={15} />
              </button>)}
            </div>
            <small>เลือกชื่อเพื่อดูเหตุผลและสิ่งที่ควรทำ · แม้พิกัดซ้อนกันก็เลือกได้ทุกโครงการ</small>
          </>}
        </section>
      )}
      {chosenDwr && !listOpen && !layersOpen && !groupIds && !groupLoading && !groupError && (
        <section className={`city-inspector glass-panel ${styles.dwrInspector}`} aria-label="สถานี DWR ที่เลือก">
          <button className={styles.dwrClose} onClick={() => setDwrId(null)} aria-label="ปิดสถานี DWR"><X size={17} /></button>
          {sourceDwr?.state === "error" && <p role="status" className={styles.dwrSourceError}>การเชื่อมต่อ DWR ล่าสุดไม่สำเร็จ · ตรวจเวลาในรายงานก่อนใช้งาน</p>}
          <DwrStationDetails station={chosenDwr} fetchedAt={sourceDwr?.fetchedAt} now={now} />
        </section>
      )}
      <div className="city-navigation glass-panel">
        <button
          aria-label="ซูมเข้า"
          onClick={() => {
            setTour(false);
            map.current?.zoomIn();
          }}
        >
          <Plus size={18} />
        </button>
        <button
          aria-label="ซูมออก"
          onClick={() => {
            setTour(false);
            map.current?.zoomOut();
          }}
        >
          <Minus size={18} />
        </button>
        <i />
        <button
          aria-label="หันแผนที่ทิศเหนือ"
          onClick={() => {
            setTour(false);
            map.current?.easeTo({
              bearing: 0,
              duration: reducedMotion ? 0 : 600,
            });
          }}
        >
          <Compass size={19} />
        </button>
        <button
          aria-label="กลับมุมเริ่มต้น"
          onClick={() => {
            setTour(false);
            map.current?.flyTo({
              ...initialCamera,
              pitch: city ? 58 : 0,
              bearing: city ? -28 : 0,
              duration: reducedMotion ? 0 : 1700,
              padding: { top: 0, bottom: 0, left: 0, right: 0 },
            });
          }}
        >
          <RotateCcw size={17} />
        </button>
      </div>
      {(selected || chosenStation) && !chosenDwr && !listOpen && !layersOpen && !groupIds && !groupLoading && !groupError && (
        <div className="city-inspector glass-panel" aria-label={chosenStation ? "สถานีที่เลือก" : "โครงการที่เลือก"}>
          {chosenStation ? (
            <>
              <span className="city-card-eyebrow">
                {chosenStation.kind === "water"
                  ? "WATER STATION"
                  : "RAIN STATION"}
                <button
                  aria-label="ปิดสถานี"
                  onClick={() => setStationId(null)}
                >
                  <X size={15} />
                </button>
              </span>
              <h3>{chosenStation.name}</h3>
              <span className={`risk-label ${stationRisk(chosenStation)}`}>
                {RISK_LABEL[stationRisk(chosenStation)]}
              </span>
              <span className={`data-state ${isFresh(chosenStation.observedAt) ? "" : "is-stale"}`}>{isFresh(chosenStation.observedAt) ? "ข้อมูลอยู่ในช่วงที่ใช้คัดกรอง" : "ข้อมูลล่าช้า · ไม่ใช้คัดกรอง"}</span>
              <div className={`station-large-value ${!isFresh(chosenStation.observedAt) ? "data-stale" : ""}`}>
                {(chosenStation.kind === "rain" && chosenRainPeriod === "1h" ? chosenStation.rain1h : chosenStation.value)?.toFixed(2) ?? "—"}
                <small>
                  {chosenStation.kind === "water" ? "ม.รทก." : `มม. / ${chosenRainPeriod === "1h" ? "1" : "24"} ชม.`}
                </small>
              </div>
              {chosenStation.kind === "water" && <Suspense fallback={<p role="status">กำลังโหลดภาพระดับน้ำเทียบตลิ่ง…</p>}><WaterLevelGauge station={{...chosenStation, fresh: isFresh(chosenStation.observedAt)}} /></Suspense>}
              {chosenStation.kind === "rain" && (
                <p>ฝน {chosenRainPeriod === "1h" ? "24" : "1"} ชม. {(chosenRainPeriod === "1h" ? chosenStation.value : chosenStation.rain1h)?.toFixed(1) ?? "—"} มม.</p>
              )}
              <p>
                {isFresh(chosenStation.observedAt)
                  ? "เวลาตรวจวัด"
                  : "ข้อมูลเก่า / ไม่ทราบเวลาวัด"}
                <br />
                {clock(chosenStation.observedAt)}
              </p>
              <small>ค่าของสถานี ไม่ใช่ระดับน้ำในโครงการ</small>
              <div className="station-project-links">
                <b>{linkedProjects.length} โครงการใช้สัญญาณนี้</b>
                <small>เฉพาะโครงการในตัวกรอง · ไม่ใช่พื้นที่น้ำท่วม</small>
                {linkedProjects
                  .slice(0, showAllLinked ? linkedProjects.length : 5)
                  .map((a) => (
                    <button
                      key={a.project.id}
                      onClick={() => {
                        onFocus(a.project.id);
                        setStationId(null);
                        setTour(false);
                      }}
                    >
                      {a.project.name}
                      <ChevronRight size={13} />
                    </button>
                  ))}
                {linkedProjects.length > 5 && (
                  <button onClick={() => setShowAllLinked(!showAllLinked)}>
                    {showAllLinked
                      ? "ย่อรายการ"
                      : `ดูทั้งหมด ${linkedProjects.length} โครงการ`}
                    <ChevronRight size={13} />
                  </button>
                )}
              </div>
            </>
          ) : (
            selected && (
              <>
                <span className="city-card-eyebrow">
                  กำลังเลือกโครงการ
                  <button
                    aria-label="ปิดข้อมูลโครงการบนแผนที่"
                    onClick={() => {
                      setTour(false);
                      onFocus(null);
                    }}
                  >
                    <X size={15} />
                  </button>
                </span>
                <h3>{selected.project.name}</h3>
                <span className={`risk-label ${selected.risk}`}>
                  {RISK_LABEL[selected.risk]}
                </span>
                <div className="city-readings">
                  <div>
                    <Waves size={16} />
                    <span>
                      {margin === null
                        ? "เทียบตลิ่งไม่ได้"
                        : margin < 0
                          ? "สูงกว่าตลิ่ง"
                          : margin === 0
                            ? "เท่าระดับตลิ่ง"
                            : "ต่ำกว่าตลิ่ง"}
                    </span>
                    <b className={margin !== null && margin <= 0 ? "warning-value" : ""}>
                      {margin === null ? "—" : Math.abs(margin).toFixed(2)}
                      <small>ม.</small>
                    </b>
                  </div>
                  <div>
                    <CloudRain size={16} />
                    <span>ฝนสะสม {rainPeriod === "1h" ? "1" : "24"} ชม.</span>
                    <b>
                      {rainValue?.toFixed(1) ?? "—"}
                      <small>มม.</small>
                    </b>
                  </div>
                </div>
                {station && <button className="reading-source" onClick={() => { setTour(false); setStationId(station.id); }}>น้ำ: {station.name} · {clock(station.observedAt)}</button>}
                {activeRain && <button className="reading-source" onClick={() => { setTour(false); setRain(true); setStationId(activeRain.id); }}>ฝน: {activeRain.name} · {clock(activeRain.observedAt)}</button>}
                <small className="city-reading-note">
                  ค่าจากสถานีใกล้เคียง ไม่ใช่น้ำในโครงการ
                </small>
                <p className="city-signal-reason">{selected.reason}</p>
                <small>
                  {selected.trigger
                    ? `วัด ${clock(selected.trigger.observedAt)}`
                    : station
                      ? `สถานีน้ำ ${station.name} · ${station.distance.toFixed(1)} กม.`
                      : "ยังไม่มีสถานีน้ำที่ใช้ได้"}
                </small>
                <button className="city-evidence" onClick={showEvidence}>
                  <MapPin size={13} />
                  ดูโครงการพร้อมสถานีอ้างอิง
                  <ArrowUpRight size={13} />
                </button>
                <small>เส้นประเชื่อมแหล่งอ้างอิง ยังไม่ยืนยันทางไหลของน้ำ</small>
                <button className="city-evidence" onClick={() => { setExpanded(false); setTour(false); onShowCameras(); }}><Camera size={15} /> กล้องใกล้โครงการ · {cameras.length} จุด <ArrowUpRight size={13} /></button>
                <div className={`city-action-hint ${selected.risk}`}>
                  <span>สิ่งที่ควรทำตอนนี้</span>
                  <b>
                    {selected.risk === "priority"
                      ? "ยืนยันหน้างาน • เตรียมทีมและปั๊มน้ำ"
                      : selected.risk === "watch"
                        ? "ตรวจทางระบาย • เตรียมอุปกรณ์"
                        : selected.risk === "unknown"
                          ? "ขอข้อมูลล่าสุดจากทีมโครงการ"
                          : "ตรวจความพร้อมและติดตามตามรอบ"}
                  </b>
                </div>
                <button
                  className="city-primary"
                  onClick={() => {
                    setTour(false);
                    onSelect(selected.project.id);
                  }}
                >
                  ดูสถานีและรายการเตรียมพร้อม
                  <ArrowUpRight size={17} />
                </button>
              </>
            )
          )}
        </div>
      )}
      <div className="city-view-dock glass-panel">
        <button
          aria-pressed={city}
          className={city ? "active" : ""}
          onClick={() => viewCity(true)}
        >
          <Building2 size={17} />
          เมือง 3D
        </button>
        <button
          aria-pressed={!city}
          className={!city ? "active" : ""}
          onClick={() => viewCity(false)}
        >
          <ScanLine size={17} />
          แผนที่ 2D
        </button>
        <button
          aria-label="แสดงทุกโครงการบนแผนที่"
          onClick={() => {
            closeGroup();
            setDwrId(null);
            setTour(false);
            onFocus(null);
            setStationId(null);
            fitItems();
          }}
        >
          <Globe2 size={17} />
          <span>ภาพรวม</span>
        </button>
        <i />
        <button
          className={tour ? "tour-active" : "tour-start"}
          disabled={!stops.length}
          onClick={() => {
            closeGroup();
            setDwrId(null);
            setTour(!tour);
            setStationId(null);
            setListOpen(false);
            setLayersOpen(false);
          }}
          aria-label={tour ? "หยุดพาชมจุดเฝ้าระวัง" : "พาชมจุดเฝ้าระวัง"}
        >
          {tour ? <Pause size={16} /> : <Play size={16} />}
          <span>{tour ? "หยุดพาชม" : "พาชมจุดเฝ้าระวัง"}</span>
        </button>
      </div>
      {tour && (
        <div className="city-tour-progress glass-panel">
          <button aria-label="โครงการก่อนหน้า" onClick={() => nextStop(-1)}>
            <ChevronLeft size={16} />
          </button>
          <span>
            กำลังสำรวจ {tourIndex + 1} / {stops.length}
            <b>{stops[tourIndex]?.project.name}</b>
          </span>
          <button aria-label="โครงการถัดไป" onClick={() => nextStop(1)}>
            <ChevronRight size={16} />
          </button>
          {!reducedMotion && <i key={`${tourIndex}-${stopIds}`} />}
        </div>
      )}
      <div className="city-legend">
        <span>
          <i style={{ background: RISK_COLOR.priority }} />
          ตรวจสอบเร่งด่วน
        </span>
        <span>
          <i style={{ background: RISK_COLOR.watch }} />
          เฝ้าระวัง
        </span>
        <span>
          <i style={{ background: RISK_COLOR.normal }} />
          ไม่พบสัญญาณสูง
        </span>
        <span>
          <i style={{ background: RISK_COLOR.unknown }} />
          ข้อมูลไม่พอ
        </span>
        <button aria-label="วิธีอ่านแผนที่" onClick={() => setHelp(!help)}>
          <Info size={15} />
        </button>
      </div>
      {help && (
        <div className="city-help glass-panel">
          <b>อ่านเมืองให้เข้าใจ</b>
          <p>
            หมุด AP แสดงสัญญาณจากสถานีใกล้เคียง
            หลอดสถานีและวงเคลื่อนไหวใช้ขยายสัญญาณให้มองเห็น
            ไม่ใช่ความลึกหรือขอบเขตน้ำท่วม
          </p>
          <p>
            เส้นประเชื่อมโครงการกับสถานีอ้างอิงตามระยะ ไม่ได้บอกทางไหลของน้ำ ·
            แม่น้ำสีน้ำเงินแสดงภูมิศาสตร์
          </p>
          <p>แสดงเป็นกลุ่มจะรวมเฉพาะโครงการตามระยะบนหน้าจอ ตัวเลขคือจำนวนโครงการตามตัวกรอง สีใช้สัญญาณที่ต้องติดตามก่อน: เร่งด่วน → เฝ้าระวัง → ข้อมูลไม่พอ → ไม่พบสัญญาณสูง สถานีตรวจวัดแสดงแยกต่างหาก</p>
          <p>สี่เหลี่ยม DWR ใช้เกณฑ์เตือนภัยของกรมทรัพยากรน้ำ สีฟ้าหมายถึงมีฝน สีเทาอาจไม่มีคำเตือน ข้อมูลเก่า หรือไม่ทราบสถานะ ไม่ใช่การรับรองความปลอดภัย · DWR เป็นข้อมูลประกอบและไม่เปลี่ยนสีคัดกรองโครงการ</p>
          <p>พื้นที่สีฟ้าในชั้น GISTDA เป็นพื้นที่น้ำท่วมที่ตรวจพบจากภาพดาวเทียมย้อนหลังตามชั้นข้อมูล 7 วันของต้นทาง ไม่ใช่พยากรณ์ ไม่ใช่ความลึกน้ำ และไม่ยืนยันสถานการณ์ขณะนี้ · ยังไม่ทราบวันที่ถ่ายภาพแต่ละพื้นที่ พื้นที่ไม่แสดงสีอาจขาดการตรวจวัด</p>
          <button onClick={() => setHelp(false)}>เข้าใจแล้ว</button>
        </div>
      )}
      {city && zoom < 12 && (
        <span className="city-zoom-hint">
          ซูมเข้าเพื่อดูอาคารและสถานีสามมิติ
        </span>
      )}
    </div>
    <ProvinceRiskOverview items={items} province={province} onProvinceSelect={onProvinceSelect} onViewBangkok={viewBangkok} />
    </>
  );
}
