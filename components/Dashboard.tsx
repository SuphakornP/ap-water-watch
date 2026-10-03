"use client";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Building2,
  ChevronRight,
  CircleHelp,
  CloudRain,
  Droplets,
  ExternalLink,
  Info,
  List,
  MapPin,
  Map as MapIcon,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  Waves,
  X,
  Box,
  CheckCheck,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import projectsJson from "@/data/projects.json";
import releaseInfo from "@/data/release.json";
import FloodMap from "./FloodMap";
import { useProjectTools } from "@/lib/use-project-tools";
import {
  assessProject,
  bankMargin,
  representativeWater,
} from "@/lib/assessment";
import {
  RISK_LABEL,
  RISK_ORDER,
  type Assessment,
  type Feed,
  type Project,
  type Risk,
} from "@/lib/flood-types";
const projects: Project[] = projectsJson;
const statuses: Risk[] = ["priority", "watch", "normal", "unknown"];
const regions = [
  ...new Set(projects.map((p) => p.region).filter((p): p is string => !!p)),
];
const brands = [...new Set(projects.map((p) => p.brand))].sort();
const initialFeed: Feed = {
  stations: [],
  sources: [],
  warning: null,
  fetchedAt: "",
};
const dateFormat = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
function time(value: string | null | undefined) {
  return value && Number.isFinite(Date.parse(value))
    ? dateFormat.format(new Date(value)) + " น."
    : "ไม่ทราบเวลาวัด";
}
function number(value: number | null | undefined, precision = 2) {
  return value !== null && value !== undefined ? value.toFixed(precision) : "—";
}
function RiskLabel({ risk }: { risk: Risk }) {
  return <span className={`risk-label ${risk}`}>{RISK_LABEL[risk]}</span>;
}
function FilterSelect({
  label,
  value,
  onChange,
  options,
  all,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  all: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="filter-select" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{all}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
const actionSets: Record<
  Risk,
  { title: string; note: string; steps: string[] }
> = {
  priority: {
    title: "ตรวจสอบหน้างานและเตรียมทีม",
    note: "พบสัญญาณสูงที่สถานีใกล้เคียง ให้ยืนยันสภาพจริงกับทีมพื้นที่",
    steps: [
      "ติดต่อทีมโครงการ ตรวจจุดต่ำและทางเข้า–ออกจากพื้นที่ปลอดภัย",
      "ตรวจความพร้อมปั๊มน้ำ ทางระบาย และไฟสำรองโดยผู้รับผิดชอบ",
      "เตรียมย้ายอุปกรณ์สำคัญขึ้นที่สูง และแจ้งผู้ประสานงานพื้นที่",
      "ตรวจประกาศราชการล่าสุดและทบทวนเส้นทางปลอดภัย",
    ],
  },
  watch: {
    title: "เตรียมพร้อมก่อนสถานการณ์เปลี่ยน",
    note: "เพิ่มความถี่การติดตาม และตรวจความพร้อมของระบบระบายน้ำ",
    steps: [
      "ให้ทีมพื้นที่ตรวจท่อระบาย บ่อพัก และสิ่งกีดขวาง",
      "ทดสอบปั๊มน้ำและตรวจอุปกรณ์สำรองโดยผู้รับผิดชอบ",
      "ยืนยันรายชื่อผู้ประสานงานและช่องทางติดต่อทีม",
      "ติดตามค่ารอบถัดไปพร้อมประกาศของหน่วยงานท้องถิ่น",
    ],
  },
  normal: {
    title: "ติดตามต่อเนื่องตามรอบ",
    note: "ยังไม่พบสัญญาณสูงตามเกณฑ์จากข้อมูลที่ใช้ได้ ไม่ใช่การรับรองว่าปลอดภัย",
    steps: [
      "ตรวจทางระบายน้ำและบ่อพักตามรอบบำรุงรักษา",
      "ตรวจอุปกรณ์และรายชื่อผู้ติดต่อให้พร้อมใช้งาน",
      "ติดตามประกาศพยากรณ์และตรวจสภาพหน้างาน",
    ],
  },
  unknown: {
    title: "ยืนยันสถานการณ์กับทีมพื้นที่",
    note: "ข้อมูลที่มีไม่พอจะสรุปสภาพน้ำรอบโครงการ",
    steps: [
      "ขอข้อมูลสภาพพื้นที่ล่าสุดจากผู้รับผิดชอบโครงการ",
      "ตรวจประกาศท้องถิ่นและสถานีเพิ่มเติมจากต้นทาง",
      "ตรวจความพร้อมปั๊มน้ำและทางระบายตามปกติ",
    ],
  },
};
function Checklist({ assessment }: { assessment: Assessment }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({}),
    [storageError, setStorageError] = useState(""),
    [loaded, setLoaded] = useState(false);
  const key = `ap-water-checklist-v1:${assessment.project.id}:${assessment.risk}`;
  useEffect(() => {
    setLoaded(false);
    setStorageError("");
    setChecked({});
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const data: unknown = JSON.parse(raw);
        if (
          !data ||
          typeof data !== "object" ||
          Array.isArray(data) ||
          Object.values(data).some((v) => typeof v !== "boolean")
        )
          throw new Error("Invalid checklist");
        setChecked(data as Record<string, boolean>);
      }
    } catch (error) {
      console.warn("Checklist read failed", error);
      setStorageError("อ่านรายการที่บันทึกในอุปกรณ์นี้ไม่ได้");
    }
    setLoaded(true);
  }, [key]);
  const config = actionSets[assessment.risk];
  function toggle(index: number, value: boolean) {
    const next = { ...checked, [index]: value };
    setChecked(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setStorageError("");
    } catch (error) {
      console.warn("Checklist save failed", error);
      setStorageError("บันทึกในอุปกรณ์นี้ไม่ได้ รายการจะหายเมื่อปิดหน้า");
    }
  }
  return (
    <div className="checklist">
      <div className="checklist-heading">
        <ShieldCheck size={20} />
        <div>
          <h3>{config.title}</h3>
          <p>{config.note}</p>
        </div>
      </div>
      <div className="checklist-items">
        {config.steps.map((step, i) => (
          <label key={`${key}-${i}`} className={checked[i] ? "completed" : ""}>
            <Checkbox
              disabled={!loaded}
              checked={checked[i] ?? false}
              onCheckedChange={(v) => toggle(i, v === true)}
              aria-label={step}
            />
            <span>
              <small>{String(i + 1).padStart(2, "0")}</small>
              {step}
            </span>
          </label>
        ))}
      </div>
      <p className="local-note">
        <CheckCheck size={14} />
        {Object.values(checked).filter(Boolean).length}/{config.steps.length}{" "}
        รายการ · บันทึกเฉพาะเบราว์เซอร์นี้
      </p>
      {storageError && (
        <p className="error-text" role="alert">
          {storageError}
        </p>
      )}
    </div>
  );
}
function Stations({ assessment }: { assessment: Assessment }) {
  const stations = [
    ...new Map(
      [
        ...(assessment.trigger ? [assessment.trigger] : []),
        ...assessment.water.slice(0, 3),
        ...assessment.rain.slice(0, 3),
      ].map((s) => [s.id, s]),
    ).values(),
  ];
  return (
    <div className="station-list">
      <h3>
        สถานีใกล้โครงการ <small>จุดที่ส่งสัญญาณและสถานีใกล้ที่สุด</small>
      </h3>
      {stations.length === 0 ? (
        <div className="empty-state">
          <Radio size={28} />
          <p>ไม่พบสถานีในระยะที่เลือก</p>
          <small>ลองเพิ่มรัศมี หรือตรวจสอบข้อมูลหน้างาน</small>
        </div>
      ) : (
        stations.map((s) => (
          <div className="station-row" key={s.id}>
            <span className={`station-symbol ${s.kind}`}>
              {s.kind === "water" ? (
                <Waves size={18} />
              ) : (
                <CloudRain size={18} />
              )}
            </span>
            <div>
              <b>
                {s.name}
                {assessment.trigger?.id === s.id && (
                  <em className="trigger-tag">จุดที่ส่งสัญญาณ</em>
                )}
              </b>
              <small>
                {s.distance.toFixed(1)} กม. · {s.source}
              </small>
              <small className={!s.fresh ? "stale-text" : ""}>
                {time(s.observedAt)} {!s.fresh && "· ล่าช้า / ใช้ประเมินไม่ได้"}
              </small>
              {s.kind === "rain" && (
                <small>1 ชม. {number(s.rain1h, 1)} มม.</small>
              )}
            </div>
            <strong>
              {number(s.value, s.kind === "rain" ? 1 : 2)}
              <small>{s.kind === "water" ? "ม.รทก." : "มม./24 ชม."}</small>
            </strong>
          </div>
        ))
      )}
    </div>
  );
}
function Sources({
  feed,
  onRefresh,
  loading,
}: {
  feed: Feed;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <section className="content-page">
      <div className="content-page-head">
        <div>
          <span className="eyebrow">DATA TRANSPARENCY</span>
          <h2>ข้อมูลมาจากไหน อัปเดตเมื่อไร</h2>
          <p>เวลาเชื่อมต่อสำเร็จและเวลาวัดของแต่ละสถานีเป็นคนละค่า</p>
        </div>
        <button
          className="button-outline"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "spin" : ""} />
          ตรวจข้อมูลอีกครั้ง
        </button>
      </div>
      <div className="source-list">
        {feed.sources.length === 0 ? (
          <p>กำลังเชื่อมต่อแหล่งข้อมูล…</p>
        ) : (
          feed.sources.map((s) => (
            <article key={s.id}>
              <span className="source-icon">
                {s.id === "rain" ? (
                  <CloudRain />
                ) : s.id === "water" ? (
                  <Waves />
                ) : (
                  <Radio />
                )}
              </span>
              <div>
                <h3>{s.name}</h3>
                <p>
                  {s.state === "ok"
                    ? `รับข้อมูล ${s.count.toLocaleString("th-TH")} ${s.id === "tmd" ? "ประกาศ" : "สถานี"}`
                    : s.error}
                </p>
                <small>เชื่อมต่อล่าสุด {time(s.fetchedAt)}</small>
              </div>
              <span className={`source-state ${s.state}`}>
                {s.state === "ok" ? "เชื่อมต่อสำเร็จ" : "ไม่พร้อมใช้งาน"}
              </span>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`เปิดแหล่งข้อมูล ${s.name}`}
              >
                <ExternalLink size={18} />
              </a>
            </article>
          ))
        )}
      </div>
      <div className="method-grid">
        <article>
          <h3>โครงการ AP Thailand</h3>
          <p>
            นำเข้าจากไฟล์พิกัดที่ได้รับ {projects.length} โครงการ
            รวมโครงการขายหมด จับกลุ่มจังหวัดจากข้อความที่อยู่ มี 6
            โครงการที่ยังระบุจังหวัดไม่ได้
          </p>
          <p>โซนในหน้านี้หมายถึงภูมิภาคและจังหวัด ไม่ใช่โครงสร้างทีมภายใน AP</p>
        </article>
        <article>
          <h3>ความสดของข้อมูล</h3>
          <p>
            โหลดใหม่ทุก 5 นาทีขณะเปิดหน้า ใช้ค่าที่วัดไม่เกิน 6
            ชั่วโมงและไม่อยู่ในอนาคตเกิน 15 นาที
            ข้อมูลที่ล่าช้ายังคงแสดงในรายละเอียด แต่ไม่ใช้จัดระดับ
          </p>
        </article>
        <article>
          <h3>ข้อจำกัดด้านพื้นที่</h3>
          <p>
            คัดกรองด้วยระยะเส้นตรงจากพิกัดโครงการ ไม่ทราบระดับพื้นดิน
            แนวคันกั้นน้ำ ทิศทางน้ำ หรือการเชื่อมต่อระบบระบายน้ำ
            จึงต้องยืนยันหน้างานเสมอ
          </p>
        </article>
        <article>
          <h3>แหล่งอ้างอิงและแนวทาง</h3>
          <p>
            <a
              href="https://www.thaiwater.net/"
              target="_blank"
              rel="noreferrer"
            >
              ThaiWater / สสน. <ExternalLink size={13} />
            </a>{" "}
            ·{" "}
            <a
              href="https://data.tmd.go.th/dataset/index.php"
              target="_blank"
              rel="noreferrer"
            >
              TMD Open Data <ExternalLink size={13} />
            </a>
          </p>
          <p>
            แนวทางการอ่านสถานการณ์จาก{" "}
            <a href="https://flood.pop.in.th/" target="_blank" rel="noreferrer">
              POPNIX Flood
            </a>{" "}
            และการเชื่อมต่อข้อมูลจาก NANWATCH
          </p>
        </article>
      </div>
    </section>
  );
}
function Guide() {
  const [step, setStep] = useState(0);
  const steps = [
    {
      title: "อ่านสัญญาณ",
      text: "ดูว่าจุดวัดใดส่งสัญญาณน้ำสูงหรือฝนหนัก แล้วตรวจเวลาและระยะห่างจากโครงการ",
      icon: Radio,
    },
    {
      title: "ยืนยันหน้างาน",
      text: "ประสานผู้รับผิดชอบให้ตรวจทางเข้า–ออก จุดต่ำ บ่อพัก และทางระบายจากพื้นที่ปลอดภัย",
      icon: MapPin,
    },
    {
      title: "เตรียมอุปกรณ์",
      text: "ตรวจปั๊มน้ำ ไฟสำรอง ผู้รับผิดชอบ และอุปกรณ์ป้องกันตามแผนของโครงการ",
      icon: ShieldCheck,
    },
    {
      title: "ติดตามและประสาน",
      text: "ตรวจรอบถัดไป ติดตามประกาศทางการ และประสานทีมตามความรุนแรงที่ยืนยันได้",
      icon: CheckCheck,
    },
  ];
  const Icon = steps[step].icon;
  return (
    <section className="content-page">
      <span className="eyebrow">READ · VERIFY · PREPARE</span>
      <h2>รู้สถานการณ์ แล้วเตรียมตัวอย่างเป็นขั้นตอน</h2>
      <p className="page-intro">
        คำแนะนำเบื้องต้นสำหรับทีมโครงการ
        ใช้ร่วมกับแผนฉุกเฉินของพื้นที่และคำสั่งเจ้าหน้าที่
      </p>
      <div className="guide-flow">
        {steps.map((s, i) => (
          <button
            key={s.title}
            className={step === i ? "active" : ""}
            onClick={() => setStep(i)}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {s.title}
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
      <div className="guide-explainer" key={step}>
        <div>
          <Icon size={48} />
        </div>
        <article>
          <small>ขั้นตอน {step + 1} / 4</small>
          <h3>{steps[step].title}</h3>
          <p>{steps[step].text}</p>
        </article>
      </div>
      <h3 className="rules-title">สีบอกอะไร</h3>
      <div className="rules-list">
        {statuses.map((r) => (
          <article key={r}>
            <RiskLabel risk={r} />
            <p>
              {r === "priority"
                ? "มีสถานีรายงานล้นตลิ่ง หรือฝน ≥ 90.1 มม./24 ชม. หรือ ≥ 50.1 มม./1 ชม."
                : r === "watch"
                  ? "มีสถานีรายงานน้ำมาก หรือฝน ≥ 35.1 มม./24 ชม. หรือ ≥ 25.1 มม./1 ชม."
                  : r === "normal"
                    ? "มีข้อมูลน้ำและฝน 1 ชม./24 ชม. ที่ใช้ได้ และยังไม่มีสัญญาณเข้าเกณฑ์"
                    : "ไม่มีสถานีในระยะ ข้อมูลล่าช้า หรือข้อมูลน้ำและฝนยังไม่ครบ"}
            </p>
          </article>
        ))}
      </div>
      <div className="method-note">
        <Info size={19} />
        <p>
          เกณฑ์จัดลำดับนี้เป็นการคัดกรองของ AP Water Watch
          ไม่ใช่ประกาศเตือนภัยทางการ
          ใช้สัญญาณรุนแรงที่สุดจากทุกสถานีที่ใช้ได้ในรัศมีที่เลือก
          ไม่ได้เลือกเฉพาะสถานีที่ใกล้ที่สุด ·{" "}
          <a
            href="https://www5.tmd.go.th/info/การวดปรมาณนาฟาหรอหยาดนาฟา"
            target="_blank"
            rel="noreferrer"
          >
            เกณฑ์ฝนของ TMD
          </a>
        </p>
      </div>
      <div className="emergency">
        <b>พบเหตุฉุกเฉิน</b>
        <span>
          ปภ. <a href="tel:1784">1784</a>
        </span>
        <span>
          แพทย์ฉุกเฉิน <a href="tel:1669">1669</a>
        </span>
        <p>
          หลีกเลี่ยงน้ำไหลแรงและอุปกรณ์ไฟฟ้าในพื้นที่เปียก
          ให้เจ้าหน้าที่ที่รับผิดชอบจัดการ
        </p>
      </div>
    </section>
  );
}
export default function Dashboard() {
  const [tab, setTab] = useState("overview"),
    [view, setView] = useState("map"),
    [search, setSearch] = useState(""),
    [region, setRegion] = useState("all"),
    [province, setProvince] = useState("all"),
    [brand, setBrand] = useState("all"),
    [risk, setRisk] = useState("all"),
    [radius, setRadius] = useState("10");
  const [feed, setFeed] = useState<Feed>(initialFeed),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [now, setNow] = useState(0),
    [focusId, setFocusId] = useState<string | null>(null),
    [detailOpen, setDetailOpen] = useState(false),
    [motionReduced, setMotionReduced] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch("/api/monitor", { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: Feed = await response.json();
      if (!Array.isArray(data.stations) || !Array.isArray(data.sources))
        throw new Error("Invalid monitor response");
      setFeed(data);
      setError("");
      setNow(Date.now());
    } catch (err) {
      if (signal?.aborted) return;
      console.error("Monitor refresh failed", err);
      setError(
        "โหลดข้อมูลรอบล่าสุดไม่ได้ กำลังแสดงข้อมูลที่รับได้ครั้งก่อน โปรดตรวจเวลาวัด",
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = setInterval(() => {
      void refresh(controller.signal);
    }, 300_000);
    const clock = setInterval(() => setNow(Date.now()), 60_000);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setMotionReduced(media.matches);
    const onMotion = () => setMotionReduced(media.matches);
    media.addEventListener("change", onMotion);
    return () => {
      controller.abort();
      clearInterval(timer);
      clearInterval(clock);
      media.removeEventListener("change", onMotion);
    };
  }, [refresh]);
  const allAssessments = useMemo(
    () =>
      projects
        .map((p) => assessProject(p, feed.stations, Number(radius), now))
        .sort(
          (a, b) =>
            RISK_ORDER[a.risk] - RISK_ORDER[b.risk] ||
            a.project.name.localeCompare(b.project.name, "th"),
        ),
    [feed.stations, radius, now],
  );
  const provinces = useMemo(
    () =>
      [
        ...new Set(
          projects
            .filter((p) => region === "all" || p.region === region)
            .map((p) => p.province ?? "ยังไม่ระบุจังหวัด"),
        ),
      ].sort((a, b) => a.localeCompare(b, "th")),
    [region],
  );
  const scoped = useMemo(
    () =>
      allAssessments.filter((a) => {
        const p = a.project;
        return (
          (region === "all" || p.region === region) &&
          (province === "all" ||
            (p.province ?? "ยังไม่ระบุจังหวัด") === province) &&
          (brand === "all" || p.brand === brand) &&
          `${p.name} ${p.province ?? ""} ${p.address} ${p.code}`
            .toLowerCase()
            .includes(deferredSearch.trim().toLowerCase())
        );
      }),
    [allAssessments, region, province, brand, deferredSearch],
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        statuses.map((r) => [r, scoped.filter((a) => a.risk === r).length]),
      ) as Record<Risk, number>,
    [scoped],
  );
  const rows = useMemo(
    () =>
      scoped.filter(
        (a) =>
          risk === "all" ||
          a.risk === risk ||
          (risk === "attention" &&
            (a.risk === "priority" || a.risk === "watch")),
      ),
    [scoped, risk],
  );
  useProjectTools(rows, Number(radius));
  const focused = rows.find((a) => a.project.id === focusId) ?? rows[0];
  const station = focused ? representativeWater(focused) : undefined,
    margin = bankMargin(station);
  const healthy = feed.sources.filter((s) => s.state === "ok").length;
  function selectProject(id: string) {
    setFocusId(id);
    setDetailOpen(true);
  }
  function reset() {
    setSearch("");
    setRegion("all");
    setProvince("all");
    setBrand("all");
    setRisk("all");
  }
  const anyFilter =
    search ||
    region !== "all" ||
    province !== "all" ||
    brand !== "all" ||
    risk !== "all";
  const sourceNames = feed.sources
    .filter((s) => s.state === "error")
    .map((s) => s.name)
    .join(", ");
  return (
    <Tabs value={tab} onValueChange={setTab} className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="AP Water Watch หน้าหลัก">
          <span className="ap-logo">
            AP<span>THAILAND</span>
          </span>
          <i />
          <span className="brand-name">
            WATER<span>WATCH</span>
          </span>
        </a>
        <TabsList className="main-nav" variant="line">
          <TabsTrigger value="overview">
            <MapPin size={17} />
            ภาพรวมโครงการ
          </TabsTrigger>
          <TabsTrigger value="sources">
            <Radio size={17} />
            แหล่งข้อมูล
          </TabsTrigger>
          <TabsTrigger value="guide">
            <ShieldCheck size={17} />
            แนวทางรับมือ
          </TabsTrigger>
        </TabsList>
        <span className="internal-tag">AP OPERATIONS</span>
      </header>
      <main>
        <TabsContent value="overview">
          <div className="page-heading">
            <div>
              <span className="eyebrow">PROJECT WATER MONITORING</span>
              <h1>
                สถานการณ์น้ำรอบโครงการ<span className="title-dot">.</span>
              </h1>
              <p>ดูสัญญาณจากสถานีใกล้เคียง แล้วเตรียมพร้อมให้แต่ละพื้นที่</p>
            </div>
            <div className="sync-box">
              <span>
                <i
                  className={
                    loading
                      ? "loading-dot"
                      : healthy === 3
                        ? "connected-dot"
                        : "partial-dot"
                  }
                />
                {loading
                  ? "กำลังอัปเดตข้อมูล"
                  : error
                    ? "รับข้อมูลล่าสุดไม่สำเร็จ"
                    : healthy === 3
                      ? "เชื่อมต่อข้อมูลเปิดแล้ว"
                      : `แหล่งข้อมูลพร้อม ${healthy}/3`}
              </span>
              <small>
                {feed.fetchedAt
                  ? `รับข้อมูล ${time(feed.fetchedAt)}`
                  : "อัปเดตอัตโนมัติทุก 5 นาที"}
              </small>
              <button
                aria-label="รีเฟรชข้อมูล"
                onClick={() => void refresh()}
                disabled={loading}
              >
                <RefreshCw size={15} className={loading ? "spin" : ""} />
              </button>
            </div>
          </div>
          {releaseInfo.demo && <div className="data-alert" role="status"><Info size={16}/>โหมดตัวอย่าง · พิกัดสาธิต ไม่ใช่โครงการ AP จริง · ค่าสถานีมาจากข้อมูลเปิด</div>}
          {error && (
            <div className="data-alert" role="alert">
              <TriangleAlert size={17} />
              {error}
            </div>
          )}
          {sourceNames && (
            <div className="data-alert" role="status">
              <Info size={16} />
              {sourceNames} เชื่อมต่อไม่ได้ · ใช้ข้อมูลที่รับได้จากแหล่งอื่น{" "}
              <button onClick={() => setTab("sources")}>ดูสถานะ</button>
            </div>
          )}
          <div className="stats-strip">
            <button
              className={`stat total ${risk === "all" ? "selected" : ""}`}
              onClick={() => setRisk("all")}
              aria-pressed={risk === "all"}
            >
              <span>
                <Building2 size={17} />
                โครงการในมุมมอง
              </span>
              <strong>
                {scoped.length}
                <small>โครงการ</small>
              </strong>
              <p>จากทั้งหมด {projects.length} · รวมขายหมด</p>
            </button>
            {statuses.map((r) => (
              <button
                className={`stat ${r} ${risk === r ? "selected" : ""}`}
                key={r}
                onClick={() => setRisk(risk === r ? "all" : r)}
                aria-pressed={risk === r}
              >
                <span>
                  <i />
                  {RISK_LABEL[r]}
                </span>
                <strong>{loading && !feed.fetchedAt ? "—" : counts[r]}</strong>
                <p>
                  {r === "priority"
                    ? "ตรวจหน้างานและเตรียมทีม"
                    : r === "watch"
                      ? "ติดตามน้ำและฝนใกล้ชิด"
                      : r === "normal"
                        ? "ติดตามต่อเนื่องตามรอบ"
                        : "ยืนยันกับผู้รับผิดชอบพื้นที่"}
                </p>
              </button>
            ))}
          </div>
          {feed.warning && (
            <div className="bulletin">
              <span>
                <Radio size={16} />
                <b>ประกาศ TMD</b>
              </span>
              <a href={feed.warning.url} target="_blank" rel="noreferrer">
                {feed.warning.title}
                {feed.warning.area && ` · ${feed.warning.area}`}
                <ExternalLink size={13} />
              </a>
              <small>ออกเมื่อ {time(feed.warning.issuedAt)}</small>
            </div>
          )}
          <div className="filters">
            <div className="search-box">
              <Search size={18} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อโครงการ จังหวัด หรือรหัส"
                aria-label="ค้นหาโครงการ"
              />
              {search && (
                <button onClick={() => setSearch("")} aria-label="ล้างคำค้น">
                  <X size={15} />
                </button>
              )}
            </div>
            <FilterSelect
              label="ภูมิภาค"
              value={region}
              onChange={(v) => {
                setRegion(v);
                setProvince("all");
              }}
              options={regions}
              all="ทุกภูมิภาค"
            />
            <FilterSelect
              label="จังหวัด"
              value={province}
              onChange={setProvince}
              options={provinces}
              all="ทุกจังหวัด"
            />
            <FilterSelect
              label="แบรนด์"
              value={brand}
              onChange={setBrand}
              options={brands}
              all="ทุกแบรนด์"
            />
            <Select value={radius} onValueChange={setRadius}>
              <SelectTrigger
                className="filter-select radius-select"
                aria-label="รัศมีสถานี"
              >
                <SlidersHorizontal size={14} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["5", "10", "20"].map((r) => (
                  <SelectItem value={r} key={r}>
                    รัศมี {r} กม.
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {anyFilter && (
              <button
                className="clear-filter"
                onClick={reset}
                title="ล้างตัวกรอง"
                aria-label="ล้างตัวกรอง"
              >
                <X size={17} />
              </button>
            )}
          </div>
          <Tabs value={view} onValueChange={setView} className="view-tabs">
            <section
              className={`monitor-workspace ${view === "list" ? "table-workspace" : ""}`}
            >
              <div className="map-side">
                <div className="section-top">
                  <div className="map-heading">
                    <h2>
                      {view === "map"
                        ? "สำรวจพื้นที่สามมิติ"
                        : "โครงการทั้งหมด"}
                    </h2>
                    <small>
                      {rows.length} โครงการ
                      {risk !== "all" &&
                        ` · ${risk === "attention" ? "ต้องติดตาม" : RISK_LABEL[risk as Risk]}`}
                    </small>
                  </div>
                  <TabsList className="view-toggle">
                    <TabsTrigger value="map" aria-label="มุมมองแผนที่">
                      <MapIcon size={15} />
                      <span>แผนที่</span>
                    </TabsTrigger>
                    <TabsTrigger value="list" aria-label="มุมมองรายการ">
                      <List size={16} />
                      <span>รายการ</span>
                    </TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="map">
                  <FloodMap
                    items={rows}
                    stations={feed.stations}
                    focusId={focusId}
                    onFocus={setFocusId}
                    onSelect={selectProject}
                    reducedMotion={motionReduced}
                  />
                </TabsContent>
                <TabsContent value="list">
                  <div className="table-scroll">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>โครงการ</TableHead>
                          <TableHead>จังหวัด</TableHead>
                          <TableHead>ระดับที่ควรติดตาม</TableHead>
                          <TableHead>สัญญาณใกล้เคียง</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((a) => (
                          <TableRow key={a.project.id}>
                            <TableCell>
                              <button
                                className="table-project"
                                onClick={() => selectProject(a.project.id)}
                              >
                                {a.project.name}
                                <small>
                                  {a.project.code} · {a.project.brand}
                                </small>
                              </button>
                            </TableCell>
                            <TableCell>
                              {a.project.province ?? "ไม่ระบุจังหวัด"}
                            </TableCell>
                            <TableCell>
                              <RiskLabel risk={a.risk} />
                            </TableCell>
                            <TableCell className="reason-cell">
                              {a.reason}
                            </TableCell>
                            <TableCell>
                              <button
                                className="icon-button"
                                onClick={() => selectProject(a.project.id)}
                                aria-label={`ดู ${a.project.name}`}
                              >
                                <ChevronRight size={17} />
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {rows.length === 0 && (
                    <div className="empty-state">
                      <Search size={28} />
                      <p>ไม่พบโครงการที่ตรงกับตัวกรอง</p>
                      <button className="button-outline" onClick={reset}>
                        ล้างตัวกรอง
                      </button>
                    </div>
                  )}
                </TabsContent>
              </div>
            </section>
          </Tabs>
          <div className="map-footnote">
            <CircleHelp size={15} />
            <span>
              สีแสดงสัญญาณจากสถานีใกล้เคียง
              ไม่ใช่ขอบเขตน้ำท่วมหรือการยืนยันสภาพภายในโครงการ
            </span>
            <button onClick={() => setTab("guide")}>
              เข้าใจเกณฑ์การเฝ้าระวัง
            </button>
          </div>
          {focused ? (
            <section className="insight-section" id="water-insight">
              <div className="insight-heading">
                <div>
                  <span className="eyebrow">FROM SIGNAL TO ACTION</span>
                  <h2>เห็นระดับน้ำ เข้าใจสิ่งที่ต้องเตรียม</h2>
                </div>
                <span className="three-badge">
                  <Waves size={14} /> STATION INSIGHT
                </span>
              </div>
              <div className="insight-grid">
                <div className="water-insight">
                  <div className="insight-project">
                    <div>
                      <span>โครงการที่เลือก</span>
                      <h3>{focused.project.name}</h3>
                    </div>
                    <RiskLabel risk={focused.risk} />
                  </div>
                  <div className="scene-and-reading">
                    <div className="level-editorial">
                      <Waves size={42} />
                      <span>WATER LEVEL</span>
                      <p>
                        อ้างอิงค่าวัด ณ สถานี
                        <br />
                        เพื่อเตรียมพร้อมให้โครงการ
                      </p>
                    </div>
                    <div className="water-reading">
                      <span>ระยะน้ำถึงตลิ่ง ณ สถานี</span>
                      <strong
                        className={
                          margin !== null && margin <= 0 ? "warning-value" : ""
                        }
                      >
                        {margin === null ? "—" : Math.abs(margin).toFixed(2)}
                        <small>เมตร</small>
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
                      <p>
                        {station
                          ? `${station.name} · ${station.distance.toFixed(1)} กม.`
                          : "ไม่มีสถานีที่ใช้ได้ในระยะ"}
                      </p>
                      <small>
                        {station
                          ? time(station.observedAt)
                          : "เลือกโครงการบนแผนที่เพื่อดูรายละเอียด"}
                      </small>
                      <div className="measurement-note">
                        ระดับสถานีไม่ใช่ความลึกน้ำท่วมในโครงการ
                      </div>
                    </div>
                  </div>
                  <button
                    className="text-action"
                    onClick={() => setDetailOpen(true)}
                  >
                    ดูค่าวัดและสถานีของโครงการ
                    <ChevronRight size={15} />
                  </button>
                </div>
                <Checklist
                  key={focused.project.id + focused.risk + String(detailOpen)}
                  assessment={focused}
                />
              </div>
            </section>
          ) : (
            <div className="empty-selection">
              <Box size={22} />
              <span>
                เลือกตัวกรองที่มีโครงการ เพื่อดูภาพระดับน้ำและแนวทางเตรียมพร้อม
              </span>
            </div>
          )}
          <div className="source-footer">
            <div>
              <span className="source-footer-icon">
                <Radio size={18} />
              </span>
              <span>
                ข้อมูลเปิดจาก <b>ThaiWater</b> และ <b>กรมอุตุนิยมวิทยา</b>
                <small>
                  ดึงข้อมูลทุก 5 นาทีขณะเปิดหน้า · ค่าที่เกิน 6
                  ชั่วโมงไม่ใช้จัดระดับ
                </small>
              </span>
            </div>
            <button onClick={() => setTab("sources")}>
              ดูสถานะแหล่งข้อมูล
              <ExternalLink size={14} />
            </button>
          </div>
        </TabsContent>
        <TabsContent value="sources">
          <Sources
            feed={feed}
            loading={loading}
            onRefresh={() => void refresh()}
          />
        </TabsContent>
        <TabsContent value="guide">
          <Guide />
        </TabsContent>
        <footer>
          <span>
            <Droplets size={16} /> AP WATER WATCH
          </span>
          <span>เฝ้าระวังเพื่อเตรียมพร้อม · ไม่ใช่ประกาศเตือนภัยทางการ</span>
          <span>AP THAILAND</span>
        </footer>
      </main>
      {focused && (
        <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
          <SheetContent className="project-sheet">
            <SheetHeader>
              <span className="eyebrow">PROJECT SITUATION</span>
              <SheetTitle>{focused.project.name}</SheetTitle>
              <SheetDescription>
                {focused.project.code} ·{" "}
                {focused.project.province ?? "ยังไม่ระบุจังหวัด"}
              </SheetDescription>
            </SheetHeader>
            <div className="sheet-body">
              <div className={`project-status ${focused.risk}`}>
                <RiskLabel risk={focused.risk} />
                <p>{focused.reason}</p>
                <small>
                  ใช้สัญญาณสูงสุดจากสถานีในรัศมี {radius} กม.
                  ไม่ยืนยันว่าโครงการได้รับผลกระทบ
                </small>
              </div>
              <p className="project-address">
                <MapPin size={16} />
                {focused.project.address || "ไม่มีรายละเอียดที่อยู่"}
              </p>
              <div className="coordinate-line">
                {focused.project.lat?.toFixed(6)},{" "}
                {focused.project.lng?.toFixed(6)} ·{" "}
                {focused.project.salesStatus === "sold_out"
                  ? "โครงการขายหมด"
                  : "โครงการในทะเบียน AP"}
              </div>
              <Stations assessment={focused} />
              <div className="sheet-method">
                <Info size={15} />
                <span>
                  ระดับน้ำหน่วย ม.รทก. คือความสูงเทียบระดับทะเล
                  ไม่ใช่ความลึกน้ำท่วม ฝนเป็นค่าที่สถานี ไม่ใช่การวัดในโครงการ
                </span>
              </div>
              <Checklist
                key={focused.project.id + focused.risk + "detail"}
                assessment={focused}
              />
              <button
                className="button-outline"
                onClick={() => {
                  setDetailOpen(false);
                  setTab("overview");
                  setTimeout(
                    () =>
                      document.getElementById("water-insight")?.scrollIntoView({
                        behavior: motionReduced ? "instant" : "smooth",
                        block: "center",
                      }),
                    120,
                  );
                }}
              >
                <Box size={17} />
                ดูภาพระดับน้ำ 3D
              </button>
              <a
                className="source-link"
                href="https://twa.thaiwater.net/th/map/flash-flood/water-level/overall/0"
                target="_blank"
                rel="noreferrer"
              >
                ตรวจสอบกับ ThaiWater
                <ExternalLink size={14} />
              </a>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </Tabs>
  );
}
