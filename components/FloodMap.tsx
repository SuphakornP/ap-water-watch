"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as CityMap, GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import type { FeatureCollection, Point, LineString } from "geojson";
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
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cityStyle } from "@/lib/city-style";
import { stationRisk, tourProjects } from "@/lib/map-signals";
import { representativeWater, bankMargin, isFresh } from "@/lib/assessment";
import {
  RISK_COLOR,
  RISK_LABEL,
  type Assessment,
  type Station,
} from "@/lib/flood-types";
import type { createWaterBeacons } from "@/lib/water-beacons";
import "maplibre-gl/dist/maplibre-gl.css";

type Props = {
  items: Assessment[];
  stations?: Station[];
  focusId: string | null;
  onFocus: (id: string | null) => void;
  onSelect: (id: string) => void;
  reducedMotion: boolean;
};
const initialCamera = {
  center: [100.515, 13.723] as [number, number],
  zoom: 14.25,
  pitch: 60,
  bearing: -28,
};
const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
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
  focusId,
  onFocus,
  onSelect,
  reducedMotion,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<CityMap | null>(null);
  const beacons = useRef<ReturnType<typeof createWaterBeacons> | null>(null);
  const sceneReady = useRef(false);
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const [water, setWater] = useState(true),
    [rain, setRain] = useState(false),
    [buildings, setBuildings] = useState(true),
    [city, setCity] = useState(true),
    [animated, setAnimated] = useState(true);
  const [listOpen, setListOpen] = useState(false),
    [layersOpen, setLayersOpen] = useState(false),
    [help, setHelp] = useState(false),
    [expanded, setExpanded] = useState(false);
  const [tour, setTour] = useState(false),
    [tourIndex, setTourIndex] = useState(0),
    [stationId, setStationId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(initialCamera.zoom);
  const latest = useRef({ items, stations, onFocus });
  useEffect(() => {
    latest.current = { items, stations, onFocus };
  }, [items, stations, onFocus]);
  const selected = items.find((a) => a.project.id === focusId);
  const chosenStation = stations.find((s) => s.id === stationId);
  const [showAllLinked, setShowAllLinked] = useState(false);
  useEffect(() => {
    setShowAllLinked(false);
  }, [stationId]);
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
    let disposed = false;
    sceneReady.current = false;
    setReady(false);
    let observer: ResizeObserver | undefined;
    Promise.all([import("maplibre-gl"), import("@/lib/water-beacons")])
      .then(([ml, visual]) => {
        if (disposed || !host.current) return;
        ml.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
        const m = new ml.Map({
          container: host.current,
          style: cityStyle,
          ...initialCamera,
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
          console.error("City map source error", e.error);
          setError("บางส่วนของแผนที่โหลดไม่สำเร็จ ลองโหลดแผนที่ใหม่");
        });
        m.on("load", () => {
          if (disposed) return;
          m.addSource("ap-projects", { type: "geojson", data: empty });
          m.addSource("water-stations", { type: "geojson", data: empty });
          m.addSource("station-link", { type: "geojson", data: empty });
          m.addLayer({
            id: "station-connection",
            type: "line",
            source: "station-link",
            paint: {
              "line-color": "#a2474b",
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
          const b = visual.createWaterBeacons(m);
          beacons.current = b;
          m.addLayer(b.layer);
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
          setReady(true);
        });
        m.on("click", (e: MapMouseEvent) => {
          if (!m.getLayer("project-dots")) return;
          const hits = m.queryRenderedFeatures(
            [
              [e.point.x - 12, e.point.y - 12],
              [e.point.x + 12, e.point.y + 48],
            ],
            { layers: ["project-dots", "station-dots"] },
          );
          const project = hits.find((h) => h.layer.id === "project-dots");
          if (project) {
            const candidates = latest.current.items.filter(
              (a) =>
                a.project.lat === project.properties.lat &&
                a.project.lng === project.properties.lng,
            );
            if (candidates.length > 1) {
              const panel = document.createElement("div");
              const popup = new ml.Popup().setLngLat(e.lngLat);
              candidates.forEach((a) => {
                const button = document.createElement("button");
                button.className = "map-popup-project";
                button.textContent = a.project.name;
                button.onclick = () => {
                  latest.current.onFocus(a.project.id);
                  popup.remove();
                };
                panel.appendChild(button);
              });
              popup.setDOMContent(panel).addTo(m);
            } else latest.current.onFocus(String(project.properties.id));
            setStationId(null);
            setTour(false);
            setListOpen(false);
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
          }
        });
        m.on("mousemove", (e) => {
          if (m.getLayer("project-dots"))
            m.getCanvas().style.cursor = m.queryRenderedFeatures(
              [
                [e.point.x - 12, e.point.y - 12],
                [e.point.x + 12, e.point.y + 48],
              ],
              { layers: ["project-dots", "station-dots"] },
            ).length
              ? "pointer"
              : "";
        });
        m.on("moveend", () => setZoom(m.getZoom()));
        m.on("dragstart", () => setTour(false));
        m.on("zoomstart", (e) => {
          if (e.originalEvent) setTour(false);
        });
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
    if (!ready || !m || !sceneReady.current) return;
    const stationItems = stations.filter((s) =>
      s.kind === "water" ? water : rain,
    );
    const features: FeatureCollection<Point> = {
      type: "FeatureCollection",
      features: items
        .filter((a) => a.project.lat !== null && a.project.lng !== null)
        .map((a) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [a.project.lng!, a.project.lat!],
          },
          properties: {
            id: a.project.id,
            name: a.project.name,
            lat: a.project.lat,
            lng: a.project.lng,
            color: RISK_COLOR[a.risk],
          },
        })),
    };
    (m.getSource("ap-projects") as GeoJSONSource).setData(features);
    (m.getSource("water-stations") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: stationItems.map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lng, s.lat] },
        properties: {
          id: s.id,
          name: s.name,
          color: RISK_COLOR[stationRisk(s)],
        },
      })),
    });
    beacons.current?.update(
      [
        ...items
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
          color: RISK_COLOR[stationRisk(s)],
          kind: s.kind,
          severity: stationRisk(s),
        })),
      ],
      stationId ?? focusId ?? undefined,
    );
  }, [items, stations, ready, water, rain, focusId, stationId]);
  useEffect(() => {
    beacons.current?.setAnimated(animated && !reducedMotion);
  }, [animated, reducedMotion, ready]);
  useEffect(() => {
    if (ready && sceneReady.current)
      map.current?.setLayoutProperty(
        "city-buildings",
        "visibility",
        buildings ? "visible" : "none",
      );
  }, [ready, buildings]);
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
    setStationId(null);
    if (items.length && items.length < 350) fitItems();
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
      padding: {
        top: 0,
        bottom: window.innerWidth <= 700 ? 300 : 0,
        left: 0,
        right: window.innerWidth > 700 ? 250 : 0,
      },
    });
  }, [focusId, ready]);
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
        padding: window.innerWidth < 700 ? 45 : 90,
        maxZoom: 14,
        pitch: city ? 45 : 0,
        duration: reducedMotion ? 0 : 1400,
      },
    );
  }
  function viewCity(next: boolean) {
    setCity(next);
    setTour(false);
    map.current?.easeTo({
      pitch: next ? 58 : 0,
      bearing: next ? -28 : 0,
      duration: reducedMotion ? 0 : 900,
    });
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
    setStationId(null);
    const sources = [
      selected.trigger,
      representativeWater(selected),
      selected.rain.find((s) => s.fresh && s.value !== null),
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
        padding:
          window.innerWidth > 700
            ? { top: 80, bottom: 170, left: 100, right: 350 }
            : { top: 190, bottom: 365, left: 45, right: 45 },
        maxZoom: 14.2,
        pitch: 45,
        duration: reducedMotion ? 0 : 1300,
      },
    );
    setWater(true);
    if (sources.some((s) => s.kind === "rain")) setRain(true);
  }
  const station = selected ? representativeWater(selected) : undefined,
    margin = bankMargin(station);
  const activeRain = selected?.rain.find((s) => s.fresh && s.value !== null);
  return (
    <div className={`city-frame ${expanded ? "city-expanded" : ""}`}>
      <div
        ref={host}
        className="city-canvas"
        aria-label="แผนที่เมืองสามมิติ โครงการ AP และสถานีตรวจวัด"
      />
      <div className="city-atmosphere" />
      <div className="city-title">
        <span className="city-kicker">
          <i /> AP WATER ATLAS <span> / 3D</span>
        </span>
        <h2>
          มองเมือง<span>เข้าใจน้ำ</span>
        </h2>
        <p>
          {selected?.project.province ?? "สำรวจโครงการ AP บนแผนที่ประเทศไทย"}
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
      </div>
      <div className="city-toolbar">
        <button
          className={listOpen ? "active" : ""}
          aria-pressed={listOpen}
          onClick={() => {
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
          <label>
            <Building2 size={17} />
            อาคาร 3 มิติ
            <Switch
              checked={buildings}
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
            <Eye size={17} />
            ภาพเคลื่อนไหว
            <Switch
              checked={animated && !reducedMotion}
              disabled={reducedMotion}
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
      {error && (
        <div className="city-error" role="status">
          <Info size={16} />
          {error}
          <button onClick={() => location.reload()}>โหลดใหม่</button>
        </div>
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
              duration: reducedMotion ? 0 : 1700,
              padding: { top: 0, bottom: 0, left: 0, right: 0 },
            });
            setCity(true);
          }}
        >
          <RotateCcw size={17} />
        </button>
      </div>
      {(selected || chosenStation) && !listOpen && !layersOpen && (
        <div className="city-inspector glass-panel">
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
              <div className="station-large-value">
                {chosenStation.value?.toFixed(2) ?? "—"}
                <small>
                  {chosenStation.kind === "water" ? "ม.รทก." : "มม. / 24 ชม."}
                </small>
              </div>
              {chosenStation.kind === "rain" && (
                <p>ฝน 1 ชม. {chosenStation.rain1h?.toFixed(1) ?? "—"} มม.</p>
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
                  AT THIS PROJECT
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
                          : "ต่ำกว่าตลิ่ง"}
                    </span>
                    <b>
                      {margin === null ? "—" : Math.abs(margin).toFixed(2)}
                      <small>ม.</small>
                    </b>
                  </div>
                  <div>
                    <CloudRain size={16} />
                    <span>ฝนสะสม 24 ชม.</span>
                    <b>
                      {activeRain?.value?.toFixed(1) ?? "—"}
                      <small>มม.</small>
                    </b>
                  </div>
                </div>
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
                <div className="city-action-hint">
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
          มุมเมือง
        </button>
        <button
          aria-pressed={!city}
          className={!city ? "active" : ""}
          onClick={() => viewCity(false)}
        >
          <ScanLine size={17} />
          มองจากบน
        </button>
        <button
          onClick={() => {
            setTour(false);
            fitItems();
          }}
        >
          <Globe2 size={17} />
          <span>ทุกโครงการ</span>
        </button>
        <i />
        <button
          className={tour ? "tour-active" : "tour-start"}
          disabled={!stops.length}
          onClick={() => {
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
        <button aria-label="วิธีอ่านแผนที่ 3D" onClick={() => setHelp(!help)}>
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
          <button onClick={() => setHelp(false)}>เข้าใจแล้ว</button>
        </div>
      )}
      {zoom < 12 && (
        <span className="city-zoom-hint">
          ซูมเข้าเพื่อดูอาคารและสถานีสามมิติ
        </span>
      )}
    </div>
  );
}
