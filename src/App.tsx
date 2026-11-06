import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Activity, AlertTriangle, Award, Bike, Bolt, Building2, Bus, Car, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  ClipboardCheck, Clock3, CloudOff, Compass, Cpu, Download, Droplets, FileSpreadsheet, FileText, Footprints, Fuel, Leaf, Lightbulb, LogOut, MapPin, Navigation, PlusCircle, RefreshCw,
  Map as MapIcon, Search, ShieldCheck, Signal, Sliders, Sparkles, Target, Train, Trash2, TrendingDown, UploadCloud, Wallet, Wifi, WifiOff, Zap,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { SensorReading } from "./lib/readings";
import { fetchFirstReadingSince, fetchLatestReading, fetchReadings, subscribeToReadings } from "./lib/readings";
import { fetchRiverForecast, initialRiverForecast, projectRiverForecast, riverForecastError, type LivePowerForecast, type RiverForecast } from "./lib/forecast";
import { supabaseConfigured } from "./lib/supabase";
import BillForecastPanel from "./components/BillForecastPanel";
import { useAuthAccess } from "./components/AuthProvider";
import { TabPermissionsPanel, UserManagementPanel } from "./components/AdminAccessPanels";

type Range = "15m" | "1h" | "6h" | "24h";
type Page = "live" | "device" | "insights" | "costs" | "planning" | "anomaly" | "travel" | "goals" | "audit" | "user-management" | "tab-permissions";
type ServiceState = "unconfigured" | "connecting" | "ready" | "error";
type Health = "waiting" | "connected" | "delayed" | "offline";
const TIMEZONE = "Asia/Kolkata";
const HOUR_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
const HOUR_LABEL_FORMATTER = new Intl.DateTimeFormat("en-IN", { timeZone: TIMEZONE, day: "2-digit", month: "short", hour: "2-digit", hour12: false });
const DEVICE_ID = import.meta.env.VITE_SUPABASE_DEVICE_ID?.trim() || "ELEC-01";
const EMISSION_FACTOR = Number(import.meta.env.VITE_CARBON_EMISSION_FACTOR_KG_PER_KWH) || 0.82;
const DEFAULT_TRAVEL_DESTINATION = "Vidyalankar Institute of Technology, Wadala East, Mumbai";
const VIT_CAMPUS_COORDINATES: [number, number] = [19.02161, 72.87091];
const RANGE_MS: Record<Range, number> = { "15m": 15 * 60_000, "1h": 60 * 60_000, "6h": 6 * 60 * 60_000, "24h": 24 * 60 * 60_000 };
const STALE_AFTER_MS = 15_000;
const OFFLINE_AFTER_MS = 60_000;
const FLOOR_ONE_PLAN = "/maps/campus-floor-plan-professional.png";
const FLOOR_ONE_CLASSROOMS = [
  { id: "classroom-1", name: "Classroom 1", x: 952, y: 624, connected: true },
  { id: "classroom-2", name: "Classroom 2", x: 1346, y: 370, connected: false },
  { id: "classroom-3", name: "Classroom 3", x: 1346, y: 620, connected: false },
] as const;
function pageFromHash(): Page {
  if (window.location.hash === "#user-management") return "user-management";
  if (window.location.hash === "#tab-permissions") return "tab-permissions";
  if (["#anomaly-monitor", "#campus-anomaly"].includes(window.location.hash)) return "anomaly";
  if (["#device", "#device-card"].includes(window.location.hash)) return "device";
  if (["#energy-insights", "#range-summary"].includes(window.location.hash)) return "insights";
  if (["#cost-savings", "#cost-emissions"].includes(window.location.hash)) return "costs";
  if (["#energy-planning", "#bill-history", "#campus-forecast"].includes(window.location.hash)) return "planning";
  if (["#carbon-goals", "#goals", "#targets"].includes(window.location.hash)) return "goals";
  if (["#campus-audit", "#audit", "#campus-audit-records"].includes(window.location.hash)) return "audit";
  if (["#know-your-carbon", "#student-travel", "#travel"].includes(window.location.hash)) return "travel";
  return "live";
}

export type TransportCategory = "Private Vehicle" | "Public Transit" | "Zero Emission";

export interface TransportMode {
  id: string;
  name: string;
  shortName: string;
  category: TransportCategory;
  factorKgPerKm: number;
  icon: typeof Car;
  avgSpeedKmH: number;
  costPerKmINR: number;
  badge: string;
  description: string;
}

export const TRANSPORT_MODES: TransportMode[] = [
  { id: "petrol-car", name: "Petrol Car (Solo)", shortName: "Car", category: "Private Vehicle", factorKgPerKm: 0.170, icon: Car, avgSpeedKmH: 35, costPerKmINR: 8.5, badge: "Baseline Car", description: "Standard ICE petrol car with single occupant" },
  { id: "two-wheeler", name: "Motorbike / Scooter", shortName: "Bike", category: "Private Vehicle", factorKgPerKm: 0.060, icon: Bike, avgSpeedKmH: 30, costPerKmINR: 2.8, badge: "65% Less CO₂", description: "Standard 100-150cc petrol 2-wheeler" },
  { id: "metro-train", name: "Metro / Local Train", shortName: "Train", category: "Public Transit", factorKgPerKm: 0.025, icon: Train, avgSpeedKmH: 45, costPerKmINR: 1.5, badge: "85% Less CO₂", description: "Electric urban rail per-passenger share" },
  { id: "city-bus", name: "City Bus", shortName: "Bus", category: "Public Transit", factorKgPerKm: 0.035, icon: Bus, avgSpeedKmH: 22, costPerKmINR: 1.2, badge: "79% Less CO₂", description: "Municipal city bus per-passenger share" },
  { id: "ev-scooter", name: "Electric Scooter / EV", shortName: "EV", category: "Private Vehicle", factorKgPerKm: 0.045, icon: Zap, avgSpeedKmH: 30, costPerKmINR: 0.6, badge: "74% Less CO₂", description: "Electric 2-wheeler charged on grid power" },
  { id: "bicycle", name: "Bicycle", shortName: "Bicycle", category: "Zero Emission", factorKgPerKm: 0.000, icon: Bike, avgSpeedKmH: 15, costPerKmINR: 0.0, badge: "Zero Emission", description: "Human powered active mobility" },
  { id: "walking", name: "Walking", shortName: "Walk", category: "Zero Emission", factorKgPerKm: 0.000, icon: Footprints, avgSpeedKmH: 5, costPerKmINR: 0.0, badge: "Zero Emission", description: "Pedestrian walk to campus" },
  { id: "diesel-car", name: "Diesel Car / SUV", shortName: "Diesel Car", category: "Private Vehicle", factorKgPerKm: 0.171, icon: Fuel, avgSpeedKmH: 35, costPerKmINR: 7.2, badge: "High Impact", description: "Diesel vehicle or SUV commute" },
];

export interface CampusConservationLever {
  id: string;
  name: string;
  category: string;
  reductionPct: number;
  monthlySavingsKg: number;
  annualSavingsKg: number;
  savingsINRPerMonth: number;
  description: string;
  icon: typeof Cpu;
}

export const CAMPUS_LEVERS: CampusConservationLever[] = [
  {
    id: "smart-lab-sleep",
    name: "Smart Lab Workstation Auto-Sleep",
    category: "Computer Labs & Servers",
    reductionPct: 4.2,
    monthlySavingsKg: 52.5,
    annualSavingsKg: 577.5,
    savingsINRPerMonth: 755,
    description: "Powers down idle campus lab PCs and high-power GPUs between 6:00 PM and 8:00 AM.",
    icon: Cpu,
  },
  {
    id: "hvac-opt",
    name: "Campus HVAC Setpoint to 24°C",
    category: "Classrooms & Halls",
    reductionPct: 5.5,
    monthlySavingsKg: 68.8,
    annualSavingsKg: 756.8,
    savingsINRPerMonth: 990,
    description: "Adjusts thermostat from 21°C to 24°C, reducing chilling compressor load by ~18%.",
    icon: Sparkles,
  },
  {
    id: "corridor-led-motion",
    name: "Corridor Smart Motion Dimming",
    category: "Facilities & Quad",
    reductionPct: 2.1,
    monthlySavingsKg: 26.3,
    annualSavingsKg: 289.3,
    savingsINRPerMonth: 378,
    description: "Dims hallway and quad fixtures to 20% when no student movement is sensed.",
    icon: Lightbulb,
  },
  {
    id: "solar-rooftop",
    name: "Rooftop Solar PV Net-Metering",
    category: "Renewable Microgrid",
    reductionPct: 8.5,
    monthlySavingsKg: 106.3,
    annualSavingsKg: 1169.3,
    savingsINRPerMonth: 1530,
    description: "Injects solar rooftop generation into campus distribution during afternoon peak.",
    icon: Leaf,
  },
  {
    id: "workshop-idle-cutoff",
    name: "Engineering Workshop Idle Cutoff",
    category: "Workshops & FabLab",
    reductionPct: 3.2,
    monthlySavingsKg: 40.0,
    annualSavingsKg: 440.0,
    savingsINRPerMonth: 576,
    description: "Automated contactor cutoff for 3D printers, CNC and pneumatic compressors after labs.",
    icon: Activity,
  },
];
const ELECTRICITY_TARIFF = 11.8;
const GREEN_TAX_PER_KWH = 12.85;

export type AuditCategory = "electricity" | "water" | "waste" | "recycling";

export interface AuditEmissionFactors {
  electricityKwh: number;
  waterKl: number;
  wasteKg: number;
  recyclingKg: number;
}

export interface AuditRecord {
  id: string;
  category: AuditCategory;
  title: string;
  invoiceNo: string;
  billingPeriod: string;
  date: string;
  quantity: number;
  unit: string;
  emissionFactor: number;
  carbonEmissionsKg: number;
  costINR: number;
  vendorOrFacility: string;
  documentName?: string;
  documentSize?: string;
  status: "verified" | "pending" | "audited";
  auditorNotes?: string;
  uploadedAt: number;
}

export const PREDEFINED_EMISSION_FACTORS: AuditEmissionFactors = {
  electricityKwh: 0.82,
  waterKl: 0.38,
  wasteKg: 1.85,
  recyclingKg: -0.80,
};

export const DEFAULT_AUDIT_FACTORS = PREDEFINED_EMISSION_FACTORS;

export const DEFAULT_AUDIT_RECORDS: AuditRecord[] = [];
const rowKey = (row: SensorReading) => String(row.id ?? `${row.device_id}|${row.recorded_at}|${row.energy_kwh}`);
const timeMs = (row: SensorReading | null | undefined) => row ? Date.parse(row.recorded_at) : NaN;
const dayKey = (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
function earliestTodayReading(current: Pick<SensorReading, "recorded_at" | "energy_kwh"> | null, incoming: SensorReading) {
  if (!current || dayKey(current.recorded_at) !== dayKey(incoming.recorded_at) || Date.parse(incoming.recorded_at) < Date.parse(current.recorded_at)) {
    return { recorded_at: incoming.recorded_at, energy_kwh: incoming.energy_kwh };
  }
  return current;
}
const num = (value: number | string | null | undefined) => value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
function mergeRows(current: SensorReading[], incoming: SensorReading[]) {
  const merged = new Map(current.map(row => [rowKey(row), row]));
  incoming.forEach(row => merged.set(rowKey(row), row));
  return [...merged.values()].sort((a, b) => timeMs(a) - timeMs(b)).slice(-20_000);
}
function formatNumber(value: number | string | null | undefined, digits: number) {
  const number = num(value);
  return number === null ? "—" : new Intl.NumberFormat("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(number);
}
function formatRupees(value: number | null, digits = 2) {
  return value === null ? "—" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}
function formatTime(value: string | null | undefined, withDate = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: TIMEZONE, ...(withDate ? { day: "2-digit", month: "short", year: "numeric" } : {}), hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(date);
}
function startOfToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value || "00";
  return new Date(`${value("year")}-${value("month")}-${value("day")}T00:00:00+05:30`).toISOString();
}
function toDateTimeLocal(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function ago(age: number) {
  if (!Number.isFinite(age) || age < 0) return "just now";
  const seconds = Math.floor(age / 1000);
  if (seconds < 2) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}
function getHealth(latest: SensorReading | null, state: ServiceState): Health {
  if (!latest) return state === "error" ? "offline" : "waiting";
  const age = Date.now() - timeMs(latest);
  if (age <= STALE_AFTER_MS) return "connected";
  if (age <= OFFLINE_AFTER_MS) return "delayed";
  return "offline";
}
function PowerTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { power: number; recordedAt: string } }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return <div className="chart-tooltip"><b>{formatNumber(point.power, 1)} W</b><span>{formatTime(point.recordedAt, true)} IST</span></div>;
}
function EmissionTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { emissionRate: number; recordedAt: string } }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return <div className="chart-tooltip"><b>{formatNumber(point.emissionRate, 4)} kg CO₂e/h</b><span>{formatTime(point.recordedAt, true)} IST</span></div>;
}
function CarbonFootprintTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value?: number; payload: { recordedAt?: string; hour?: string } }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0];
  return <div className="chart-tooltip"><b>{formatNumber(point.value, 4)} kg CO₂e</b><span>{point.payload.recordedAt ? `${formatTime(point.payload.recordedAt, true)} IST` : point.payload.hour || ""}</span></div>;
}

function FloorPlanPreview({ health, power, classroomZoom = false, selectedClassroomId = "classroom-1", onSelectClassroom }: { health: Health; power: number | string; classroomZoom?: boolean; selectedClassroomId?: string; onSelectClassroom?: (id: string) => void }) {
  const watts = Math.max(0, num(power) ?? 0);
  const [sensorDetailsOpen, setSensorDetailsOpen] = useState(false);
  const selectedClassroom = FLOOR_ONE_CLASSROOMS.find(classroom => classroom.id === selectedClassroomId) ?? FLOOR_ONE_CLASSROOMS[0];
  const heatBand = watts <= 300 ? "low" : watts <= 1000 ? "medium" : "high";
  const heatColor = heatBand === "low" ? "#24a765" : heatBand === "medium" ? "#f0c42f" : "#ef8b32";
  const showHeat = health === "connected";
  const showHeatPreview = !showHeat;
  const healthLabel = health === "connected" ? "Online" : health === "delayed" ? "Delayed" : health === "offline" ? "Offline" : "Waiting for data";
  const pinDescription = `${DEVICE_ID} · Classroom · ${formatNumber(power, 1)} W · ${healthLabel}`;
  const viewBox = classroomZoom ? `${selectedClassroom.x - 110} ${selectedClassroom.y - 75} 220 150` : "0 300 1416 390";
  return <svg className="floor-plan-svg" viewBox={viewBox} role="group" aria-label="Floor 1 plan with interactive classroom sensor markers">
    <image className="floor-plan-raster" href={FLOOR_ONE_PLAN} x="0" y="0" width="1416" height="1000" preserveAspectRatio="none" />
    <defs>
      <clipPath id="classroom-heat-clip" clipPathUnits="userSpaceOnUse"><path d="M 947 559 L 1002 559 L 1002 654 L 929 654 L 929 585 Z" /></clipPath>
      <radialGradient id="plan-heat-zone-live"><stop offset="0%" stopColor={heatColor} stopOpacity="0.74" /><stop offset="58%" stopColor={heatColor} stopOpacity="0.38" /><stop offset="100%" stopColor={heatColor} stopOpacity="0" /></radialGradient>
    </defs>
    {showHeat && <ellipse className={`plan-heat-zone ${heatBand}`} clipPath="url(#classroom-heat-clip)" cx="952" cy="624" rx="60" ry="32" fill="url(#plan-heat-zone-live)" />}
    {showHeatPreview && <g className="plan-heat-zone preview" clipPath="url(#classroom-heat-clip)"><ellipse cx="952" cy="624" rx="92" ry="48" fill="#ef8b32" opacity="0.3" /><ellipse cx="952" cy="624" rx="66" ry="35" fill="#f0c42f" opacity="0.36" /><ellipse cx="952" cy="624" rx="38" ry="21" fill="#24a765" opacity="0.48" /></g>}
    <path className="classroom-heat-boundary" d="M 947 559 L 1002 559 L 1002 654 L 929 654 L 929 585 Z" />
    <g className={`plan-sensor-pin ${health}${sensorDetailsOpen ? " active" : ""}`} data-heat={heatBand} transform={`translate(952 624) scale(${classroomZoom ? 0.35 : 1})`} role="button" tabIndex={0} aria-label={pinDescription} aria-expanded={sensorDetailsOpen}
      onClick={() => { setSensorDetailsOpen(open => !open); onSelectClassroom?.("classroom-1"); }}
      onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSensorDetailsOpen(open => !open); onSelectClassroom?.("classroom-1"); } else if (event.key === "Escape") setSensorDetailsOpen(false); }}>
      <title>{pinDescription}</title><circle className="plan-pin-halo" r="28" /><circle className="plan-pin-ring" r="13" /><circle className="plan-pin-core" r="6" /><path className="plan-pin-leader" d="M12 -12 L39 -39" />
      <g className="plan-pin-label" transform="translate(39 -74)"><rect width="154" height="43" rx="8" /><circle cx="13" cy="15" r="4" /><text x="24" y="18" className="plan-pin-title">{DEVICE_ID}</text><text x="11" y="34" className="plan-pin-value">Classroom · {formatNumber(power, 1)} W</text></g>
    </g>
    {FLOOR_ONE_CLASSROOMS.filter(classroom => !classroom.connected).map(classroom => {
      const label = `${classroom.name} · No sensor connected yet`;
      const active = selectedClassroomId === classroom.id;
      return <g key={classroom.id} className={`plan-classroom-marker${active ? " active" : ""}`} transform={`translate(${classroom.x} ${classroom.y}) scale(${classroomZoom ? 0.35 : 1})`} role="button" tabIndex={0} aria-label={active ? `${label} · selected` : label}
        onClick={() => onSelectClassroom?.(classroom.id)}
        onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectClassroom?.(classroom.id); } }}>
        <title>{label}</title><circle className="classroom-marker-hit-area" r="34" /><circle className="classroom-marker-halo" r="25" /><circle className="classroom-marker-ring" r="12" /><circle className="classroom-marker-core" r="5" /><path className="classroom-marker-leader" d="M-12 -12 L-34 -34" />
        <g className="plan-classroom-label" transform="translate(-190 -70)"><rect width="168" height="46" rx="8" /><circle cx="14" cy="16" r="4" /><text x="25" y="19" className="plan-classroom-title">{classroom.name}</text><text x="11" y="36" className="plan-classroom-value">No sensor connected yet</text></g>
      </g>;
    })}
  </svg>;
}

function SensorForecastCard({ liveForecast }: { liveForecast: LivePowerForecast }) {
  const stateLabel = liveForecast.status === "ready" ? "RIVER MODEL ACTIVE"
    : liveForecast.status === "warming" ? "LEARNING FROM READINGS"
      : liveForecast.status === "stale" ? "WAITING FOR FRESH DATA"
        : liveForecast.status === "unconfigured" ? "RIVER SERVICE NOT CONFIGURED"
          : liveForecast.status === "error" ? "RIVER SERVICE UNAVAILABLE" : "CONNECTING TO RIVER";
  const stateNote = liveForecast.status === "ready"
    ? `River online regression has learned from ${liveForecast.samples.toLocaleString()} completed five-minute outcomes${liveForecast.maeW === null ? "." : ` · online MAE ${formatNumber(liveForecast.maeW, 2)} W.`}`
    : liveForecast.status === "warming"
      ? `River is learning from new readings. ${liveForecast.samples} five-minute outcomes learned; ${liveForecast.pendingSamples} forecast labels are still pending.${liveForecast.powerW === null ? ` A provisional forecast will appear after 6 outcomes; the model becomes active after ${liveForecast.minimumReadySamples}.` : ` A provisional forecast is shown while the model learns; it becomes active after ${liveForecast.minimumReadySamples} outcomes.`}`
      : liveForecast.status === "stale"
        ? `Forecast pauses until fresh PZEM data arrives${liveForecast.lastRecordedAt ? ` · last reading ${formatTime(liveForecast.lastRecordedAt, true)} IST` : ""}.`
        : liveForecast.status === "unconfigured"
          ? liveForecast.error ?? "Set VITE_RIVER_API_URL and run the River service to enable this forecast."
          : liveForecast.status === "error"
            ? liveForecast.error ?? "Could not reach the River forecast service."
            : "Connecting to the River online-learning service.";
  return <section className="card live-forecast-card">
    <div className="card-heading">
      <div><div className="heading-label"><span className="section-icon"><Activity /></span><h2>5-minute sensor forecast</h2></div><p>Online model River · learns from new readings</p></div>
      <span className={`forecast-state ${liveForecast.status}`}>{stateLabel}</span>
    </div>
    <div className="forecast-metrics">
      <article><span>Expected power in 5 min</span><b>{liveForecast.powerW === null ? "—" : `${formatNumber(liveForecast.powerW, 2)} W`}</b><small>{liveForecast.samples.toLocaleString()} outcomes learned</small></article>
      <article><span>Energy over next 5 min</span><b>{liveForecast.energyKwh === null ? "—" : `${formatNumber(liveForecast.energyKwh, 5)} kWh`}</b><small>Estimated from expected power</small></article>
      <article><span>Estimated CO₂e over next 5 min</span><b>{liveForecast.carbonKg === null ? "—" : `${formatNumber(liveForecast.carbonKg, 5)} kg`}</b><small>Uses {EMISSION_FACTOR.toFixed(2)} kg CO₂e/kWh</small></article>
    </div>
    <p className="forecast-note">{stateNote}</p>
  </section>;
}

export default function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const { profile, email, canAccessModule, signOut } = useAuthAccess();
  const canReadTelemetry = ["live", "insights", "costs", "device", "anomaly"].some(canAccessModule);
  const [mapFloor, setMapFloor] = useState<"ground" | "first">("first");
  const [classroomZoom, setClassroomZoom] = useState(false);
  const [selectedClassroomId, setSelectedClassroomId] = useState("classroom-1");
  const [navigationVersion, setNavigationVersion] = useState(0);
  const insightsVisited = useRef(false);
  const [metricPage, setMetricPage] = useState(0);
  const [dayStartReading, setDayStartReading] = useState<Pick<SensorReading, "recorded_at" | "energy_kwh"> | null>(null);
  const swipeStartX = useRef<number | null>(null);
  const [range, setRange] = useState<Range>("15m");
  const [insightStart, setInsightStart] = useState(() => toDateTimeLocal(new Date(Date.now() - 24 * 60 * 60_000)));
  const [insightEnd, setInsightEnd] = useState(() => toDateTimeLocal(new Date()));
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [latest, setLatest] = useState<SensorReading | null>(null);
  const [riverForecast, setRiverForecast] = useState<RiverForecast>(initialRiverForecast);
  const [serviceState, setServiceState] = useState<ServiceState>(supabaseConfigured ? "connecting" : "unconfigured");
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const syncPage = () => {
      setPage(pageFromHash());
      setNavigationVersion(version => version + 1);
    };
    window.addEventListener("hashchange", syncPage);
    window.addEventListener("popstate", syncPage);
    return () => {
      window.removeEventListener("hashchange", syncPage);
      window.removeEventListener("popstate", syncPage);
    };
  }, []);

  useEffect(() => {
    if (profile.role === "admin") return;
    const moduleByPage: Partial<Record<Page, string>> = {
      live: "live", device: "device", insights: "insights", costs: "costs", planning: "planning",
      anomaly: "anomaly", travel: "travel", goals: "goals", audit: "audit",
    };
    const requestedModule = moduleByPage[page];
    const fallbackPages: Page[] = ["live", "insights", "costs", "planning", "anomaly", "goals", "audit", "device", "travel"];
    if (requestedModule && canAccessModule(requestedModule)) return;
    const fallback = fallbackPages.find(candidate => canAccessModule(moduleByPage[candidate] || ""));
    if (fallback) {
      const hashes: Record<string, string> = { live: "#live-monitoring", device: "#device", insights: "#energy-insights", costs: "#cost-emissions", planning: "#bill-history", anomaly: "#anomaly-monitor", travel: "#know-your-carbon", goals: "#carbon-goals", audit: "#campus-audit" };
      window.history.replaceState(null, "", hashes[fallback]);
      setPage(fallback);
      setNavigationVersion(version => version + 1);
    }
  }, [page, profile.role, canAccessModule]);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [page, navigationVersion]);

  function navigate(event: MouseEvent<HTMLAnchorElement>, nextPage: Page, hash: string) {
    event.preventDefault();
    window.history.pushState(null, "", hash);
    setPage(nextPage);
    setNavigationVersion(version => version + 1);
    window.scrollTo(0, 0);
  }

  useEffect(() => {
    if (page === "insights" && !insightsVisited.current) {
      insightsVisited.current = true;
      setRange("24h");
    }
  }, [page]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);


  useEffect(() => {
    if (!supabaseConfigured || !canReadTelemetry) {
      if (!canReadTelemetry) setLoading(false);
      if (!supabaseConfigured) {
        setServiceState("unconfigured");
        setError("Add your Supabase project URL and publishable/anon key to .env.local.");
      }
      return;
    }
    let active = true;
    setLoading(true);
    setServiceState("connecting");
    setError("");
    const from = (page === "insights" || page === "costs") && Number.isFinite(new Date(insightStart).getTime())
      ? new Date(insightStart).toISOString()
      : new Date(Date.now() - RANGE_MS[range]).toISOString();
    Promise.all([fetchReadings(DEVICE_ID, from), fetchLatestReading(DEVICE_ID), fetchFirstReadingSince(DEVICE_ID, startOfToday())])
      .then(([history, last, dayFirst]) => {
        if (!active) return;
        setReadings(current => mergeRows(current, history));
        setLatest(current => !last || (current && timeMs(current) > timeMs(last)) ? current : last);
        setDayStartReading(dayFirst);
        setServiceState("ready");
      })
      .catch(reason => {
        if (!active) return;
        setServiceState("error");
        setError(reason instanceof Error ? reason.message : "Could not read sensor_readings from Supabase.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range, refreshKey, page, insightStart, canReadTelemetry]);

  useEffect(() => {
    if (!supabaseConfigured || !canReadTelemetry) return;
    let active = true;
    const subscription = subscribeToReadings(DEVICE_ID, incoming => {
      if (!active) return;
      setReadings(current => mergeRows(current, [incoming]));
      setLatest(current => !current || timeMs(incoming) >= timeMs(current) ? incoming : current);
      setDayStartReading(current => earliestTodayReading(current, incoming));
      setServiceState("ready");
      setError("");
    }, status => {
      if (!active) return;
      if (status === "SUBSCRIBED") { setRealtimeConnected(true); setServiceState("ready"); }
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setRealtimeConnected(false);
        setServiceState("error");
        setError("Supabase Realtime could not subscribe. Check that sensor_readings is in the Realtime publication and the read policy allows this device.");
      } else if (status === "CLOSED") setRealtimeConnected(false);
    });
    return () => {
      active = false;
      void subscription.client.removeChannel(subscription.channel);
    };
  }, [canReadTelemetry]);

  useEffect(() => {
    if (!canAccessModule("live")) return;
    let active = true;
    const pollForecast = async () => {
      try {
        const result = await fetchRiverForecast(DEVICE_ID);
        if (active) setRiverForecast(result);
      } catch (reason) {
        if (active) setRiverForecast(current => riverForecastError(current, reason));
      }
    };
    void pollForecast();
    const timer = window.setInterval(() => { void pollForecast(); }, 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refreshKey, canAccessModule]);

  // Keep the dashboard current even when the project's Realtime publication
  // is not enabled yet. This lightweight query only fetches the newest row.
  useEffect(() => {
    if (!supabaseConfigured || !canReadTelemetry) return;
    let active = true;
    const pollLatest = async () => {
      try {
        const incoming = await fetchLatestReading(DEVICE_ID);
        if (!active || !incoming) return;
        setLatest(current => !current || timeMs(incoming) >= timeMs(current) ? incoming : current);
        setDayStartReading(current => earliestTodayReading(current, incoming));
        setReadings(current => mergeRows(current, [incoming]));
        setServiceState(current => current === "error" ? "ready" : current);
        setError("");
      } catch (reason) {
        if (!active) return;
        setServiceState("error");
        setError(reason instanceof Error ? reason.message : "Could not refresh the latest sensor reading.");
      }
    };
    const timer = window.setInterval(() => { void pollLatest(); }, 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [canReadTelemetry]);

  const health = getHealth(latest, serviceState);
  const liveReading = health === "connected" ? latest : null;
  const selectedClassroom = FLOOR_ONE_CLASSROOMS.find(classroom => classroom.id === selectedClassroomId) ?? FLOOR_ONE_CLASSROOMS[0];
  const chartData = useMemo(() => {
    const cutoff = now - RANGE_MS[range];
    return readings.filter(row => timeMs(row) >= cutoff && timeMs(row) <= now + 1000)
      .sort((a, b) => timeMs(a) - timeMs(b))
      .map(row => {
        const power = num(row.power_w) ?? 0;
        return { recordedAt: row.recorded_at, timeMs: timeMs(row), power, energyKwh: num(row.energy_kwh), emissionRate: power / 1000 * EMISSION_FACTOR };
      });
  }, [readings, now, range]);
  const insightReadings = useMemo(() => {
    const start = new Date(insightStart).getTime();
    const end = new Date(insightEnd).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return [];
    return readings.filter(row => timeMs(row) >= start && timeMs(row) <= end)
      .sort((a, b) => timeMs(a) - timeMs(b))
      .map(row => {
        const power = num(row.power_w) ?? 0;
        return { recordedAt: row.recorded_at, timeMs: timeMs(row), power, energyKwh: num(row.energy_kwh), emissionRate: power / 1000 * EMISSION_FACTOR };
      });
  }, [readings, insightStart, insightEnd]);
  const insightStartMs = new Date(insightStart).getTime();
  const insightEndMs = new Date(insightEnd).getTime();
  const validInsightInterval = Number.isFinite(insightStartMs) && Number.isFinite(insightEndMs) && insightStartMs <= insightEndMs;
  const insightChartData = useMemo(() => {
    let cumulativeCarbon = 0;
    const hours = new Map<string, { hour: string; timeMs: number; carbon: number }>();
    const cumulative = insightReadings.map((point, index) => {
      if (index === 0) return { ...point, cumulativeCarbon };
      const previous = insightReadings[index - 1];
      const gap = point.timeMs - previous.timeMs;
      if (gap <= 0 || gap > 5 * 60_000) return { ...point, cumulativeCarbon };
      const intervalCarbon = ((previous.power + point.power) / 2 / 1000) * (gap / 3_600_000) * EMISSION_FACTOR;
      cumulativeCarbon += intervalCarbon;
      const parts = HOUR_KEY_FORMATTER.formatToParts(new Date(point.timeMs));
      const part = (type: string) => parts.find(value => value.type === type)?.value || "00";
      const key = `${part("year")}-${part("month")}-${part("day")}-${part("hour")}`;
      const label = HOUR_LABEL_FORMATTER.format(new Date(point.timeMs));
      const bucket = hours.get(key) || { hour: label, timeMs: point.timeMs, carbon: 0 };
      bucket.carbon += intervalCarbon;
      hours.set(key, bucket);
      return { ...point, cumulativeCarbon };
    });
    return { cumulative, hourly: [...hours.values()].sort((a, b) => a.timeMs - b.timeMs) };
  }, [insightReadings]);
  const todayCarbonHours = insightChartData.hourly.filter(hour => hour.timeMs >= Date.parse(startOfToday()));
  const todayCarbonInsight = todayCarbonHours.length ? todayCarbonHours.reduce((sum, hour) => sum + hour.carbon, 0) : null;
  const periodCarbonInsight = insightChartData.hourly.length ? insightChartData.hourly.reduce((sum, hour) => sum + hour.carbon, 0) : null;
  const tableRows = useMemo(() => [...readings].sort((a, b) => timeMs(b) - timeMs(a)).filter(row => !filter.trim() || [row.device_id, row.recorded_at, row.voltage_v, row.current_a, row.power_w, row.energy_kwh, row.frequency_hz, row.power_factor].join(" ").toLowerCase().includes(filter.trim().toLowerCase())).slice(0, 10), [readings, filter]);
  const liveForecast = useMemo(() => projectRiverForecast(riverForecast, EMISSION_FACTOR), [riverForecast]);
  const selectedPeriodReadings = page === "insights" || page === "costs" ? insightReadings : chartData;
  const firstEnergy = selectedPeriodReadings[0]?.energyKwh ?? null;
  const lastEnergy = selectedPeriodReadings.at(-1)?.energyKwh ?? null;
  const energyDelta = firstEnergy !== null && lastEnergy !== null && lastEnergy >= firstEnergy ? lastEnergy - firstEnergy : null;
  const energyDeltaReason = selectedPeriodReadings.length < 2 ? "Need two readings" : firstEnergy === null || lastEnergy === null ? "Meter energy unavailable" : lastEnergy < firstEnergy ? "Meter reset; delta unavailable" : `${formatNumber(energyDelta, 3)} kWh × factor`;
  const dayStartEnergy = num(dayStartReading?.energy_kwh);
  const currentEnergy = num(latest?.energy_kwh);
  const todayEnergyDelta = dayStartEnergy !== null && currentEnergy !== null && currentEnergy >= dayStartEnergy ? currentEnergy - dayStartEnergy : null;
  const carbonRate = liveReading ? (num(liveReading.power_w) ?? 0) / 1000 * EMISSION_FACTOR : 0;
  const todayCarbon = liveReading ? todayEnergyDelta === null ? null : todayEnergyDelta * EMISSION_FACTOR : 0;
  const selectedRangeCarbon = liveReading ? energyDelta === null ? null : energyDelta * EMISSION_FACTOR : 0;
  const lifetimeCarbon = liveReading ? (num(liveReading.energy_kwh) ?? 0) * EMISSION_FACTOR : 0;
  const fiveSecondCarbon = liveReading ? (num(liveReading.power_w) ?? 0) / 1000 * (5 / 3600) * EMISSION_FACTOR : 0;
  const peakEmissionRate = chartData.length ? Math.max(...chartData.map(point => point.emissionRate)) : null;
  const peakCarbonHour = insightChartData.hourly.reduce((peak, hour) => !peak || hour.carbon > peak.carbon ? hour : peak, null as (typeof insightChartData.hourly)[number] | null);
  const integratedPeriodKwh = periodCarbonInsight === null ? null : periodCarbonInsight / EMISSION_FACTOR;
  const estimatedPeriodKwh = energyDelta ?? integratedPeriodKwh;
  const costCalculationSource = energyDelta !== null ? "meter energy delta" : integratedPeriodKwh !== null ? "integrated power samples" : energyDeltaReason;
  const selectedEnergyCost = estimatedPeriodKwh === null ? null : estimatedPeriodKwh * ELECTRICITY_TARIFF;
  const selectedCarbonKg = estimatedPeriodKwh === null ? null : estimatedPeriodKwh * EMISSION_FACTOR;
  const selectedGreenTax = estimatedPeriodKwh === null ? null : estimatedPeriodKwh * GREEN_TAX_PER_KWH;
  const hourlyCostData = insightChartData.hourly.map(hour => {
    const kwh = hour.carbon / EMISSION_FACTOR;
    const energyCost = kwh * ELECTRICITY_TARIFF;
    const greenTaxCost = kwh * GREEN_TAX_PER_KWH;
    return { ...hour, energyCost, greenTaxCost };
  });

  const banner = (() => {
    if (!supabaseConfigured) return { title: "Supabase connection not configured", text: "Add your project URL and publishable/anon key in .env.local. The dashboard will then load stored readings and subscribe to new ones.", state: "NOT CONFIGURED" };
    if (serviceState === "error") return { title: "Supabase connection needs attention", text: error || "The dashboard could not read sensor data.", state: "CHECK SETUP" };
    if (!latest) return { title: realtimeConnected ? "Connected · waiting for sensor data" : "Loading readings from Supabase", text: realtimeConnected ? "Realtime is listening. The dashboard will update as ELEC-01 uploads new rows." : "The dashboard loads stored rows and checks for new readings every 5 seconds while Realtime connects.", state: realtimeConnected ? "LISTENING" : "CONNECTING" };
    if (health === "connected") return null;
    if (health === "delayed") return { title: "Sensor readings are delayed", text: `Last reading ${ago(now - timeMs(latest))}. Check ESP32 power, Wi-Fi and upload status.`, state: "DELAYED" };
    return { title: "No recent sensor data", text: `Last reading ${ago(now - timeMs(latest))}. The ESP32 may be offline or unable to upload.`, state: "OFFLINE" };
  })();

  const metrics = [
    { title: "Voltage", unit: "V", value: liveReading?.voltage_v ?? 0, digits: 1, icon: Bolt, tone: "green", context: "ELECTRICAL" },
    { title: "Current", unit: "A", value: liveReading?.current_a ?? 0, digits: 2, icon: Signal, tone: "blue", context: "ELECTRICAL" },
    { title: "Active power", unit: "W", value: liveReading?.power_w ?? 0, digits: 1, icon: Zap, tone: "amber", context: "INSTANTANEOUS" },
    { title: "Energy meter", unit: "kWh", value: liveReading?.energy_kwh ?? 0, digits: 3, icon: Activity, tone: "violet", context: "CUMULATIVE" },
    { title: "Frequency", unit: "Hz", value: liveReading?.frequency_hz ?? 0, digits: 2, icon: Activity, tone: "blue", context: "GRID" },
    { title: "Power factor", unit: "PF", value: liveReading?.power_factor ?? 0, digits: 2, icon: Check, tone: "green", context: "EFFICIENCY" },
  ];
  const carbonMetrics = [
    { title: "Carbon today", unit: "kg CO₂e", value: todayCarbon, digits: 3, icon: Leaf, tone: "green", context: "TODAY SO FAR" },
    { title: "Selected range", unit: "kg CO₂e", value: selectedRangeCarbon, digits: 4, icon: Activity, tone: "blue", context: "METER DELTA" },
    { title: "Cumulative footprint", unit: "kg CO₂e", value: lifetimeCarbon, digits: 3, icon: Leaf, tone: "violet", context: "METER TOTAL" },
    { title: "Emission rate", unit: "kg CO₂e/h", value: carbonRate, digits: 4, icon: Zap, tone: "amber", context: "AT CURRENT POWER" },
    { title: "Approx. per 5 sec", unit: "g CO₂e", value: fiveSecondCarbon * 1000, digits: 4, icon: Clock3, tone: "blue", context: "ESTIMATED INTERVAL" },
    { title: "Grid factor", unit: "kg CO₂e/kWh", value: EMISSION_FACTOR, digits: 2, icon: Check, tone: "green", context: "CONFIGURABLE ESTIMATE" },
  ];
  const primaryMetrics = [metrics[0], metrics[1], metrics[2], metrics[3], carbonMetrics[0], carbonMetrics[3]];
  const secondaryMetrics = [metrics[4], metrics[5], carbonMetrics[1], carbonMetrics[2], carbonMetrics[4], carbonMetrics[5]];

  const [travelOrigin, setTravelOrigin] = useState("Kothrud, Pune");
  const [travelDestination, setTravelDestination] = useState(DEFAULT_TRAVEL_DESTINATION);
  const [travelDistance, setTravelDistance] = useState(8.5);
  const [selectedTransportId, setSelectedTransportId] = useState("two-wheeler");
  const leafletContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapInstance = useRef<L.Map | null>(null);
  const routeLayerGroup = useRef<L.LayerGroup | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routeStatusMessage, setRouteStatusMessage] = useState("");
  const [routeDurationText, setRouteDurationText] = useState("~18 mins");
  const [routeDistanceText, setRouteDistanceText] = useState("8.5 km");

  const selectedMode = useMemo(() => TRANSPORT_MODES.find(m => m.id === selectedTransportId) || TRANSPORT_MODES[1], [selectedTransportId]);

  // Baseline Car commute (for direct comparison vs Car)
  const carMode = TRANSPORT_MODES[0];
  const carOneWayCarbon = travelDistance * carMode.factorKgPerKm;
  const carDailyCarbon = 2 * carOneWayCarbon;
  const carAnnualCarbon = 220 * carDailyCarbon;
  const carTripCostINR = travelDistance * carMode.costPerKmINR;

  const oneWayCarbon = travelDistance * selectedMode.factorKgPerKm;
  const dailyCommuteCarbon = 2 * oneWayCarbon;
  const monthlyCommuteCarbon = 22 * dailyCommuteCarbon;
  const annualCommuteCarbon = 220 * dailyCommuteCarbon;
  const annualCommuteCost = 220 * (2 * travelDistance * selectedMode.costPerKmINR);
  const costPerTrip = travelDistance * selectedMode.costPerKmINR;
  const treesNeededToOffset = annualCommuteCarbon / 21.77;

  // Comparison metrics vs Car
  const isCarSelected = selectedMode.id === "petrol-car" || selectedMode.id === "diesel-car";
  const savingsVsCarTripKg = Math.max(0, carOneWayCarbon - oneWayCarbon);
  const reductionVsCarPercent = carOneWayCarbon > 0 ? Math.round(((carOneWayCarbon - oneWayCarbon) / carOneWayCarbon) * 100) : 0;
  const annualSavingsVsCarKg = Math.max(0, carAnnualCarbon - annualCommuteCarbon);
  const treesSavedVsCar = annualSavingsVsCarKg / 21.77;
  const costSavingsVsCarTripINR = Math.max(0, carTripCostINR - costPerTrip);

  const getModeDuration = (mode: TransportMode, distanceKm: number) => {
    if (distanceKm <= 0) return "0 min";
    if (mode.id === "petrol-car" && routeDurationText && !routeDurationText.includes("~")) {
      return routeDurationText;
    }
    const speed = mode.avgSpeedKmH || 30;
    const minutes = Math.max(1, Math.round((distanceKm / speed) * 60));
    if (minutes < 60) return `${minutes} mins`;
    const hrs = Math.floor(minutes / 60);
    const remMins = minutes % 60;
    return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs} hr`;
  };

  const modeComparisonData = useMemo(() => {
    return TRANSPORT_MODES.slice(0, 7).map(mode => {
      const annualCarbon = Number((220 * 2 * travelDistance * mode.factorKgPerKm).toFixed(2));
      const oneWay = Number((travelDistance * mode.factorKgPerKm).toFixed(3));
      const isSelected = mode.id === selectedTransportId;
      return {
        name: mode.shortName,
        fullName: mode.name,
        annualCarbon,
        oneWayCarbon: oneWay,
        isSelected,
        fill: isSelected
          ? mode.factorKgPerKm === 0
            ? "#10b981"
            : mode.factorKgPerKm >= 0.15
            ? "#e11d48"
            : "#15803d"
          : mode.factorKgPerKm >= 0.15
          ? "#fca5a5"
          : mode.factorKgPerKm === 0
          ? "#6ee7b7"
          : "#86efac",
      };
    });
  }, [travelDistance, selectedTransportId]);

  // CARBON GOALS (COLLEGE USAGES & ELECTRICITY TARGETS)
  const [goalTimeframe, setGoalTimeframe] = useState<"monthly" | "annual">("monthly");
  const [goalTargetPct, setGoalTargetPct] = useState<number>(10); // Example: Reduce campus electricity emissions by 10%
  const [monthlyBaselineKg, setMonthlyBaselineKg] = useState<number>(1250);
  const [annualBaselineKg, setAnnualBaselineKg] = useState<number>(15000);
  const [activeLevers, setActiveLevers] = useState<string[]>(["smart-lab-sleep", "hvac-opt"]);

  const currentBaselineKg = goalTimeframe === "monthly" ? monthlyBaselineKg : annualBaselineKg;
  const targetReductionKg = currentBaselineKg * (goalTargetPct / 100);
  const targetCapKg = Math.max(0, currentBaselineKg - targetReductionKg);
  const targetSavedKwh = targetReductionKg / EMISSION_FACTOR;
  const targetSavedINR = targetSavedKwh * ELECTRICITY_TARIFF;
  const targetTreesOffset = targetReductionKg / 21.77;

  // Progress pacing across period
  const daysInPeriod = goalTimeframe === "monthly" ? 30 : 220;
  const dayOfPeriod = goalTimeframe === "monthly" ? Math.max(1, new Date().getDate()) : 85;
  const timeElapsedPct = Math.min(100, Math.round((dayOfPeriod / daysInPeriod) * 100));

  // Current campus emissions so far in period
  const currentEmittedKg = useMemo(() => {
    if (goalTimeframe === "monthly") {
      const baseExpectedSoFar = currentBaselineKg * (dayOfPeriod / daysInPeriod);
      const meterAdd = (todayCarbon ?? 0.8) * 6;
      return Math.round((baseExpectedSoFar * 0.90 + meterAdd * 0.08) * 10) / 10;
    } else {
      return Math.round((currentBaselineKg * (dayOfPeriod / daysInPeriod) * 0.89) * 10) / 10;
    }
  }, [goalTimeframe, currentBaselineKg, dayOfPeriod, daysInPeriod, todayCarbon]);

  const remainingBudgetKg = Math.max(0, targetCapKg - currentEmittedKg);
  const budgetUsedPct = Math.min(100, Math.round((currentEmittedKg / (targetCapKg || 1)) * 100));
  const isPacingUnderCap = currentEmittedKg <= (targetCapKg * (dayOfPeriod / daysInPeriod) * 1.05);

  // Levers calculation
  const totalLeverReductionPct = useMemo(() => {
    return Number(
      CAMPUS_LEVERS.filter(l => activeLevers.includes(l.id))
        .reduce((sum, l) => sum + l.reductionPct, 0)
        .toFixed(1)
    );
  }, [activeLevers]);

  const toggleLever = (id: string) => {
    setActiveLevers(current =>
      current.includes(id) ? current.filter(x => x !== id) : [...current, id]
    );
  };

  // Sync baseline with monitored meter
  const syncBaselineWithMeter = () => {
    const meterEnergy = num(latest?.energy_kwh) ?? 1520;
    const estimatedMonthly = Math.round(meterEnergy * EMISSION_FACTOR * 1.05);
    setMonthlyBaselineKg(Math.max(100, estimatedMonthly));
    setAnnualBaselineKg(Math.max(1000, estimatedMonthly * 12));
  };

  // Sector breakdown of college electricity usages
  const sectorData = useMemo(() => {
    const base = currentBaselineKg;
    const target = targetCapKg;
    const current = currentEmittedKg;
    return [
      {
        id: "labs",
        name: "Computer Labs & Server Room",
        sharePct: 36,
        baselineKg: Math.round(base * 0.36),
        targetKg: Math.round(target * 0.36),
        currentKg: Math.round(current * 0.35),
        icon: Cpu,
        tips: "Workstation auto-sleep & server room thermal setpoint (22°C → 24°C)",
        status: "Optimal (-12%)",
        color: "#25a072",
      },
      {
        id: "classrooms",
        name: "Lecture Halls & Classrooms",
        sharePct: 24,
        baselineKg: Math.round(base * 0.24),
        targetKg: Math.round(target * 0.24),
        currentKg: Math.round(current * 0.23),
        icon: Lightbulb,
        tips: "Occupancy sensor cutoff for smartboards, projectors & split AC units",
        status: "On Track (-10%)",
        color: "#168459",
      },
      {
        id: "workshops",
        name: "Engineering Workshops",
        sharePct: 22,
        baselineKg: Math.round(base * 0.22),
        targetKg: Math.round(target * 0.22),
        currentKg: Math.round(current * 0.24),
        icon: Activity,
        tips: "Staggered CNC machine startup and off-peak heavy machining schedule",
        status: "Near Target (-6%)",
        color: "#d97706",
      },
      {
        id: "facilities",
        name: "Campus Quad, Library & Hostels",
        sharePct: 18,
        baselineKg: Math.round(base * 0.18),
        targetKg: Math.round(target * 0.18),
        currentKg: Math.round(current * 0.18),
        icon: Leaf,
        tips: "Solar corridor lighting & variable speed pumping timers",
        status: "Optimal (-11%)",
        color: "#25a072",
      },
    ];
  }, [currentBaselineKg, targetCapKg, currentEmittedKg]);

  // Monthly tracking chart comparing actual vs target cap
  const goalsChartData = useMemo(() => {
    const monthlyTarget = Math.round(monthlyBaselineKg * (1 - goalTargetPct / 100));
    const monthlyBase = monthlyBaselineKg;
    return [
      { month: "Jun", baseline: monthlyBase, target: monthlyTarget, actual: 1220 },
      { month: "Jul", baseline: monthlyBase, target: monthlyTarget, actual: 1195 },
      { month: "Aug", baseline: monthlyBase, target: monthlyTarget, actual: 1140 },
      { month: "Sep", baseline: monthlyBase, target: monthlyTarget, actual: 1115 },
      { month: "Oct (Now)", baseline: monthlyBase, target: monthlyTarget, actual: Math.round(currentEmittedKg * (goalTimeframe === "monthly" ? Math.max(1, 30 / dayOfPeriod) : 1) * 0.95) },
      { month: "Nov (Proj)", baseline: monthlyBase, target: monthlyTarget, actual: Math.round(monthlyTarget * 0.97) },
      { month: "Dec (Proj)", baseline: monthlyBase, target: monthlyTarget, actual: Math.round(monthlyTarget * 0.94) },
    ];
  }, [monthlyBaselineKg, goalTargetPct, currentEmittedKg, goalTimeframe, dayOfPeriod]);

  // CAMPUS AUDIT STATE & PERSISTENCE
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>(() => {
    try {
      const saved = localStorage.getItem("carbengine_audit_records_v1");
      if (saved) {
        const parsed: AuditRecord[] = JSON.parse(saved);
        // Exclude legacy mock static items
        return parsed.filter(r => !["rec-elec-01", "rec-wtr-01", "rec-wst-01", "rec-wst-02", "rec-rcy-01"].includes(r.id));
      }
    } catch (e) {
      console.warn("Could not load audit records:", e);
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem("carbengine_audit_records_v1", JSON.stringify(auditRecords));
    } catch (e) {
      console.warn("Could not save audit records:", e);
    }
  }, [auditRecords]);

  // Totals calculated from uploaded audit records
  const auditTotals = useMemo(() => {
    let electricityKg = 0;
    let electricityKwh = 0;
    let waterKg = 0;
    let waterKl = 0;
    let wasteKg = 0;
    let wasteTotalMass = 0;
    let recyclingCreditKg = 0;
    let totalCostINR = 0;

    for (const rec of auditRecords) {
      totalCostINR += rec.costINR || 0;
      if (rec.category === "electricity") {
        electricityKg += rec.carbonEmissionsKg;
        electricityKwh += rec.quantity;
      } else if (rec.category === "water") {
        waterKg += rec.carbonEmissionsKg;
        waterKl += rec.quantity;
      } else if (rec.category === "waste") {
        wasteKg += rec.carbonEmissionsKg;
        wasteTotalMass += rec.quantity;
      } else if (rec.category === "recycling") {
        recyclingCreditKg += rec.carbonEmissionsKg;
      }
    }

    const netCarbonKg = Math.max(0, electricityKg + waterKg + wasteKg + recyclingCreditKg);
    const netCarbonTons = netCarbonKg / 1000;
    const verifiedCount = auditRecords.filter(r => r.status === "verified" || r.status === "audited").length;

    return {
      netCarbonKg: Number(netCarbonKg.toFixed(1)),
      netCarbonTons: Number(netCarbonTons.toFixed(3)),
      electricityKg: Number(electricityKg.toFixed(1)),
      electricityKwh: Number(electricityKwh.toFixed(1)),
      waterKg: Number(waterKg.toFixed(1)),
      waterKl: Number(waterKl.toFixed(1)),
      wasteKg: Number(wasteKg.toFixed(1)),
      wasteTotalMass: Number(wasteTotalMass.toFixed(1)),
      recyclingCreditKg: Number(recyclingCreditKg.toFixed(1)),
      totalCostINR: Math.round(totalCostINR),
      verifiedCount,
      totalRecords: auditRecords.length,
    };
  }, [auditRecords]);

  // Form states for Upload & Bill Addition
  const [uploadCategory, setUploadCategory] = useState<AuditCategory>("electricity");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadInvoiceNo, setUploadInvoiceNo] = useState("");
  const [uploadBillingPeriod, setUploadBillingPeriod] = useState("October 2026");
  const [uploadDate, setUploadDate] = useState("2026-10-11");
  const [uploadQuantity, setUploadQuantity] = useState<number | "">("");
  const [uploadCostINR, setUploadCostINR] = useState<number | "">("");
  const [uploadVendor, setUploadVendor] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadFile, setUploadFile] = useState<{ name: string; size: string; type: string } | null>(null);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [auditCategoryFilter, setAuditCategoryFilter] = useState<"all" | AuditCategory>("all");
  const [auditSearchQuery, setAuditSearchQuery] = useState("");

  const currentActiveFactor = useMemo(() => {
    if (uploadCategory === "electricity") return PREDEFINED_EMISSION_FACTORS.electricityKwh;
    if (uploadCategory === "water") return PREDEFINED_EMISSION_FACTORS.waterKl;
    if (uploadCategory === "recycling") return PREDEFINED_EMISSION_FACTORS.recyclingKg;
    return PREDEFINED_EMISSION_FACTORS.wasteKg;
  }, [uploadCategory]);

  const currentQuantityUnit = useMemo(() => {
    if (uploadCategory === "electricity") return "kWh";
    if (uploadCategory === "water") return "kL";
    return "kg";
  }, [uploadCategory]);

  const currentCalculatedEmissions = useMemo(() => {
    const qty = typeof uploadQuantity === "number" ? uploadQuantity : parseFloat(String(uploadQuantity)) || 0;
    return Number((qty * currentActiveFactor).toFixed(2));
  }, [uploadQuantity, currentActiveFactor]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      const sizeDisplay = Number(sizeMb) < 0.1 ? `${Math.round(file.size / 1024)} KB` : `${sizeMb} MB`;
      setUploadFile({
        name: file.name,
        size: sizeDisplay,
        type: file.type || "application/pdf",
      });
      if (!uploadTitle) {
        const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
        setUploadTitle(cleanName);
      }
    }
  };

  const handleAddAuditRecord = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = typeof uploadQuantity === "number" ? uploadQuantity : parseFloat(String(uploadQuantity)) || 0;
    if (qty <= 0) {
      alert("Please enter a valid consumption / usage quantity greater than 0.");
      return;
    }
    const factor = currentActiveFactor;
    const calculatedKg = Number((qty * factor).toFixed(2));
    const newRec: AuditRecord = {
      id: `rec-${Date.now()}`,
      category: uploadCategory,
      title: uploadTitle.trim() || `${uploadCategory.toUpperCase()} Utility Bill - ${uploadBillingPeriod}`,
      invoiceNo: uploadInvoiceNo.trim() || `AUDIT-${Math.floor(1000 + Math.random() * 9000)}`,
      billingPeriod: uploadBillingPeriod,
      date: uploadDate || new Date().toISOString().split("T")[0],
      quantity: qty,
      unit: currentQuantityUnit,
      emissionFactor: factor,
      carbonEmissionsKg: calculatedKg,
      costINR: typeof uploadCostINR === "number" ? uploadCostINR : parseFloat(String(uploadCostINR)) || 0,
      vendorOrFacility: uploadVendor.trim() || (uploadCategory === "electricity" ? "State Electricity Board" : uploadCategory === "water" ? "Municipal Water Supply" : "Campus Solid Waste Services"),
      documentName: uploadFile?.name || `${uploadCategory}_bill_${Date.now()}.pdf`,
      documentSize: uploadFile?.size || "1.2 MB",
      status: "verified",
      auditorNotes: uploadNotes.trim() || "Uploaded by campus auditor; reconciled with utility manifest.",
      uploadedAt: Date.now(),
    };

    setAuditRecords(prev => [newRec, ...prev]);
    setUploadSuccessMsg(`✓ Uploaded "${newRec.title}"! Calculated ${calculatedKg >= 0 ? "+" : ""}${calculatedKg} kg CO₂e automatically synced to Campus Audit & Live Monitoring.`);
    
    // Reset form fields
    setUploadTitle("");
    setUploadInvoiceNo("");
    setUploadQuantity("");
    setUploadCostINR("");
    setUploadVendor("");
    setUploadNotes("");
    setUploadFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    setTimeout(() => setUploadSuccessMsg(""), 9000);
  };

  const handleDeleteAuditRecord = (id: string) => {
    if (confirm("Delete this audit record? Its calculated emissions will be removed from Live Monitoring.")) {
      setAuditRecords(prev => prev.filter(r => r.id !== id));
    }
  };

  const exportAuditCSV = () => {
    const headers = ["Invoice_Ref", "Category", "Title", "Billing_Period", "Date", "Quantity", "Unit", "Emission_Factor_kg_per_unit", "Carbon_Emissions_kg_CO2e", "Cost_INR", "Vendor_Facility", "Document", "Status"];
    const rows = auditRecords.map(r => [
      `"${r.invoiceNo}"`,
      `"${r.category}"`,
      `"${r.title}"`,
      `"${r.billingPeriod}"`,
      `"${r.date}"`,
      r.quantity,
      `"${r.unit}"`,
      r.emissionFactor,
      r.carbonEmissionsKg,
      r.costINR,
      `"${r.vendorOrFacility}"`,
      `"${r.documentName || "N/A"}"`,
      `"${r.status}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `campus_sustainability_audit_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredAuditRecords = useMemo(() => {
    return auditRecords.filter(r => {
      const matchCat = auditCategoryFilter === "all" || r.category === auditCategoryFilter;
      const matchQuery = !auditSearchQuery.trim() ||
        r.title.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
        r.invoiceNo.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
        r.vendorOrFacility.toLowerCase().includes(auditSearchQuery.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [auditRecords, auditCategoryFilter, auditSearchQuery]);

  // Initialize Leaflet map with OpenStreetMap tiles when on travel page
  useEffect(() => {
    if (page !== "travel") {
      if (leafletMapInstance.current) {
        leafletMapInstance.current.remove();
        leafletMapInstance.current = null;
        routeLayerGroup.current = null;
      }
      return;
    }

    if (!leafletContainerRef.current) return;

    if (!leafletMapInstance.current) {
      const map = L.map(leafletContainerRef.current, {
        center: [18.5204, 73.8567],
        zoom: 12,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      routeLayerGroup.current = L.layerGroup().addTo(map);
      leafletMapInstance.current = map;

      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    }

    return () => {
      if (leafletMapInstance.current) {
        leafletMapInstance.current.remove();
        leafletMapInstance.current = null;
        routeLayerGroup.current = null;
      }
    };
  }, [page]);

  // Fallback distance calculator for quick presets
  const estimateLocationDistance = (origin: string, dest: string): number => {
    const o = origin.toLowerCase();
    const d = dest.toLowerCase();
    if ((o.includes("kothrud") && d.includes("coep")) || (d.includes("kothrud") && o.includes("coep"))) return 8.5;
    if (o.includes("katraj") || d.includes("katraj")) return 14.2;
    if (o.includes("baner") || d.includes("baner")) return 11.5;
    if (o.includes("wakad") || d.includes("wakad") || o.includes("hinjewadi") || d.includes("hinjewadi")) return 18.5;
    if (o.includes("viman") || d.includes("viman") || o.includes("nagar") || d.includes("nagar")) return 12.0;
    if (o.includes("swargate") || d.includes("swargate")) return 4.5;
    if (o.includes("hostel") || d.includes("hostel") || o.includes("campus") || d.includes("campus")) return 3.5;
    return travelDistance || 8.5;
  };

  // Real route calculation via OpenStreetMap Nominatim Geocoding + OSRM Routing Machine
  const calculateOsrmRoute = async (originStr: string, destStr: string) => {
    if (!originStr.trim() || !destStr.trim()) return;
    setIsCalculatingRoute(true);
    setRouteStatusMessage("Geocoding locations on OpenStreetMap...");

    try {
      const geocodeLocation = async (query: string): Promise<[number, number]> => {
        const normalizedQuery = query.toLocaleLowerCase();
        if (
          normalizedQuery.includes("vidyalankar institute of technology") ||
          normalizedQuery.includes("vidyalankar campus")
        ) {
          // Use the mapped campus point because Nominatim does not consistently match the full address wording.
          return VIT_CAMPUS_COORDINATES;
        }

        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
          { headers: { Accept: "application/json" } }
        );
        const results = await response.json();
        if (!results || results.length === 0) {
          throw new Error(`Location "${query}" not found. Try adding a city or area name.`);
        }
        return [parseFloat(results[0].lat), parseFloat(results[0].lon)];
      };

      // 1. Geocode Origin
      const [startLat, startLon] = await geocodeLocation(originStr);

      // 2. Geocode Destination
      setRouteStatusMessage("Locating destination on OpenStreetMap...");
      const [endLat, endLon] = await geocodeLocation(destStr);

      // 3. Query OSRM Routing Machine
      setRouteStatusMessage("Calculating route via OSRM...");
      const osrmRes = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=full&geometries=geojson`
      );
      const osrmData = await osrmRes.json();

      if (osrmData.code !== "Ok" || !osrmData.routes || osrmData.routes.length === 0) {
        throw new Error("No driving route found between these locations via OSRM.");
      }

      const route = osrmData.routes[0];
      const distKm = parseFloat((route.distance / 1000).toFixed(2));
      const durationMin = Math.round(route.duration / 60);
      const durationStr = durationMin < 60 ? `${durationMin} mins` : `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`;

      setTravelDistance(distKm);
      setRouteDistanceText(`${distKm} km`);
      setRouteDurationText(durationStr);
      setRouteStatusMessage("");

      // 4. Update Leaflet map layers
      if (leafletMapInstance.current && routeLayerGroup.current) {
        routeLayerGroup.current.clearLayers();

        const startIcon = L.divIcon({
          className: "custom-osm-pin",
          html: `<div style="background:#25a072;color:#fff;font-weight:700;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,0.35);border:2px solid #fff;font-size:11px;">A</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const endIcon = L.divIcon({
          className: "custom-osm-pin",
          html: `<div style="background:#e66a5e;color:#fff;font-weight:700;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,0.35);border:2px solid #fff;font-size:11px;">B</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const startMarker = L.marker([startLat, startLon], { icon: startIcon }).bindPopup(`<b>Start Location:</b><br/>${originStr}`);
        const endMarker = L.marker([endLat, endLon], { icon: endIcon }).bindPopup(`<b>Destination:</b><br/>${destStr}`);
        routeLayerGroup.current.addLayer(startMarker);
        routeLayerGroup.current.addLayer(endMarker);

        const latLngs = route.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]] as [number, number]);
        const polyline = L.polyline(latLngs, {
          color: "#168459",
          weight: 5,
          opacity: 0.9,
          lineJoin: "round",
        });
        routeLayerGroup.current.addLayer(polyline);

        leafletMapInstance.current.fitBounds(polyline.getBounds(), { padding: [35, 35] });
      }
    } catch (err: any) {
      console.warn("OSRM error, using fallback distance:", err);
      const estKm = estimateLocationDistance(originStr, destStr);
      setTravelDistance(estKm);
      setRouteDistanceText(`${estKm} km (Est.)`);
      setRouteDurationText(`~${Math.round((estKm / (selectedMode.avgSpeedKmH || 30)) * 60)} mins`);
      setRouteStatusMessage(err.message || "Using estimated route distance.");
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  useEffect(() => {
    if (page === "travel" && travelOrigin && travelDestination) {
      const timer = setTimeout(() => {
        calculateOsrmRoute(travelOrigin, travelDestination);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [travelOrigin, travelDestination, page]);

  const pageHeading = page === "device"
    ? { title: "Device", description: "Connection health and latest measurements from your ESP32 meter." }
    : page === "insights"
    ? { title: "Energy & Carbon Analytics", description: "Explore your estimated carbon footprint, emissions trends, and energy use." }
    : page === "costs"
    ? { title: "Cost & Green Tax", description: "Track electricity charges and the estimated green tax on your carbon footprint." }
    : page === "planning"
    ? { title: "Bill History & Forecast", description: "Review college electricity bills and short-term campus energy forecasts." }
    : page === "anomaly"
    ? { title: "Campus Anomaly Monitor", description: "View live campus electricity status and the mapped sensor location." }
    : page === "goals"
    ? { title: "Carbon Reduction Goals", description: "Set monthly or annual campus electricity reduction targets and track progress toward them." }
    : page === "audit"
    ? { title: "Campus Sustainability Audit", description: "Maintain electricity bills, water bills, garbage logs, predefined emission factors, and verified documents for sustainability audits." }
    : page === "travel"
    ? { title: "Know Your Carbon", description: "Identify and calculate the carbon footprint burned by students traveling to college." }
    : page === "user-management"
    ? { title: "User Management", description: "Manage CARBengine user roles and active access." }
    : page === "tab-permissions"
    ? { title: "Tab Permissions", description: "Control which dashboard tabs each role can access." }
    : { title: "Live Monitoring", description: "Live electrical measurements from your ESP32 and PZEM-004T." };
  const isAdministrationPage = page === "user-management" || page === "tab-permissions";

  const pageModule: Partial<Record<Page, string>> = {
    live: "live", device: "device", insights: "insights", costs: "costs", planning: "planning",
    anomaly: "anomaly", travel: "travel", goals: "goals", audit: "audit",
  };
  if (profile.role !== "admin" && pageModule[page] && !canAccessModule(pageModule[page]!)) {
    return <main className="auth-screen"><section className="auth-card auth-status-card"><h1>No dashboard tabs assigned</h1><p className="auth-subtitle">Ask your CARBengine administrator to grant access to at least one module.</p><button className="auth-secondary-button" onClick={() => void signOut()}><LogOut />Sign out</button></section></main>;
  }
  if (profile.role !== "admin" && (page === "user-management" || page === "tab-permissions")) {
    return <main className="auth-screen"><section className="auth-card auth-status-card"><h1>Administrator access required</h1><p className="auth-subtitle">This section is available to administrators only.</p><button className="auth-secondary-button" onClick={() => void signOut()}><LogOut />Sign out</button></section></main>;
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#top" onClick={event => navigate(event, page, "#top")}><span className="brand-mark"><Leaf /></span><span><b>CARB</b>engine</span></a>
      <div className="nav-caption">MONITORING</div>
      <nav className="navigation" aria-label="Monitoring navigation">
        {canAccessModule("travel") && <a className={`nav-link ${page === "travel" ? "active" : ""}`} href="#know-your-carbon" onClick={event => navigate(event, "travel", "#know-your-carbon")}><Navigation /><span>Know Your Carbon</span></a>}
        {canAccessModule("live") && <a className={`nav-link ${page === "live" ? "active" : ""}`} href="#live-monitoring" onClick={event => navigate(event, "live", "#live-monitoring")}><Activity /><span>Live Monitoring</span></a>}
        {canAccessModule("insights") && <a className={`nav-link ${page === "insights" ? "active" : ""}`} href="#energy-insights" onClick={event => navigate(event, "insights", "#energy-insights")}><Lightbulb /><span>Energy &amp; Carbon Analytics</span></a>}
        {canAccessModule("costs") && <a className={`nav-link ${page === "costs" ? "active" : ""}`} href="#cost-emissions" onClick={event => navigate(event, "costs", "#cost-emissions")}><Wallet /><span>Cost &amp; Green Tax</span></a>}
        {canAccessModule("planning") && <a className={`nav-link ${page === "planning" ? "active" : ""}`} href="#bill-history" onClick={event => navigate(event, "planning", "#bill-history")}><Lightbulb /><span>Bill History &amp; Forecast</span></a>}
        {canAccessModule("anomaly") && <a className={`nav-link ${page === "anomaly" ? "active" : ""}`} href="#anomaly-monitor" onClick={event => navigate(event, "anomaly", "#anomaly-monitor")}><MapIcon /><span>Anomaly Monitor</span></a>}
        {canAccessModule("goals") && <a className={`nav-link ${page === "goals" ? "active" : ""}`} href="#carbon-goals" onClick={event => navigate(event, "goals", "#carbon-goals")}><Target /><span>Carbon Goals</span></a>}
        {canAccessModule("audit") && <a className={`nav-link ${page === "audit" ? "active" : ""}`} href="#campus-audit" onClick={event => navigate(event, "audit", "#campus-audit")}><ClipboardCheck /><span>Campus Audit</span></a>}
        {canAccessModule("device") && <a className={`nav-link ${page === "device" ? "active" : ""}`} href="#device" onClick={event => navigate(event, "device", "#device")}><Cpu /><span>Device</span></a>}
      </nav>
      {profile.role === "admin" && <><div className="nav-caption admin-nav-caption">ADMINISTRATION</div><nav className="navigation" aria-label="Administration navigation"><a className={`nav-link ${page === "user-management" ? "active" : ""}`} href="#user-management" onClick={event => navigate(event, "user-management", "#user-management")}><ShieldCheck /><span>User Management</span></a><a className={`nav-link ${page === "tab-permissions" ? "active" : ""}`} href="#tab-permissions" onClick={event => navigate(event, "tab-permissions", "#tab-permissions")}><Sliders /><span>Tab Permissions</span></a></nav></>}
      <div className="sidebar-status"><span className={`status-ring ${health}`} /><span><b>{health === "connected" ? "Receiving readings" : health === "delayed" ? "Readings delayed" : health === "offline" ? "Device offline" : "Waiting for data"}</b><small>{DEVICE_ID}</small></span></div>
      <div className="sidebar-footer"><div className="leaf-art"><Leaf /></div><b>CARBengine</b><span>Monitor · Predict · Reduce</span></div>
    </aside>

    <main className="main-content" id="top" data-page={page}>
      <header className="topbar"><div className="breadcrumb">CARBengine <span>/</span> <b>{pageHeading.title}</b></div><div className="top-actions"><span className="auth-user-chip" title={email}>{email} · {profile.role}</span>{!isAdministrationPage && <span className="last-updated">{latest ? `Updated ${ago(now - timeMs(latest))}` : realtimeConnected ? "Realtime connected · awaiting data" : "Waiting for first reading"}</span>}{pageModule[page] && <button className="icon-button" onClick={() => setRefreshKey(key => key + 1)} title="Refresh readings" aria-label="Refresh readings"><RefreshCw /></button>}<button className="sign-out-button" onClick={() => void signOut()} title="Sign out"><LogOut /><span>Sign out</span></button></div></header>
      <div className="content page-transition" key={`${page}-${navigationVersion}`}>
        <section className="heading-row" id={page === "insights" ? "energy-insights" : page === "device" ? "device" : page === "costs" ? "cost-emissions" : page === "planning" ? "energy-planning" : page === "anomaly" ? "anomaly-monitor" : page === "goals" ? "carbon-goals" : page === "audit" ? "campus-audit" : page === "travel" ? "know-your-carbon" : page === "user-management" ? "user-management" : page === "tab-permissions" ? "tab-permissions" : "live-monitoring"}><div><div className="eyebrow"><span className="eyebrow-mark" /> {page === "travel" ? "STUDENT TRAVEL FOOTPRINT" : page === "goals" ? "CAMPUS ELECTRICITY TARGETS" : page === "audit" ? "CAMPUS SUSTAINABILITY AUDIT & UTILITY BILLS" : page === "planning" ? "COLLEGE UTILITY BILLS" : page === "anomaly" ? "CAMPUS · INITIAL SENSOR SETUP" : page === "user-management" || page === "tab-permissions" ? "ADMINISTRATION" : "ELECTRICAL MONITORING"}</div><h1>{pageHeading.title}</h1><p className="page-description">{pageHeading.description}</p></div>{page === "anomaly" ? <div className="anomaly-selectors"><label><small>CAMPUS</small><select value="vit" disabled aria-label="Campus"><option value="vit">Vidyalankar Institute of Technology</option></select></label><label><small>FLOOR</small><select value={mapFloor} onChange={event => setMapFloor(event.target.value as "ground" | "first")} aria-label="Floor"><option value="ground">Ground Floor</option><option value="first">Floor 1</option></select></label></div> : page !== "planning" && page !== "user-management" && page !== "tab-permissions" && <div className="device-picker"><span className="picker-icon"><Cpu /></span><span className="device-picker-copy"><small>MONITORED DEVICE</small><b>{DEVICE_ID}</b></span><ChevronDown className="picker-chevron" /></div>}</section>

        {page === "user-management" && <UserManagementPanel />}
        {page === "tab-permissions" && <TabPermissionsPanel />}

        {banner && !isAdministrationPage && <section className={`connection-banner ${health === "connected" ? "connected" : health === "offline" ? "offline" : "waiting"}`} aria-live="polite"><span className="connection-icon">{health === "connected" ? <Wifi /> : health === "offline" ? <WifiOff /> : serviceState === "error" ? <AlertTriangle /> : <CloudOff />}</span><div><b>{banner.title}</b><p>{banner.text}</p></div><span className="banner-state">{banner.state}</span></section>}

        {page === "anomaly" && <section className="anomaly-only anomaly-content">
          <div className="anomaly-summary-grid">
            <article className="card anomaly-summary-card"><span className="anomaly-summary-icon power"><Zap /></span><div><small>TOTAL LIVE POWER</small><b>{formatNumber(liveReading?.power_w ?? 0, 1)} <i>W</i></b><span>{DEVICE_ID} · {health === "connected" ? "live" : health === "delayed" ? "delayed" : health === "offline" ? "offline" : "waiting"}</span></div></article>
            <article className="card anomaly-summary-card"><span className="anomaly-summary-icon muted"><AlertTriangle /></span><div><small>HIGH CONSUMPTION</small><b>Not assessed</b><span>Expected-use baseline pending</span></div></article>
            <article className="card anomaly-summary-card"><span className={`anomaly-summary-icon ${health}`}><Cpu /></span><div><small>TOTAL SENSORS</small><b>1 <i>{health === "connected" ? "online" : health === "delayed" ? "delayed" : health === "offline" ? "offline" : "waiting"}</i></b><span>{DEVICE_ID} registered</span></div></article>
            <article className="card anomaly-summary-card"><span className="anomaly-summary-icon energy"><Bolt /></span><div><small>TOTAL ENERGY TODAY</small><b>{todayEnergyDelta === null ? "—" : formatNumber(todayEnergyDelta, 3)} <i>kWh</i></b><span>{todayEnergyDelta === null ? "Meter delta unavailable" : `${formatNumber(todayEnergyDelta, 3)} kWh meter delta`}</span></div></article>
          </div>
          <div className="anomaly-layout">
            <article className="card anomaly-map-card">
              <div className="card-heading anomaly-map-heading"><div><div className="heading-label"><span className="section-icon"><MapIcon /></span><h2>{mapFloor === "first" ? (classroomZoom ? "Floor 1 · Classroom detail" : "Floor 1") : "Ground Floor"}</h2></div><p>{mapFloor === "first" ? "Architectural plan · sensor coverage by classroom" : "Ground floor plan reference"}</p></div><div className="anomaly-map-tools">{mapFloor === "first" && <button className="map-focus-toggle" type="button" onClick={() => setClassroomZoom(zoom => !zoom)}>{classroomZoom ? <MapIcon /> : <Search />}{classroomZoom ? "Full floor plan" : "Zoom classroom"}</button>}<span className={`map-stage-badge ${health}`}>{health === "connected" ? "LIVE DATA" : health === "delayed" ? "READINGS DELAYED" : health === "offline" ? "DEVICE OFFLINE" : "WAITING FOR DATA"}</span></div></div>
              <div className={`anomaly-map-canvas ${mapFloor === "first" ? "reference-first" : "reference-ground"}`}>
                {mapFloor === "first" ? <div className={`plan-image-wrap ${classroomZoom ? "classroom-focus" : ""}`}><FloorPlanPreview health={health} power={liveReading?.power_w ?? 0} classroomZoom={classroomZoom} selectedClassroomId={selectedClassroomId} onSelectClassroom={setSelectedClassroomId} /></div> : <div className="floor-plan-pending"><span><MapPin /></span><b>Ground Floor plan not added yet</b><small>Upload the verified Ground Floor drawing to display this level.</small></div>}
              </div>
              <div className="anomaly-map-legend"><div className="power-scale"><span>LIVE POWER INTENSITY · CURRENT READING</span><div className="power-scale-gradient heat-map" /><small><span>0–300 W · green</span><span>301–1,000 W · yellow</span><span>&gt;1,000 W · orange</span></small></div><div className="map-legend-status"><span><i className={`legend-sensor ${health}`} /> {DEVICE_ID} · {health}</span><span><i className="legend-offline" /> Other rooms · no sensors yet</span></div></div>
            </article>
            <aside className="anomaly-side-column">
              <article className="card anomaly-device-card"><div className="card-heading"><div><div className="heading-label"><span className="section-icon"><Cpu /></span><h2>{selectedClassroom.name} sensor</h2></div><p>{selectedClassroom.connected ? "Live device status" : "No sensor connected yet"}</p></div></div><div className="anomaly-device-row"><span className={`sensor-state-dot ${selectedClassroom.connected ? health : "offline"}`} /><div><b>{selectedClassroom.connected ? `${DEVICE_ID} · ${selectedClassroom.name}` : selectedClassroom.name}</b><small>Floor 1 · {selectedClassroom.connected ? "PZEM-004T" : "Sensor pending"}</small></div><b>{selectedClassroom.connected ? `${formatNumber(liveReading?.power_w ?? 0, 1)} W` : "—"}</b></div><dl className="anomaly-device-details"><div><dt>Last reading</dt><dd>{selectedClassroom.connected && latest ? `${ago(now - timeMs(latest))} · ${formatTime(latest.recorded_at)}` : "No readings yet"}</dd></div><div><dt>Current health</dt><dd>{selectedClassroom.connected ? health : "Not connected"}</dd></div><div><dt>Today energy</dt><dd>{selectedClassroom.connected && todayEnergyDelta !== null ? `${formatNumber(todayEnergyDelta, 3)} kWh` : "—"}</dd></div></dl></article>
              <article className="card anomaly-alerts-card"><div className="card-heading"><div><div className="heading-label"><span className="section-icon"><AlertTriangle /></span><h2>Recent alerts</h2></div><p>Connectivity and verified events</p></div></div>{health === "offline" ? <div className="alert-list-row"><i className="alert-mark offline" /><div><b>{DEVICE_ID} · Sensor offline</b><small>Last reading {latest ? ago(now - timeMs(latest)) : "unavailable"}</small></div></div> : health === "delayed" ? <div className="alert-list-row"><i className="alert-mark delayed" /><div><b>{DEVICE_ID} · Reading delayed</b><small>Last reading {latest ? ago(now - timeMs(latest)) : "unavailable"}</small></div></div> : <div className="anomaly-empty-state compact"><span><Check /></span><b>No active device alerts</b><small>Consumption alerts are pending a verified room baseline.</small></div>}</article>
            </aside>
          </div>
        </section>}

        {page === "planning" && <BillForecastPanel />}

        {/* 1. KNOW YOUR CARBON - STUDENT TRAVEL FOOTPRINT (OPENSTREETMAP + LEAFLET + OSRM) */}
        {page === "travel" && (
          <>
            <section className="card travel-route-card travel-only">
              <div className="card-heading">
                <div>
                  <div className="heading-label"><span className="section-icon"><Navigation /></span><h2>Student Commute &amp; OpenStreetMap Route (OSRM)</h2></div>
                  <p>Type your start location and destination. Real driving distance and travel duration are calculated using OpenStreetMap &amp; OSRM (100% free &amp; open source).</p>
                </div>
                <span className="calculation-tag">OPENSTREETMAP + OSRM LIVE</span>
              </div>

              <div className="route-input-grid">
                <div className="route-field">
                  <label><MapPin style={{ width: 14, height: 14 }} /> Origin (Start Location)</label>
                  <input type="text" value={travelOrigin} onChange={e => setTravelOrigin(e.target.value)} placeholder="e.g. Kothrud, Pune" />
                </div>

                <div className="route-field">
                  <label><Navigation style={{ width: 14, height: 14 }} /> Destination (End Location)</label>
                  <input type="text" value={travelDestination} onChange={e => setTravelDestination(e.target.value)} placeholder={`e.g. ${DEFAULT_TRAVEL_DESTINATION}`} />
                </div>

                <div className="route-field">
                  <label><Compass style={{ width: 14, height: 14 }} /> OSRM Distance ({travelDistance} km)</label>
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <input type="number" min="0.1" step="0.1" value={travelDistance} onChange={e => setTravelDistance(parseFloat(e.target.value) || 0)} style={{ flex: 1 }} />
                    <button type="button" className="outline-button" onClick={() => calculateOsrmRoute(travelOrigin, travelDestination)} disabled={isCalculatingRoute}>
                      <RefreshCw style={{ width: 11, height: 11 }} /> {isCalculatingRoute ? "Routing..." : "Calculate"}
                    </button>
                  </div>
                </div>

                <div className="route-field">
                  <label><Compass style={{ width: 14, height: 14 }} /> Quick Student Presets</label>
                  <div className="preset-buttons" style={{ marginTop: 2 }}>
                    {[
                      { label: "Dadar", orig: "Dadar TT, Mumbai", dest: DEFAULT_TRAVEL_DESTINATION },
                      { label: "Chembur", orig: "Chembur, Mumbai", dest: DEFAULT_TRAVEL_DESTINATION },
                      { label: "Sion", orig: "Sion, Mumbai", dest: DEFAULT_TRAVEL_DESTINATION },
                      { label: "Navi Mumbai", orig: "Navi Mumbai, Maharashtra", dest: DEFAULT_TRAVEL_DESTINATION },
                    ].map(preset => (
                      <button
                        key={preset.label}
                        type="button"
                        className="preset-chip"
                        onClick={() => {
                          setTravelOrigin(preset.orig);
                          setTravelDestination(preset.dest);
                          calculateOsrmRoute(preset.orig, preset.dest);
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {routeStatusMessage && (
                <p className={routeStatusMessage.includes("not found") ? "date-range-error" : "summary-note"} style={{ margin: "4px 0 0" }}>
                  ℹ️ {routeStatusMessage}
                </p>
              )}

              {/* GOOGLE MAPS STYLE TRANSIT MODE SELECTOR STRIP */}
              <div className="maps-transit-container">
                <div className="maps-transit-header">
                  <span><Navigation style={{ width: 13, height: 13 }} /> COMMUTE TRAVEL MODES (SELECT LIKE IN MAPS)</span>
                  <small>Click any option to calculate footprint and compare against Car</small>
                </div>
                <div className="maps-transit-strip" role="tablist" aria-label="Transport modes">
                  {TRANSPORT_MODES.slice(0, 7).map(mode => {
                    const IconComp = mode.icon;
                    const isSelected = mode.id === selectedTransportId;
                    const modeOneWay = travelDistance * mode.factorKgPerKm;
                    const duration = getModeDuration(mode, travelDistance);
                    const isCar = mode.id === "petrol-car";
                    const modeReduction = carOneWayCarbon > 0 ? Math.round(((carOneWayCarbon - modeOneWay) / carOneWayCarbon) * 100) : 0;

                    return (
                      <button
                        key={mode.id}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        className={`maps-transit-tab ${isSelected ? "active" : ""}`}
                        onClick={() => setSelectedTransportId(mode.id)}
                      >
                        <div className="tab-top-row">
                          <span className="tab-icon"><IconComp style={{ width: 14, height: 14 }} /></span>
                          <b className="tab-title">{mode.shortName}</b>
                        </div>
                        <div className="tab-duration">{duration}</div>
                        <div className="tab-footprint">
                          <b>{modeOneWay.toFixed(2)}</b> <small>kg CO₂e</small>
                        </div>
                        {isCar ? (
                          <span className="tab-comparison-badge baseline">Baseline Car</span>
                        ) : mode.factorKgPerKm === 0 ? (
                          <span className="tab-comparison-badge zero">0 CO₂ (-100%)</span>
                        ) : (
                          <span className="tab-comparison-badge saved">-{modeReduction}% CO₂</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* DYNAMIC CARBON FOOTPRINT COMPARISON VS CAR BANNER */}
              <div className={`commute-comparison-card ${isCarSelected ? "car-warning" : "eco-highlight"}`}>
                <div className="comparison-card-top">
                  <div className="comparison-title-box">
                    {isCarSelected ? (
                      <>
                        <span className="comparison-pill warning">
                          <AlertTriangle style={{ width: 12, height: 12 }} /> High-Emission Baseline Mode
                        </span>
                        <h3>Driving a <span>{selectedMode.name}</span> emits <b>{oneWayCarbon.toFixed(3)} kg CO₂e</b> / trip</h3>
                        <p>
                          Private cars produce the highest carbon footprint per student ({annualCommuteCarbon.toFixed(1)} kg CO₂e/year).
                          Switching to City Bus cuts emissions by <b>79.4%</b>, while Metro cuts emissions by <b>85.3%</b>!
                        </p>
                      </>
                    ) : (
                      <>
                        <span className="comparison-pill eco">
                          <Sparkles style={{ width: 12, height: 12 }} /> {reductionVsCarPercent}% Less Carbon Than Driving a Car!
                        </span>
                        <h3>Commuting via <span>{selectedMode.name}</span> burns only <b>{oneWayCarbon.toFixed(3)} kg CO₂e</b></h3>
                        <p>
                          Great eco-friendly decision! Compared to driving a private solo car ({carOneWayCarbon.toFixed(3)} kg CO₂e), you save <b>{savingsVsCarTripKg.toFixed(3)} kg CO₂e</b> on every trip to campus.
                        </p>
                      </>
                    )}
                  </div>

                  {isCarSelected ? (
                    <div className="comparison-action-btns">
                      <button type="button" className="switch-mode-btn" onClick={() => setSelectedTransportId("city-bus")}>
                        <Bus style={{ width: 16, height: 16, color: "#16a34a" }} />
                        <div>
                          <b>Switch to City Bus</b>
                          <small>Saves 79.4% CO₂e (-{(carOneWayCarbon - (travelDistance * 0.035)).toFixed(2)} kg/trip)</small>
                        </div>
                      </button>
                      <button type="button" className="switch-mode-btn" onClick={() => setSelectedTransportId("metro-train")}>
                        <Train style={{ width: 16, height: 16, color: "#16a34a" }} />
                        <div>
                          <b>Switch to Metro / Train</b>
                          <small>Saves 85.3% CO₂e (-{(carOneWayCarbon - (travelDistance * 0.025)).toFixed(2)} kg/trip)</small>
                        </div>
                      </button>
                    </div>
                  ) : (
                    <div className="comparison-metrics-row">
                      <div className="comparison-metric-box">
                        <small>Carbon Saved / Trip</small>
                        <b>-{savingsVsCarTripKg.toFixed(3)} kg</b>
                        <span>vs Solo Car</span>
                      </div>
                      <div className="comparison-metric-box">
                        <small>Annual CO₂ Avoided</small>
                        <b>-{annualSavingsVsCarKg.toFixed(1)} kg</b>
                        <span>220 academic days</span>
                      </div>
                      <div className="comparison-metric-box trees">
                        <small>Tree Offset Value</small>
                        <b>+{treesSavedVsCar.toFixed(1)} Trees</b>
                        <span>saved annually</span>
                      </div>
                      <div className="comparison-metric-box">
                        <small>Commute Fare / Trip</small>
                        <b>{formatRupees(costPerTrip, 0)}</b>
                        <span>{costSavingsVsCarTripINR > 0 ? `saves ${formatRupees(costSavingsVsCarTripINR, 0)} vs car` : "per commute"}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Visual Carbon Comparison Progress Bars */}
                <div className="comparison-bars-block">
                  <div className="comparison-bar-row">
                    <div className="comparison-bar-label">
                      <span>🚗 Solo Petrol Car (Baseline Reference)</span>
                      <b>{carOneWayCarbon.toFixed(3)} kg CO₂e (100%)</b>
                    </div>
                    <div className="comparison-bar-track">
                      <div className="comparison-bar-fill car-fill" style={{ width: "100%" }}>
                        100%
                      </div>
                    </div>
                  </div>
                  <div className="comparison-bar-row">
                    <div className="comparison-bar-label">
                      <span>
                        <selectedMode.icon style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                        Your Preferred Choice: <b>{selectedMode.name}</b>
                      </span>
                      <b>{oneWayCarbon.toFixed(3)} kg CO₂e {reductionVsCarPercent > 0 ? `(-${reductionVsCarPercent}% vs Car)` : "(Baseline)"}</b>
                    </div>
                    <div className="comparison-bar-track">
                      <div
                        className={`comparison-bar-fill ${selectedMode.factorKgPerKm === 0 ? "zero-fill" : isCarSelected ? "car-fill" : "eco-fill"}`}
                        style={{ width: `${Math.max(6, Math.min(100, Math.round((oneWayCarbon / (carOneWayCarbon || 1)) * 100)))}%` }}
                      >
                        {selectedMode.factorKgPerKm === 0 ? "0 kg (100% Saved)" : `${Math.round((oneWayCarbon / (carOneWayCarbon || 1)) * 100)}%`}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="map-visual-box">
                <div className="map-visual-header">
                  <div>
                    <b>{travelOrigin || "Start"} ➔ {travelDestination || "Destination"}</b>
                    <p style={{ margin: "3px 0 0", fontSize: 8, opacity: 0.85 }}>
                      OSRM Road Distance: <b>{routeDistanceText || `${travelDistance} km`}</b> · Commute via <b>{selectedMode.name}</b>: <b>{getModeDuration(selectedMode, travelDistance)}</b>
                    </p>
                  </div>
                  <span style={{ background: "#25a072", color: "#fff" }}>{isCalculatingRoute ? "Routing via OSRM..." : "OSM + Leaflet Active"}</span>
                </div>

                <div ref={leafletContainerRef} className="osm-leaflet-container" style={{ width: "100%", height: 260, borderRadius: 8, marginTop: 10 }} />

                <div className="map-route-graphic" style={{ marginTop: 10 }}>
                  <div className="route-pin-box">
                    <div className="pin-icon">A</div>
                    <div className="pin-text">
                      <b>{travelOrigin.split(",")[0] || "Start"}</b>
                      <small>Origin Point</small>
                    </div>
                  </div>

                  <div className="route-line-connector">
                    <span className="route-distance-tag">{routeDistanceText || `${travelDistance} km`} via {selectedMode.shortName}</span>
                  </div>

                  <div className="route-pin-box">
                    <div className="pin-icon dest">B</div>
                    <div className="pin-text">
                      <b>{travelDestination.split(",")[0] || "End"}</b>
                      <small>Destination Point</small>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="insight-summary-grid travel-only">
              <article className="card insight-metric-card">
                <div className="metric-header-row">
                  <span>One-Way Journey</span>
                  {!isCarSelected && <span className="reduction-pill">-{reductionVsCarPercent}% vs Car</span>}
                </div>
                <b>{oneWayCarbon.toFixed(3)} kg CO₂e</b>
                <small>{travelDistance} km via {selectedMode.name}</small>
              </article>
              <article className="card insight-metric-card">
                <div className="metric-header-row">
                  <span>Daily Round-Trip (2-Way)</span>
                  {!isCarSelected && <span className="reduction-pill">Saves {(savingsVsCarTripKg * 2).toFixed(2)} kg</span>}
                </div>
                <b>{dailyCommuteCarbon.toFixed(3)} kg CO₂e</b>
                <small>2 × {travelDistance} km daily student commute</small>
              </article>
              <article className="card insight-metric-card">
                <div className="metric-header-row">
                  <span>Monthly Commute (22 Days)</span>
                  {!isCarSelected && <span className="reduction-pill">-{reductionVsCarPercent}% CO₂</span>}
                </div>
                <b>{monthlyCommuteCarbon.toFixed(2)} kg CO₂e</b>
                <small>Estimated monthly academic footprint</small>
              </article>
              <article className="card insight-metric-card">
                <div className="metric-header-row">
                  <span>Annual Academic Year (220 Days)</span>
                  {!isCarSelected && <span className="reduction-pill trees">+{treesSavedVsCar.toFixed(1)} Trees</span>}
                </div>
                <b>{annualCommuteCarbon.toFixed(1)} kg CO₂e</b>
                <small>Est. Fare: {formatRupees(annualCommuteCost, 0)} · {treesNeededToOffset.toFixed(1)} trees to offset</small>
              </article>
            </section>

            <section className="section-block travel-only">
              <div className="section-top">
                <div>
                  <h2>All Commute Transport Modes</h2>
                  <p>Compare carbon rates and annual academic footprint across travel modes for {travelDistance} km</p>
                </div>
              </div>
              <div className="travel-modes-grid">
                {TRANSPORT_MODES.map(mode => {
                  const IconComp = mode.icon;
                  const modeOneWay = travelDistance * mode.factorKgPerKm;
                  const modeAnnual = 220 * 2 * travelDistance * mode.factorKgPerKm;
                  const isSelected = mode.id === selectedTransportId;
                  const modeReduction = carOneWayCarbon > 0 ? Math.round(((carOneWayCarbon - modeOneWay) / carOneWayCarbon) * 100) : 0;
                  return (
                    <div key={mode.id} className={`mode-card ${isSelected ? "selected" : ""}`} onClick={() => setSelectedTransportId(mode.id)}>
                      <div className="mode-card-top">
                        <div className="mode-icon"><IconComp style={{ width: 17, height: 17 }} /></div>
                        <span className="mode-badge">
                          {mode.id === "petrol-car" ? "Baseline Car" : mode.factorKgPerKm === 0 ? "Zero CO₂" : `-${modeReduction}% vs Car`}
                        </span>
                      </div>
                      <div className="mode-name">{mode.name}</div>
                      <div className="mode-rate">{mode.factorKgPerKm === 0 ? "0 g CO₂e/km (Zero Emission)" : `${(mode.factorKgPerKm * 1000).toFixed(0)} g CO₂e/km`}</div>
                      <div className="mode-foot">
                        {modeOneWay.toFixed(3)} <small>kg CO₂e/trip</small>
                      </div>
                      <div style={{ fontSize: 8, color: "#7a8a81" }}>Annual: {modeAnnual.toFixed(1)} kg CO₂e · {getModeDuration(mode, travelDistance)}</div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="insights-chart-grid travel-only">
              <article className="card chart-card insight-chart">
                <div className="card-heading">
                  <div>
                    <div className="heading-label"><span className="section-icon"><Leaf /></span><h2>Annual Commute Carbon Comparison by Mode</h2></div>
                    <p>Comparing 220-day academic year emissions across transport options for {travelDistance} km</p>
                  </div>
                </div>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={modeComparisonData} margin={{ top: 15, right: 13, left: 0, bottom: 3 }}>
                      <CartesianGrid stroke="#edf1ee" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: "#87938b", fontSize: 8 }} minTickGap={10} axisLine={{ stroke: "#e8eeea" }} tickLine={false} />
                      <YAxis tickFormatter={v => `${v} kg`} tick={{ fill: "#87938b", fontSize: 9 }} axisLine={false} tickLine={false} width={48} />
                      <Tooltip formatter={(value, _name, item) => [`${value} kg CO₂e/year (${(item?.payload?.oneWayCarbon || 0).toFixed(3)} kg/trip)`, item?.payload?.fullName || "Commute Carbon"]} />
                      <Bar dataKey="annualCarbon" name="Annual CO₂e (kg)" radius={[4, 4, 0, 0]} maxBarSize={38} isAnimationActive={false}>
                        {modeComparisonData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-footer">
                  <span><i className="legend-dot carbon-legend" /> Annual student carbon footprint (220 days)</span>
                  <span>Selected: <b>{selectedMode.name}</b></span>
                </div>
              </article>

              <article className="card insight-observation" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div className="settings-strip-icon"><Leaf /></div>
                  <div>
                    <b>Student Commute Eco Insights</b>
                    <p style={{ marginTop: 6, fontSize: 9, lineHeight: 1.6, color: "#627369" }}>
                      Traveling <b>{travelDistance} km</b> daily via <b>{selectedMode.name}</b> emits <b>{annualCommuteCarbon.toFixed(1)} kg CO₂e</b> every academic year.
                      {!isCarSelected && annualSavingsVsCarKg > 0
                        ? ` Choosing ${selectedMode.name} saves ${annualSavingsVsCarKg.toFixed(1)} kg CO₂e per year compared to driving a solo car (${reductionVsCarPercent}% reduction), equivalent to planting ${treesSavedVsCar.toFixed(1)} mature trees!`
                        : isCarSelected
                        ? ` Solo car travel produces 635+ kg CO₂e/year. Switching to City Bus or Metro would save up to ${((carAnnualCarbon - (220 * 2 * travelDistance * 0.025))).toFixed(1)} kg CO₂e annually!`
                        : " Outstanding zero-emission commute choice! You produce 0 kg CO₂e traveling to campus."}
                    </p>
                  </div>
                </div>

                <div style={{ background: "#f2faf5", border: "1px solid #d4eae0", borderRadius: 8, padding: 12, marginTop: 14 }}>
                  <b style={{ fontSize: 10, color: "#16583d" }}>💡 Student Green Commute Action Plan:</b>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 8, color: "#456052", display: "grid", gap: 4 }}>
                    <li><b>City Bus vs Car:</b> Taking the bus cuts per-student carbon by <b>79.4%</b>, avoiding over 500 kg CO₂e annually.</li>
                    <li><b>Metro / Electric Transit:</b> Cuts urban traffic carbon by up to <b>85.3%</b> vs petrol cars.</li>
                    <li><b>Active Mobility:</b> Walking or biking for distances under 3 km generates <b>0 emissions</b> while promoting health!</li>
                  </ul>
                </div>
              </article>
            </section>
          </>
        )}

        {/* 2. LIVE MONITORING TAB */}
        {page === "live" && (
          <>
            <section className="section-block live-page">
              <div className="section-top">
                <div>
                  <h2>Live values</h2>
                  <p>{liveReading ? `Current readings from ${DEVICE_ID}` : `No fresh reading from ${DEVICE_ID} · live values are shown as 0`}</p>
                </div>
                <span className="freshness-chip">
                  <i className={health} />
                  {latest ? `${ago(now - timeMs(latest))} · ${realtimeConnected ? "Realtime" : "stored reading"}` : "No readings yet"}
                </span>
              </div>
              <div className="metric-carousel" tabIndex={0} aria-label="Live and carbon metrics. Swipe or use the arrow buttons to change pages." onTouchStart={event => { swipeStartX.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={event => { const start = swipeStartX.current; const end = event.changedTouches[0]?.clientX; swipeStartX.current = null; if (start === null || end === undefined || Math.abs(end - start) < 45) return; setMetricPage(current => Math.max(0, Math.min(1, current + (end < start ? 1 : -1)))); }} onKeyDown={event => { if (event.key === "ArrowRight") setMetricPage(1); if (event.key === "ArrowLeft") setMetricPage(0); }}>
                <div className="metric-carousel-toolbar">
                  <span className="metric-page-name">{metricPage === 0 ? "Key live values" : "More measurements & carbon"}</span>
                  <div className="metric-page-controls">
                    <button type="button" aria-label="Previous metric page" disabled={metricPage === 0} onClick={() => setMetricPage(0)}><ChevronLeft /></button>
                    <span>{metricPage + 1} / 2</span>
                    <button type="button" aria-label="Next metric page" disabled={metricPage === 1} onClick={() => setMetricPage(1)}><ChevronRight /></button>
                  </div>
                </div>
                <div className="metric-viewport">
                  <div className="metric-slides" style={{ transform: `translateX(-${metricPage * 50}%)` }}>
                    <div className="metric-slide" aria-hidden={metricPage !== 0}>
                      <div className="kpi-grid">
                        {primaryMetrics.map(metric => (
                          <article className="card kpi-card" key={metric.title}>
                            <div className="kpi-top">
                              <span className={`kpi-icon ${metric.tone}`}><metric.icon /></span>
                              <span className="kpi-context">{metric.context}</span>
                            </div>
                            <div className="kpi-name">{metric.title}</div>
                            <div className="kpi-value">{metric.value === null ? "—" : formatNumber(metric.value, metric.digits)} <small>{metric.unit}</small></div>
                            <div className={`kpi-foot ${liveReading ? "has-data" : ""}`}>
                              {!liveReading ? "No current reading · showing 0" : metric.unit.includes("CO₂e") ? "Estimated · based on current readings" : `Recorded ${formatTime(liveReading.recorded_at)}`}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                    <div className="metric-slide" aria-hidden={metricPage !== 1}>
                      <div className="kpi-grid">
                        {secondaryMetrics.map(metric => (
                          <article className="card kpi-card carbon-kpi" key={metric.title}>
                            <div className="kpi-top">
                              <span className={`kpi-icon ${metric.tone}`}><metric.icon /></span>
                              <span className="kpi-context">{metric.context}</span>
                            </div>
                            <div className="kpi-name">{metric.title}</div>
                            <div className="kpi-value">{metric.value === null ? "—" : formatNumber(metric.value, metric.digits)} <small>{metric.unit}</small></div>
                            <div className="kpi-foot">
                              {metric.title === "Grid factor" ? "Change via VITE_CARBON_EMISSION_FACTOR_KG_PER_KWH" : liveReading ? "Estimated · based on electricity use" : "No current reading · showing 0"}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="metric-swipe-hint">Swipe left or right to see the other key measurements</div>
              </div>
            </section>

            <SensorForecastCard liveForecast={liveForecast} />

            <section className="primary-grid">
              <article className="card chart-card live-page">
                <div className="card-heading">
                  <div>
                    <div className="heading-label"><span className="section-icon"><Activity /></span><h2>Power over time</h2></div>
                    <p>Active power reported by the meter</p>
                  </div>
                  <div className="range-control" role="group" aria-label="Chart time range">
                    {(["15m", "1h", "6h", "24h"] as Range[]).map((option, index) => (
                      <button key={option} className={`range-button ${range === option ? "selected" : ""}`} onClick={() => setRange(option)}>
                        {["15 min", "1 hr", "6 hr", "24 hr"][index]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 15, right: 13, left: 0, bottom: 3 }}>
                      <defs>
                        <linearGradient id="powerFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#26966a" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#26966a" stopOpacity={0.015} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#edf1ee" vertical={false} />
                      <XAxis dataKey="timeMs" type="number" scale="time" domain={[now - RANGE_MS[range], now]} tickFormatter={value => new Intl.DateTimeFormat("en-IN", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(value)} tick={{ fill: "#87938b", fontSize: 9 }} minTickGap={28} axisLine={{ stroke: "#e8eeea" }} tickLine={false} />
                      <YAxis dataKey="power" domain={[0, "auto"]} tick={{ fill: "#87938b", fontSize: 9 }} axisLine={false} tickLine={false} width={42} />
                      <Tooltip content={<PowerTooltip />} />
                      <Area dataKey="power" type="monotone" stroke="#168459" strokeWidth={2.2} fill="url(#powerFill)" dot={chartData.length < 80 ? { r: 2.2, fill: "#fff", stroke: "#168459", strokeWidth: 1.5 } : false} activeDot={{ r: 4 }} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                  {chartData.length === 0 && (
                    <div className="chart-empty">
                      <span className="empty-icon"><Activity /></span>
                      <b>{loading ? "Loading readings…" : "No readings in this time range"}</b>
                      <span>New ELEC-01 measurements will appear here automatically.</span>
                    </div>
                  )}
                </div>
                <div className="chart-footer">
                  <span><i className="legend-dot" /> Active power <span className="chart-unit">(W)</span></span>
                  <span>{chartData.length} {chartData.length === 1 ? "reading" : "readings"}{chartData.length >= 20000 ? " · display limit reached" : ""}</span>
                </div>
              </article>

              <article className="card chart-card emissions-chart live-page">
                <div className="card-heading">
                  <div>
                    <div className="heading-label"><span className="section-icon"><Leaf /></span><h2>Carbon emissions over time</h2></div>
                    <p>Estimated emissions rate from power and grid factor</p>
                  </div>
                  <div className="range-control" role="group" aria-label="Carbon chart time range">
                    {(["15m", "1h", "6h", "24h"] as Range[]).map((option, index) => (
                      <button key={option} className={`range-button ${range === option ? "selected" : ""}`} onClick={() => setRange(option)}>
                        {["15 min", "1 hr", "6 hr", "24 hr"][index]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 15, right: 13, left: 0, bottom: 3 }}>
                      <defs>
                        <linearGradient id="carbonFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#39a783" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#39a783" stopOpacity={0.015} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#edf1ee" vertical={false} />
                      <XAxis dataKey="timeMs" type="number" scale="time" domain={[now - RANGE_MS[range], now]} tickFormatter={value => new Intl.DateTimeFormat("en-IN", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(value)} tick={{ fill: "#87938b", fontSize: 9 }} minTickGap={28} axisLine={{ stroke: "#e8eeea" }} tickLine={false} />
                      <YAxis dataKey="emissionRate" domain={[0, "auto"]} tick={{ fill: "#87938b", fontSize: 9 }} axisLine={false} tickLine={false} width={42} />
                      <Tooltip content={<EmissionTooltip />} />
                      <Area dataKey="emissionRate" type="monotone" stroke="#178c68" strokeWidth={2.2} fill="url(#carbonFill)" dot={chartData.length < 80 ? { r: 2.2, fill: "#fff", stroke: "#178c68", strokeWidth: 1.5 } : false} activeDot={{ r: 4 }} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                  {chartData.length === 0 && (
                    <div className="chart-empty">
                      <span className="empty-icon"><Leaf /></span>
                      <b>{loading ? "Loading readings…" : "No emissions data in this time range"}</b>
                      <span>Carbon estimates will appear when fresh power readings arrive.</span>
                    </div>
                  )}
                </div>
                <div className="chart-footer">
                  <span><i className="legend-dot carbon-legend" /> Estimated emissions rate <span className="chart-unit">(kg CO₂e/h)</span></span>
                  <span>{chartData.length} {chartData.length === 1 ? "reading" : "readings"} · factor {EMISSION_FACTOR.toFixed(2)}</span>
                </div>
              </article>
            </section>

            <section className="card readings-card live-page">
              <div className="card-heading readings-heading">
                <div>
                  <div className="heading-label"><span className="section-icon"><Clock3 /></span><h2>Recent readings</h2></div>
                  <p>Newest database records first</p>
                </div>
                <div className="readings-tools">
                  <label className="table-search"><Search /><input type="search" placeholder="Filter readings" aria-label="Filter readings" value={filter} onChange={event => setFilter(event.target.value)} /></label>
                  <span className="row-count">{tableRows.length} shown</span>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Recorded (IST)</th><th>Voltage</th><th>Current</th><th>Power</th><th>Energy</th><th>Frequency</th><th>Power factor</th></tr>
                  </thead>
                  <tbody>
                    {tableRows.length === 0 ? (
                      <tr className="empty-row"><td colSpan={7}><div className="table-empty"><span className="empty-mini"><Activity /></span><b>{filter ? "No readings match that filter" : "Waiting for your first ELEC-01 reading"}</b><span>{filter ? "Try another time or measurement." : "When the database returns data, it will be listed here."}</span></div></td></tr>
                    ) : (
                      tableRows.map(reading => (
                        <tr key={rowKey(reading)}>
                          <td>{formatTime(reading.recorded_at)}</td>
                          <td>{formatNumber(reading.voltage_v, 1)} V</td>
                          <td>{formatNumber(reading.current_a, 2)} A</td>
                          <td>{formatNumber(reading.power_w, 1)} W</td>
                          <td>{formatNumber(reading.energy_kwh, 3)} kWh</td>
                          <td>{reading.frequency_hz == null ? "—" : `${formatNumber(reading.frequency_hz, 2)} Hz`}</td>
                          <td>{reading.power_factor == null ? "—" : formatNumber(reading.power_factor, 2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="readings-footer">
                <span>Readings are filtered to device {DEVICE_ID}. Timestamps are displayed in IST.</span>
                <button className="text-action" onClick={() => setRefreshKey(key => key + 1)}>Refresh <RefreshCw /></button>
              </div>
            </section>
          </>
        )}

        {/* 3. ENERGY & CARBON ANALYTICS TAB */}
        {page === "insights" && (
          <>
            <section className="section-block insight-range-block insights-only">
              <div className="section-top">
                <div>
                  <h2>Carbon impact</h2>
                  <p>Estimated from electricity use × {EMISSION_FACTOR.toFixed(2)} kg CO₂e/kWh</p>
                </div>
                <div className="date-range-control" aria-label="Choose carbon insights date and time range">
                  <label>From <input type="datetime-local" value={insightStart} max={insightEnd} onChange={event => setInsightStart(event.target.value)} aria-label="Insights start date and time" /></label>
                  <label>To <input type="datetime-local" value={insightEnd} min={insightStart} max={toDateTimeLocal(new Date())} onChange={event => setInsightEnd(event.target.value)} aria-label="Insights end date and time" /></label>
                </div>
              </div>
              {!validInsightInterval && <p className="date-range-error">Choose an end time after the start time.</p>}
            </section>

            <section className="insight-summary-grid insights-only">
              <article className="card insight-metric-card">
                <span>Estimated carbon today</span>
                <b>{todayCarbonInsight === null ? "—" : `${formatNumber(todayCarbonInsight, 4)} kg CO₂e`}</b>
                <small>Integrated power samples · intervals under 5 min</small>
              </article>
              <article className="card insight-metric-card">
                <span>Carbon in selected period</span>
                <b>{periodCarbonInsight === null ? "—" : `${formatNumber(periodCarbonInsight, 4)} kg CO₂e`}</b>
                <small>Power × time × grid factor · selected dates</small>
              </article>
              <article className="card insight-metric-card">
                <span>Cumulative carbon estimate</span>
                <b>{currentEnergy === null ? "—" : `${formatNumber(currentEnergy * EMISSION_FACTOR, 3)} kg CO₂e`}</b>
                <small>Based on cumulative meter energy</small>
              </article>
              <article className="card insight-metric-card">
                <span>Meter energy delta</span>
                <b>{energyDelta === null ? "—" : `${formatNumber(energyDelta, 3)} kWh`}</b>
                <small>{energyDeltaReason}</small>
              </article>
            </section>

            <section className="insights-chart-grid insights-only">
              <article className="card chart-card insight-chart">
                <div className="card-heading">
                  <div>
                    <div className="heading-label"><span className="section-icon"><Leaf /></span><h2>Carbon footprint buildup</h2></div>
                    <p>Estimated accumulation across the selected period</p>
                  </div>
                </div>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={insightChartData.cumulative} margin={{ top: 15, right: 13, left: 0, bottom: 3 }}>
                      <defs>
                        <linearGradient id="insightCarbonFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#26966a" stopOpacity={0.26} />
                          <stop offset="100%" stopColor="#26966a" stopOpacity={0.015} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#edf1ee" vertical={false} />
                      <XAxis dataKey="timeMs" type="number" scale="time" domain={[insightStartMs, insightEndMs]} tickFormatter={value => new Intl.DateTimeFormat("en-IN", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(value)} tick={{ fill: "#87938b", fontSize: 9 }} minTickGap={28} axisLine={{ stroke: "#e8eeea" }} tickLine={false} />
                      <YAxis dataKey="cumulativeCarbon" domain={[0, "auto"]} tickFormatter={value => Number(value).toFixed(5)} tick={{ fill: "#87938b", fontSize: 9 }} axisLine={false} tickLine={false} width={55} />
                      <Tooltip content={<CarbonFootprintTooltip />} />
                      <Area dataKey="cumulativeCarbon" type="monotone" stroke="#168459" strokeWidth={2.2} fill="url(#insightCarbonFill)" dot={insightChartData.cumulative.length < 80 ? { r: 2, fill: "#fff", stroke: "#168459", strokeWidth: 1.4 } : false} activeDot={{ r: 4 }} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                  {insightReadings.length < 2 && (
                    <div className="chart-empty">
                      <span className="empty-icon"><Leaf /></span>
                      <b>More readings needed</b>
                      <span>Carbon trend appears when power samples arrive.</span>
                    </div>
                  )}
                </div>
                <div className="chart-footer">
                  <span><i className="legend-dot carbon-legend" /> Estimated CO₂e accumulated</span>
                  <span>{insightReadings.length} readings</span>
                </div>
              </article>

              <article className="card chart-card insight-chart">
                <div className="card-heading">
                  <div>
                    <div className="heading-label"><span className="section-icon"><Activity /></span><h2>Carbon by hour</h2></div>
                    <p>Estimated emissions grouped by hour of day</p>
                  </div>
                </div>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={insightChartData.hourly} margin={{ top: 15, right: 13, left: 0, bottom: 3 }}>
                      <CartesianGrid stroke="#edf1ee" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fill: "#87938b", fontSize: 9 }} minTickGap={24} axisLine={{ stroke: "#e8eeea" }} tickLine={false} />
                      <YAxis dataKey="carbon" domain={[0, "auto"]} tickFormatter={value => Number(value).toFixed(5)} tick={{ fill: "#87938b", fontSize: 9 }} axisLine={false} tickLine={false} width={55} />
                      <Tooltip content={<CarbonFootprintTooltip />} />
                      <Bar dataKey="carbon" name="CO₂e" fill="#32a477" radius={[4, 4, 0, 0]} maxBarSize={35} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                  {insightChartData.hourly.length === 0 && (
                    <div className="chart-empty">
                      <span className="empty-icon"><Activity /></span>
                      <b>No hourly footprint yet</b>
                      <span>Need consecutive readings less than five minutes apart.</span>
                    </div>
                  )}
                </div>
                <div className="chart-footer">
                  <span><i className="legend-dot carbon-legend" /> Estimated CO₂e per hour</span>
                  <span>{insightChartData.hourly.length} active hours</span>
                </div>
              </article>
            </section>

            <section className="card insight-observation insights-only">
              <div className="settings-strip-icon"><Leaf /></div>
              <div>
                <b>What this period shows</b>
                <p>{peakCarbonHour ? `Highest estimated emissions were recorded around ${peakCarbonHour.hour}. ${peakEmissionRate === null ? "" : `Peak rate: ${formatNumber(peakEmissionRate, 4)} kg CO₂e/h. `}Carbon trend and period totals integrate adjacent power readings, skipping gaps over five minutes. Meter energy delta is shown separately; cumulative footprint uses the meter total.` : "Choose a period with at least two close-together readings to see carbon trends and hourly insights."} Estimates use the configured grid factor and are not direct sensor measurements.</p>
              </div>
              <span className="calculation-tag">ESTIMATE · {EMISSION_FACTOR.toFixed(2)} kg/kWh</span>
            </section>
          </>
        )}

        {/* 4. COST & GREEN TAX TAB */}
        {page === "costs" && (
          <>
            <section className="section-block cost-period-block costs-only">
              <div className="section-top">
                <div>
                  <h2>Choose billing period</h2>
                  <p>Uses meter energy change when available; otherwise integrates close power samples.</p>
                </div>
                <div className="date-range-control" aria-label="Choose cost calculation date and time range">
                  <label>From <input type="datetime-local" value={insightStart} max={insightEnd} onChange={event => setInsightStart(event.target.value)} aria-label="Cost start date and time" /></label>
                  <label>To <input type="datetime-local" value={insightEnd} min={insightStart} max={toDateTimeLocal(new Date())} onChange={event => setInsightEnd(event.target.value)} aria-label="Cost end date and time" /></label>
                </div>
              </div>
              {!validInsightInterval && <p className="date-range-error">Choose an end time after the start time.</p>}
              <p className="cost-rate-summary">Electricity tariff: ₹11.80/kWh <span>·</span> Green tax: ₹12.85/kWh</p>
            </section>

            <section className="cost-summary-grid costs-only">
              <article className="card cost-summary-card">
                <span>Estimated electricity cost</span>
                <b>{formatRupees(selectedEnergyCost, selectedEnergyCost !== null && selectedEnergyCost < 0.1 ? 4 : 2)}</b>
                <small>{estimatedPeriodKwh === null ? energyDeltaReason : `${formatNumber(estimatedPeriodKwh, 5)} kWh × ₹11.80/kWh · ${costCalculationSource}`}</small>
              </article>
              <article className="card cost-summary-card green-tax-card">
                <span>Estimated green tax</span>
                <b>{formatRupees(selectedGreenTax, selectedGreenTax !== null && selectedGreenTax < 0.1 ? 4 : 2)}</b>
                <small>{estimatedPeriodKwh === null ? energyDeltaReason : `${formatNumber(estimatedPeriodKwh, 5)} kWh × ₹12.85/kWh`}</small>
              </article>
              <article className="card cost-summary-card">
                <span>Estimated footprint</span>
                <b>{selectedCarbonKg === null ? "—" : `${formatNumber(selectedCarbonKg, 5)} kg CO₂e`}</b>
                <small>Energy change × {EMISSION_FACTOR.toFixed(2)} kg CO₂e/kWh</small>
              </article>
            </section>

            <section className="cost-content-grid costs-only">
              <article className="card cost-chart-card">
                <div className="card-heading">
                  <div>
                    <div className="heading-label"><span className="section-icon"><Wallet /></span><h2>Hourly cost breakdown</h2></div>
                    <p>Electricity cost and estimated green tax by hour</p>
                  </div>
                </div>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyCostData} margin={{ top: 15, right: 13, left: 0, bottom: 3 }}>
                      <CartesianGrid stroke="#edf1ee" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fill: "#87938b", fontSize: 9 }} minTickGap={24} axisLine={{ stroke: "#e8eeea" }} tickLine={false} />
                      <YAxis tickFormatter={value => `₹${Number(value).toFixed(Number(value) > 0 && Number(value) < 0.1 ? 3 : 0)}`} tick={{ fill: "#87938b", fontSize: 9 }} axisLine={false} tickLine={false} width={42} />
                      <Tooltip formatter={(value, name) => [formatRupees(Number(value), Number(value) > 0 && Number(value) < 0.1 ? 4 : 2), name === "energyCost" ? "Electricity" : "Green tax"]} />
                      <Bar dataKey="energyCost" name="Electricity" fill="#258b62" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                      <Bar dataKey="greenTaxCost" name="Green tax" fill="#63b99a" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                  {hourlyCostData.length === 0 && (
                    <div className="chart-empty">
                      <span className="empty-icon"><Wallet /></span>
                      <b>No cost trend yet</b>
                      <span>Choose a period with close-together sensor readings.</span>
                    </div>
                  )}
                </div>
                <div className="chart-footer">
                  <span><i className="legend-dot" /> Electricity <i className="legend-dot carbon-legend" /> Green tax</span>
                  <span>{hourlyCostData.length} active hours</span>
                </div>
              </article>
            </section>

            <section className="card cost-reduction-note costs-only">
              <span className="reduction-icon"><Activity /></span>
              <div>
                <b>10% lower-use scenario</b>
                <p>{selectedEnergyCost === null || selectedGreenTax === null ? "A comparison appears when at least two readings or usable power intervals are available for this period." : `At 10% lower use, electricity cost would decrease by ${formatRupees(selectedEnergyCost * 0.1, selectedEnergyCost * 0.1 < 0.1 ? 4 : 2)} and green tax by ${formatRupees(selectedGreenTax * 0.1, selectedGreenTax * 0.1 < 0.1 ? 4 : 2)}.`} Green tax is an illustrative offset allocation, not an assessed tax.</p>
              </div>
            </section>
          </>
        )}

        {/* 4. CARBON GOALS (COLLEGE USAGES & ELECTRICITY TARGETS) */}
        {page === "goals" && (
          <>
            {/* GOAL CONFIGURATION CARD */}
            <section className="card goal-config-card goals-only">
              <div className="card-heading">
                <div>
                  <div className="heading-label"><span className="section-icon"><Target /></span><h2>Campus Electricity Reduction Target &amp; Baseline</h2></div>
                  <p>Set monthly or annual carbon reduction targets for college operations (labs, lecture halls, workshops, hostels) and track live progress against monitored meter readings.</p>
                </div>
                <span className="calculation-tag">CAMPUS USAGE TARGETS</span>
              </div>

              <div className="goal-config-grid">
                {/* Timeframe selector */}
                <div className="goal-field">
                  <label><Clock3 style={{ width: 14, height: 14 }} /> Target Time Horizon</label>
                  <div className="goal-btn-group">
                    <button
                      type="button"
                      className={`goal-toggle-btn ${goalTimeframe === "monthly" ? "active" : ""}`}
                      onClick={() => setGoalTimeframe("monthly")}
                    >
                      Monthly Target (Cycle)
                    </button>
                    <button
                      type="button"
                      className={`goal-toggle-btn ${goalTimeframe === "annual" ? "active" : ""}`}
                      onClick={() => setGoalTimeframe("annual")}
                    >
                      Annual Academic (220 Days)
                    </button>
                  </div>
                </div>

                {/* Target percentage selector */}
                <div className="goal-field">
                  <label><TrendingDown style={{ width: 14, height: 14 }} /> Carbon Cut Target ({goalTargetPct}%)</label>
                  <div className="goal-presets-strip">
                    {[5, 10, 15, 20, 25].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        className={`goal-preset-chip ${pct === 10 ? "featured" : ""} ${goalTargetPct === pct ? "active" : ""}`}
                        onClick={() => setGoalTargetPct(pct)}
                      >
                        {pct === 10 ? "10% (Example Goal)" : `${pct}%`}
                      </button>
                    ))}
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 3, marginLeft: 4 }}>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        step="1"
                        value={goalTargetPct}
                        onChange={e => setGoalTargetPct(Math.max(1, Math.min(50, parseInt(e.target.value) || 10)))}
                        style={{ width: 48, height: 26, fontSize: 10, textAlign: "center", borderRadius: 5, border: "1px solid #dce8e1" }}
                      />
                      <small style={{ fontSize: 8, color: "#607267" }}>%</small>
                    </div>
                  </div>
                </div>

                {/* Baseline emissions setup */}
                <div className="goal-field">
                  <label><Sliders style={{ width: 14, height: 14 }} /> Campus Baseline Footprint ({goalTimeframe === "monthly" ? "kg/mo" : "kg/yr"})</label>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="number"
                      min="100"
                      step="50"
                      value={currentBaselineKg}
                      onChange={e => {
                        const val = Math.max(100, parseFloat(e.target.value) || 1250);
                        if (goalTimeframe === "monthly") setMonthlyBaselineKg(val);
                        else setAnnualBaselineKg(val);
                      }}
                      style={{ height: 32, flex: 1, padding: "0 8px", border: "1px solid #dce8e1", borderRadius: 6, fontSize: 10 }}
                    />
                    <button
                      type="button"
                      className="outline-button"
                      onClick={syncBaselineWithMeter}
                      title="Sync baseline with ELEC-01 meter readings"
                      style={{ height: 32, whiteSpace: "nowrap", padding: "0 9px", fontSize: 8.5 }}
                    >
                      <RefreshCw style={{ width: 11, height: 11 }} /> Sync Meter
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f5fbf7", border: "1px solid #d8ede0", borderRadius: 8, padding: "8px 12px", marginTop: 4 }}>
                <span style={{ fontSize: 8.5, color: "#37624c" }}>
                  💡 College electricity tariff: <b>₹{ELECTRICITY_TARIFF.toFixed(2)}/kWh</b> · Grid carbon factor: <b>{EMISSION_FACTOR.toFixed(2)} kg CO₂e/kWh</b> · Device: <b>{DEVICE_ID}</b>
                </span>
                <span style={{ fontSize: 8.5, fontWeight: 700, color: "#166534" }}>
                  Target Cap: <b>{targetCapKg.toFixed(1)} kg CO₂e</b> (-{goalTargetPct}% Cut)
                </span>
              </div>
            </section>

            {/* DUAL-LAYER PROGRESS PACING HERO BANNER */}
            <section className="goal-progress-banner goals-only">
              <div className="progress-banner-header">
                <div>
                  <span className={`progress-status-pill ${isPacingUnderCap ? "on-track" : "at-risk"}`}>
                    <CheckCircle2 style={{ width: 12, height: 12 }} />
                    {isPacingUnderCap
                      ? `On Track · ${(timeElapsedPct - budgetUsedPct >= 0 ? (timeElapsedPct - budgetUsedPct) : 5).toFixed(1)}% Under Budget`
                      : "Pacing Near Limit · Monitor Load"}
                  </span>
                  <h3>Campus Target: Reduce Electricity Emissions by <span>{goalTargetPct}%</span></h3>
                  <p>
                    Target maximum emissions: <b>{targetCapKg.toFixed(1)} kg CO₂e</b> for this {goalTimeframe} period.
                    Avoiding <b>{targetReductionKg.toFixed(1)} kg CO₂e</b> saves approximately <b>₹{formatNumber(targetSavedINR, 0)}</b> in power charges and offsets <b>{targetTreesOffset.toFixed(1)} trees</b>!
                  </p>
                </div>

                <div className="comparison-metrics-row">
                  <div className="comparison-metric-box">
                    <small>Emitted So Far</small>
                    <b>{currentEmittedKg.toFixed(1)} kg</b>
                    <span>{budgetUsedPct}% of Cap</span>
                  </div>
                  <div className="comparison-metric-box">
                    <small>Carbon Budget Left</small>
                    <b>{remainingBudgetKg.toFixed(1)} kg</b>
                    <span>{Math.max(0, 100 - budgetUsedPct)}% remaining</span>
                  </div>
                  <div className="comparison-metric-box trees">
                    <small>Target Avoided</small>
                    <b>-{targetReductionKg.toFixed(1)} kg</b>
                    <span>-{goalTargetPct}% vs Baseline</span>
                  </div>
                  <div className="comparison-metric-box">
                    <small>Electricity Savings</small>
                    <b>₹{formatNumber(targetSavedINR, 0)}</b>
                    <span>{goalTimeframe === "monthly" ? "per month" : "per year"}</span>
                  </div>
                </div>
              </div>

              {/* Dual Visual Meters */}
              <div className="goal-dual-meter">
                <div className="meter-row">
                  <div className="meter-header">
                    <span>⚡ Carbon Budget Consumed: <b>{currentEmittedKg.toFixed(1)} / {targetCapKg.toFixed(1)} kg CO₂e</b></span>
                    <b>{budgetUsedPct}%</b>
                  </div>
                  <div className="meter-track">
                    <div
                      className={`meter-fill carbon ${budgetUsedPct > 85 ? "warning" : ""}`}
                      style={{ width: `${Math.min(100, Math.max(5, budgetUsedPct))}%` }}
                    />
                  </div>
                </div>

                <div className="meter-row">
                  <div className="meter-header">
                    <span>📅 Timeline Elapsed: <b>Day {dayOfPeriod} of {daysInPeriod}</b></span>
                    <b>{timeElapsedPct}%</b>
                  </div>
                  <div className="meter-track">
                    <div
                      className="meter-fill timeline"
                      style={{ width: `${Math.min(100, Math.max(5, timeElapsedPct))}%` }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#a9d5be", marginTop: 2 }}>
                  <span>Baseline Cap: <b>{currentBaselineKg} kg CO₂e</b></span>
                  <span>{isPacingUnderCap ? "✨ Carbon burn rate is lower than timeline progression (Operating efficiently!)" : "⚠️ Carbon consumption is pacing faster than timeline."}</span>
                  <span>Goal: <b>-{goalTargetPct}% Cut</b></span>
                </div>
              </div>
            </section>

            {/* 4 SUMMARY METRIC CARDS */}
            <section className="insight-summary-grid goals-only">
              <article className="card insight-metric-card">
                <div className="metric-header-row">
                  <span>Target Carbon Cap</span>
                  <span className="reduction-pill">Goal Cap</span>
                </div>
                <b>{targetCapKg.toFixed(1)} kg CO₂e</b>
                <small>Max {goalTimeframe} emission under -{goalTargetPct}% target</small>
              </article>
              <article className="card insight-metric-card">
                <div className="metric-header-row">
                  <span>Carbon Avoided</span>
                  <span className="reduction-pill">-{goalTargetPct}% Cut</span>
                </div>
                <b>-{targetReductionKg.toFixed(1)} kg CO₂e</b>
                <small>Avoided vs {currentBaselineKg} kg campus baseline</small>
              </article>
              <article className="card insight-metric-card">
                <div className="metric-header-row">
                  <span>Tariff Cost Saved</span>
                  <span className="reduction-pill">₹11.80/kWh</span>
                </div>
                <b>₹{formatNumber(targetSavedINR, 0)}</b>
                <small>Saves {targetSavedKwh.toFixed(1)} kWh in campus power bills</small>
              </article>
              <article className="card insight-metric-card">
                <div className="metric-header-row">
                  <span>Tree Offset Equivalent</span>
                  <span className="reduction-pill trees">Green Impact</span>
                </div>
                <b>+{targetTreesOffset.toFixed(1)} Trees</b>
                <small>Annual carbon absorption equivalent</small>
              </article>
            </section>

            {/* COLLEGE USAGES / SECTOR BREAKDOWN */}
            <section className="section-block goals-only">
              <div className="section-top">
                <div>
                  <h2>College Usage Sector Breakdown</h2>
                  <p>Campus electricity emissions and targeted reduction allocations across major university facilities</p>
                </div>
                <span className="freshness-chip">
                  <i className="connected" /> {goalTargetPct}% Reduction Across All Sectors
                </span>
              </div>

              <div className="goal-sectors-grid">
                {sectorData.map(sector => {
                  const IconC = sector.icon;
                  const sectorCapUsedPct = Math.min(100, Math.round((sector.currentKg / (sector.targetKg || 1)) * 100));
                  return (
                    <div key={sector.id} className="goal-sector-card">
                      <div className="sector-top">
                        <div className="sector-icon-box"><IconC style={{ width: 17, height: 17 }} /></div>
                        <span className="sector-share-badge">{sector.sharePct}% Campus Share</span>
                      </div>
                      <div className="sector-name">{sector.name}</div>
                      <div className="sector-values">
                        <div>
                          <small>Current Used</small>
                          <b>{sector.currentKg} <small>kg CO₂e</small></b>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <small>Target Cap</small>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#166534" }}>{sector.targetKg} kg</span>
                        </div>
                      </div>
                      <div className="meter-track" style={{ height: 6 }}>
                        <div
                          className="meter-fill carbon"
                          style={{ width: `${sectorCapUsedPct}%`, background: sector.color }}
                        />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 7.5, color: "#6a7f73" }}>
                        <span>Baseline: {sector.baselineKg} kg</span>
                        <span style={{ fontWeight: 700, color: sector.color }}>{sector.status}</span>
                      </div>
                      <div className="sector-tip">
                        💡 {sector.tips}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* INTERACTIVE CAMPUS CONSERVATION ACTION LEVERS */}
            <section className="card goal-levers-card goals-only">
              <div className="card-heading">
                <div>
                  <div className="heading-label"><span className="section-icon"><Sliders /></span><h2>Campus Conservation Action Levers (Interactive Simulator)</h2></div>
                  <p>Toggle college energy initiatives below to simulate their contribution toward achieving your <b>{goalTargetPct}% reduction goal</b>:</p>
                </div>
                <span className="calculation-tag">INTERACTIVE SIMULATOR</span>
              </div>

              <div className="levers-list">
                {CAMPUS_LEVERS.map(lever => {
                  const IconComp = lever.icon;
                  const isChecked = activeLevers.includes(lever.id);
                  return (
                    <div key={lever.id} className={`lever-item ${isChecked ? "active" : ""}`} onClick={() => toggleLever(lever.id)}>
                      <div className="lever-left">
                        <div className="lever-icon-box"><IconComp style={{ width: 17, height: 17 }} /></div>
                        <div className="lever-copy">
                          <b>{lever.name} <span style={{ fontSize: 7.5, color: "#698274", fontWeight: 500 }}>({lever.category})</span></b>
                          <p>{lever.description}</p>
                        </div>
                      </div>

                      <div className="lever-impact">
                        <span className="lever-impact-tag">-{lever.reductionPct}% CO₂e (-{lever.monthlySavingsKg} kg/mo)</span>
                        <button type="button" className="lever-toggle-btn" onClick={e => { e.stopPropagation(); toggleLever(lever.id); }}>
                          {isChecked ? "✓ Active" : "+ Enable"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className={`levers-feedback-banner ${totalLeverReductionPct >= goalTargetPct ? "achieved" : "progress"}`}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Award style={{ width: 16, height: 16 }} />
                  <span>
                    Simulated Reduction from Active Levers: <b>-{totalLeverReductionPct}% CO₂e</b>
                    {totalLeverReductionPct >= goalTargetPct
                      ? ` · 🎉 Target Achieved! You surpass the ${goalTargetPct}% goal by ${(totalLeverReductionPct - goalTargetPct).toFixed(1)}%!`
                      : ` · 💡 Need ${(goalTargetPct - totalLeverReductionPct).toFixed(1)}% more to reach your ${goalTargetPct}% target.`}
                  </span>
                </div>
                <span>Monthly Savings: <b>₹{formatNumber(CAMPUS_LEVERS.filter(l => activeLevers.includes(l.id)).reduce((sum, l) => sum + (l.monthlySavingsKg / EMISSION_FACTOR) * ELECTRICITY_TARIFF, 0), 0)}</b> / mo</span>
              </div>
            </section>

            {/* MONTHLY TRACKING & COMPARISON CHART */}
            <section className="insights-chart-grid goals-only">
              <article className="card chart-card insight-chart">
                <div className="card-heading">
                  <div>
                    <div className="heading-label"><span className="section-icon"><Target /></span><h2>Campus Electricity Emissions vs Reduction Goal</h2></div>
                    <p>Tracking monthly electricity emissions against the {goalTargetPct}% target cap ({goalTimeframe === "monthly" ? "Monthly" : "Annual"})</p>
                  </div>
                </div>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={goalsChartData} margin={{ top: 15, right: 13, left: 0, bottom: 3 }}>
                      <CartesianGrid stroke="#edf1ee" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: "#87938b", fontSize: 9 }} minTickGap={10} axisLine={{ stroke: "#e8eeea" }} tickLine={false} />
                      <YAxis tickFormatter={v => `${v} kg`} tick={{ fill: "#87938b", fontSize: 9 }} axisLine={false} tickLine={false} width={48} />
                      <Tooltip formatter={(value, name) => [`${value} kg CO₂e`, name === "actual" ? "Actual / Projected Usage" : name === "target" ? `Target Cap (-${goalTargetPct}%)` : "Baseline Usage"]} />
                      <ReferenceLine y={targetCapKg} stroke="#16a34a" strokeDasharray="3 3" label={{ value: `Goal Cap: ${Math.round(targetCapKg)} kg`, fill: "#16a34a", fontSize: 9, position: "top" }} />
                      <Bar dataKey="actual" name="Actual / Proj. (kg)" radius={[4, 4, 0, 0]} maxBarSize={38} isAnimationActive={false}>
                        {goalsChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.actual <= entry.target ? "#168459" : entry.actual <= entry.baseline ? "#eab308" : "#ef4444"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-footer">
                  <span><i className="legend-dot" style={{ background: "#168459" }} /> Green: Met Target &nbsp; <i className="legend-dot" style={{ background: "#eab308" }} /> Amber: Under Baseline &nbsp; <i className="legend-dot" style={{ background: "#16a34a" }} /> Dashed: Goal Cap</span>
                  <span>Target: <b>-{goalTargetPct}% ({Math.round(targetCapKg)} kg CO₂e)</b></span>
                </div>
              </article>

              <article className="card insight-observation" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div className="settings-strip-icon"><Target /></div>
                  <div>
                    <b>Campus Carbon Reduction Analysis</b>
                    <p style={{ marginTop: 6, fontSize: 9, lineHeight: 1.6, color: "#627369" }}>
                      Reducing campus electricity emissions by <b>{goalTargetPct}%</b> avoids <b>{targetReductionKg.toFixed(1)} kg CO₂e</b> for the chosen {goalTimeframe} period.
                      This eliminates <b>{targetSavedKwh.toFixed(1)} kWh</b> of grid electricity, saving <b>₹{formatNumber(targetSavedINR, 0)}</b> in power charges and matching the carbon absorbed by <b>{targetTreesOffset.toFixed(1)} mature trees</b>!
                    </p>
                  </div>
                </div>

                <div style={{ background: "#f2faf5", border: "1px solid #d4eae0", borderRadius: 8, padding: 12, marginTop: 14 }}>
                  <b style={{ fontSize: 10, color: "#16583d" }}>🎯 Campus Energy Conservation Action Plan:</b>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 8, color: "#456052", display: "grid", gap: 4 }}>
                    <li><b>Off-Hours Lab Shutdown:</b> Enabling auto-sleep on computer lab GPUs cuts university idle power by <b>4.2%</b>.</li>
                    <li><b>Thermostat Optimization:</b> Maintaining classrooms at 24°C instead of 21°C saves <b>5.5%</b> of overall campus electricity.</li>
                    <li><b>Rooftop Solar Integration:</b> Offsetting grid draw during afternoon peak hours cuts emissions by up to <b>8.5%</b>.</li>
                  </ul>
                </div>
              </article>
            </section>

            {/* CAMPUS SUSTAINABILITY MILESTONES & BADGES */}
            <div className="goal-milestones-row goals-only">
              <div className="goal-milestone-card">
                <div className="milestone-icon"><Target /></div>
                <div>
                  <b>10% Carbon Reduction Target</b>
                  <small>Active institutional goal</small>
                </div>
              </div>
              <div className="goal-milestone-card">
                <div className="milestone-icon"><ShieldCheck /></div>
                <div>
                  <b>Sub-400W Nighttime Standby</b>
                  <small>Zero phantom load in labs</small>
                </div>
              </div>
              <div className="goal-milestone-card">
                <div className="milestone-icon"><Award /></div>
                <div>
                  <b>Green Campus Lab Protocol</b>
                  <small>Department energy certified</small>
                </div>
              </div>
              <div className="goal-milestone-card">
                <div className="milestone-icon"><Leaf /></div>
                <div>
                  <b>Renewable Microgrid Ready</b>
                  <small>Rooftop solar integrated</small>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 5. CAMPUS AUDIT TAB (MAINTAIN UTILITY BILLS, WASTE LOGS, EMISSION FACTORS & SUPPORTING DOCS) */}
        {page === "audit" && (
          <>
            {/* AUDIT SUMMARY KPI METRICS */}
            <section className="insight-summary-grid audit-only">
              <article className="card insight-metric-card">
                <div className="metric-header-row">
                  <span>Net Audited Footprint</span>
                  <span className="reduction-pill">GHG Registry</span>
                </div>
                <b>{formatNumber(auditTotals.netCarbonKg, 1)} kg CO₂e</b>
                <small>{auditTotals.netCarbonTons} t CO₂e total verified footprint</small>
              </article>

              <article className="card insight-metric-card">
                <div className="metric-header-row">
                  <span>Electricity Bills</span>
                  <span className="reduction-pill">{auditTotals.netCarbonKg > 0 ? Math.round((auditTotals.electricityKg / auditTotals.netCarbonKg) * 100) : 0}% Share</span>
                </div>
                <b>{formatNumber(auditTotals.electricityKg, 1)} kg CO₂e</b>
                <small>{formatNumber(auditTotals.electricityKwh, 0)} kWh @ {PREDEFINED_EMISSION_FACTORS.electricityKwh} kg/kWh</small>
              </article>

              <article className="card insight-metric-card">
                <div className="metric-header-row">
                  <span>Water Supply</span>
                  <span className="reduction-pill">Pumping &amp; Supply</span>
                </div>
                <b>{formatNumber(auditTotals.waterKg, 1)} kg CO₂e</b>
                <small>{formatNumber(auditTotals.waterKl, 0)} kL @ {PREDEFINED_EMISSION_FACTORS.waterKl} kg/kL</small>
              </article>

              <article className="card insight-metric-card">
                <div className="metric-header-row">
                  <span>Solid Waste &amp; Offsets</span>
                  <span className="reduction-pill trees">Net Waste</span>
                </div>
                <b>{formatNumber(auditTotals.wasteKg + auditTotals.recyclingCreditKg, 1)} kg CO₂e</b>
                <small>{formatNumber(auditTotals.wasteTotalMass, 0)} kg waste · {auditTotals.recyclingCreditKg} kg offset</small>
              </article>
            </section>

            {/* UPLOAD & AUDIT BILL INGESTION CARD */}
            <section className="card audit-upload-card audit-only">
              <div className="card-heading">
                <div>
                  <div className="heading-label"><span className="section-icon"><UploadCloud /></span><h2>Upload &amp; Log Campus Utility Bill for Audit</h2></div>
                  <p>Attach supporting utility bills (electricity, municipal water, garbage manifests) and calculate carbon emissions automatically.</p>
                </div>
                <span className="calculation-tag">AUTOMATIC GHG CALCULATOR</span>
              </div>

              {uploadSuccessMsg && (
                <div className="audit-success-banner">
                  <span>{uploadSuccessMsg}</span>
                </div>
              )}

              <form onSubmit={handleAddAuditRecord} className="audit-form-grid">
                {/* 1. Category selector */}
                <div className="audit-form-field">
                  <label><Building2 style={{ width: 13, height: 13 }} /> Audit Bill / Record Category</label>
                  <div className="audit-category-btn-group">
                    <button
                      type="button"
                      className={`audit-category-toggle ${uploadCategory === "electricity" ? "active" : ""}`}
                      onClick={() => setUploadCategory("electricity")}
                    >
                      <Zap style={{ width: 12, height: 12 }} /> Electricity Bill
                    </button>
                    <button
                      type="button"
                      className={`audit-category-toggle ${uploadCategory === "water" ? "active" : ""}`}
                      onClick={() => setUploadCategory("water")}
                    >
                      <Droplets style={{ width: 12, height: 12 }} /> Water Bill
                    </button>
                    <button
                      type="button"
                      className={`audit-category-toggle ${uploadCategory === "waste" ? "active" : ""}`}
                      onClick={() => setUploadCategory("waste")}
                    >
                      <Trash2 style={{ width: 12, height: 12 }} /> Garbage Record
                    </button>
                    <button
                      type="button"
                      className={`audit-category-toggle ${uploadCategory === "recycling" ? "active" : ""}`}
                      onClick={() => setUploadCategory("recycling")}
                    >
                      <Leaf style={{ width: 12, height: 12 }} /> Recycling Credit
                    </button>
                  </div>
                </div>

                {/* 2. File Upload Dropzone */}
                <div className="audit-form-field">
                  <label><FileText style={{ width: 13, height: 13 }} /> Supporting Document (PDF / Bill Scan / Receipt)</label>
                  <div
                    className="audit-dropzone"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx"
                      style={{ display: "none" }}
                    />
                    {uploadFile ? (
                      <div className="dropzone-file-selected">
                        <FileSpreadsheet style={{ width: 22, height: 22, color: "#168459" }} />
                        <div>
                          <b>{uploadFile.name}</b>
                          <small>{uploadFile.size} · Click to replace document</small>
                        </div>
                      </div>
                    ) : (
                      <div className="dropzone-placeholder">
                        <UploadCloud style={{ width: 22, height: 22, color: "#4f7562" }} />
                        <div>
                          <b>Click to upload or drag &amp; drop supporting bill</b>
                          <small>Supports PDF, PNG, JPG, or CSV (Utility bills, weighbridge slips)</small>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Bill Title and Invoice Ref */}
                <div className="audit-fields-row">
                  <div className="audit-field">
                    <label>Bill Title / Description</label>
                    <input
                      type="text"
                      placeholder={`e.g. ${uploadCategory === "electricity" ? "Campus Main Substation Bill" : uploadCategory === "water" ? "Municipal Water Supply Manifest" : "Solid Waste Landfill Collection"}`}
                      value={uploadTitle}
                      onChange={e => setUploadTitle(e.target.value)}
                    />
                  </div>

                  <div className="audit-field">
                    <label>Invoice / Manifest Ref #</label>
                    <input
                      type="text"
                      placeholder="e.g. MSEDCL-2026-10-9182"
                      value={uploadInvoiceNo}
                      onChange={e => setUploadInvoiceNo(e.target.value)}
                    />
                  </div>

                  <div className="audit-field">
                    <label>Billing Period</label>
                    <input
                      type="text"
                      placeholder="e.g. October 2026"
                      value={uploadBillingPeriod}
                      onChange={e => setUploadBillingPeriod(e.target.value)}
                    />
                  </div>

                  <div className="audit-field">
                    <label>Invoice / Slip Date</label>
                    <input
                      type="date"
                      value={uploadDate}
                      onChange={e => setUploadDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* 4. Quantity, Cost, Vendor, Notes */}
                <div className="audit-fields-row">
                  <div className="audit-field">
                    <label>
                      Billed Consumption / Quantity ({currentQuantityUnit})
                      <span style={{ color: "#15803d", fontWeight: 700 }}> *</span>
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <input
                        type="number"
                        min="0.1"
                        step="any"
                        placeholder={`e.g. ${uploadCategory === "electricity" ? "1200" : uploadCategory === "water" ? "250" : "400"}`}
                        value={uploadQuantity}
                        onChange={e => setUploadQuantity(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)}
                        required
                        style={{ flex: 1 }}
                      />
                      <span className="unit-badge">{currentQuantityUnit}</span>
                    </div>
                  </div>

                  <div className="audit-field">
                    <label>Bill Amount (₹ INR)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="e.g. 14160"
                      value={uploadCostINR}
                      onChange={e => setUploadCostINR(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  <div className="audit-field">
                    <label>Vendor / Utility Agency</label>
                    <input
                      type="text"
                      placeholder="e.g. State Electricity Board / City Water Works"
                      value={uploadVendor}
                      onChange={e => setUploadVendor(e.target.value)}
                    />
                  </div>

                  <div className="audit-field">
                    <label>Auditor Verification Notes</label>
                    <input
                      type="text"
                      placeholder="e.g. Reconciled with meter logs"
                      value={uploadNotes}
                      onChange={e => setUploadNotes(e.target.value)}
                    />
                  </div>
                </div>

                {/* 5. Live Carbon Calculation Preview Box */}
                <div className="audit-calc-preview">
                  <div className="calc-preview-left">
                    <span className="calc-factor-tag">
                      Factor Applied: <b>{currentActiveFactor} kg CO₂e / {currentQuantityUnit}</b>
                      {uploadCategory === "electricity" ? " (CEA Grid Factor)" : uploadCategory === "water" ? " (Pumping & Aeration Factor)" : uploadCategory === "recycling" ? " (Avoided Virgin Material Credit)" : " (CPCB Landfill GHG Factor)"}
                    </span>
                    <div className="calc-formula-display">
                      <span>Formula: </span>
                      <code>{(typeof uploadQuantity === "number" ? uploadQuantity : 0)} {currentQuantityUnit} × {currentActiveFactor} kg CO₂e/{currentQuantityUnit}</code>
                    </div>
                  </div>

                  <div className="calc-preview-result">
                    <small>Calculated Carbon Emissions</small>
                    <b className={currentCalculatedEmissions < 0 ? "credit" : ""}>
                      {currentCalculatedEmissions >= 0 ? "+" : ""}{currentCalculatedEmissions} <small>kg CO₂e</small>
                    </b>
                    <span>Syncs directly to Live Monitoring Dashboard</span>
                  </div>
                </div>

                {/* 6. Form Footer / Submit */}
                <div className="audit-form-footer">
                  <div style={{ fontSize: 8.5, color: "#637a6d" }}>
                    ℹ️ Uploaded document and calculated footprint will be stored in your institutional audit registry and immediately update live dashboard totals.
                  </div>
                  <button type="submit" className="primary-action-btn">
                    <PlusCircle style={{ width: 14, height: 14 }} /> Upload Bill &amp; Calculate Carbon Emissions
                  </button>
                </div>
              </form>
            </section>

            {/* AUDIT RECORDS REGISTRY TABLE */}
            <section className="card audit-table-card audit-only">
              <div className="card-heading">
                <div>
                  <div className="heading-label"><span className="section-icon"><ClipboardCheck /></span><h2>Campus Sustainability Audit Records Registry</h2></div>
                  <p>Verified invoices, manifests, and documentation supporting statutory Green Audits &amp; ISO 14064 compliance.</p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button type="button" className="outline-button" onClick={exportAuditCSV} title="Export Audit Records to CSV">
                    <Download style={{ width: 12, height: 12 }} /> Export Audit (CSV)
                  </button>
                </div>
              </div>

              {/* Filtering Toolbar */}
              <div className="audit-table-toolbar">
                <div className="audit-filter-chips">
                  {(["all", "electricity", "water", "waste", "recycling"] as const).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      className={`audit-filter-chip ${auditCategoryFilter === cat ? "active" : ""}`}
                      onClick={() => setAuditCategoryFilter(cat)}
                    >
                      {cat === "all" ? `All (${auditRecords.length})` : cat === "electricity" ? `⚡ Electricity (${auditRecords.filter(r => r.category === "electricity").length})` : cat === "water" ? `💧 Water (${auditRecords.filter(r => r.category === "water").length})` : cat === "waste" ? `🗑️ Garbage (${auditRecords.filter(r => r.category === "waste").length})` : `♻️ Recycling (${auditRecords.filter(r => r.category === "recycling").length})`}
                    </button>
                  ))}
                </div>

                <div className="audit-search-box">
                  <Search style={{ width: 12, height: 12, color: "#6a7f73" }} />
                  <input
                    type="search"
                    placeholder="Search by invoice #, title, or vendor..."
                    value={auditSearchQuery}
                    onChange={e => setAuditSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Registry Table */}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ref / Invoice #</th>
                      <th>Category &amp; Record</th>
                      <th>Billing Period</th>
                      <th>Billed Quantity</th>
                      <th>Emission Factor</th>
                      <th>Calculated Carbon (kg CO₂e)</th>
                      <th>Amount (₹)</th>
                      <th>Supporting Document</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAuditRecords.length === 0 ? (
                      <tr className="empty-row">
                        <td colSpan={10}>
                          <div className="table-empty">
                            <span className="empty-mini"><FileText /></span>
                            <b>No audit records found matching this filter</b>
                            <span>Use the upload form above to add an electricity, water, or garbage collection bill.</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredAuditRecords.map(rec => (
                        <tr key={rec.id}>
                          <td>
                            <code style={{ fontSize: 9, fontWeight: 700, color: "#16583d" }}>{rec.invoiceNo}</code>
                            <div style={{ fontSize: 7.5, color: "#74887d" }}>{rec.date}</div>
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span className={`cat-icon-chip ${rec.category}`}>
                                {rec.category === "electricity" ? <Zap style={{ width: 11, height: 11 }} /> : rec.category === "water" ? <Droplets style={{ width: 11, height: 11 }} /> : rec.category === "recycling" ? <Leaf style={{ width: 11, height: 11 }} /> : <Trash2 style={{ width: 11, height: 11 }} />}
                              </span>
                              <div>
                                <b>{rec.title}</b>
                                <div style={{ fontSize: 7.5, color: "#6d8176" }}>{rec.vendorOrFacility}</div>
                              </div>
                            </div>
                          </td>
                          <td>{rec.billingPeriod}</td>
                          <td>
                            <b>{formatNumber(rec.quantity, 1)}</b> <small>{rec.unit}</small>
                          </td>
                          <td>
                            <code style={{ fontSize: 8.5 }}>{rec.emissionFactor} kg/{rec.unit}</code>
                          </td>
                          <td>
                            <span className={`carbon-cell-pill ${rec.carbonEmissionsKg < 0 ? "credit" : rec.category === "electricity" ? "elec" : rec.category === "waste" ? "waste" : "water"}`}>
                              {rec.carbonEmissionsKg >= 0 ? "+" : ""}{formatNumber(rec.carbonEmissionsKg, 1)} kg CO₂e
                            </span>
                          </td>
                          <td>{rec.costINR > 0 ? `₹${formatNumber(rec.costINR, 0)}` : "—"}</td>
                          <td>
                            <div className="audit-doc-chip" title={`Supporting document: ${rec.documentName}`}>
                              <FileText style={{ width: 11, height: 11 }} />
                              <span className="doc-name">{rec.documentName || "Bill_Receipt.pdf"}</span>
                              <small>{rec.documentSize || "1.2 MB"}</small>
                            </div>
                          </td>
                          <td>
                            <span className={`audit-status-badge ${rec.status}`}>
                              <CheckCircle2 style={{ width: 10, height: 10 }} /> {rec.status === "verified" ? "Verified" : rec.status === "audited" ? "Audited" : "Pending"}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="delete-record-btn"
                              onClick={() => handleDeleteAuditRecord(rec.id)}
                              title="Delete this audit record"
                            >
                              <Trash2 style={{ width: 12, height: 12 }} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="audit-table-footer">
                <span>Showing <b>{filteredAuditRecords.length}</b> of <b>{auditRecords.length}</b> sustainability records · All records are linked to the live GHG accounting model.</span>
                {auditRecords.length > 0 && (
                  <button
                    type="button"
                    className="text-action"
                    style={{ color: "#b91c1c" }}
                    onClick={() => {
                      if (confirm("Are you sure you want to clear all audit records?")) {
                        setAuditRecords([]);
                      }
                    }}
                  >
                    <Trash2 style={{ width: 11, height: 11 }} /> Clear All Records
                  </button>
                )}
              </div>
            </section>

            {/* PREDEFINED STATUTORY GHG EMISSION FACTORS REFERENCE */}
            <section className="card audit-factors-card audit-only">
              <div className="card-heading">
                <div>
                  <div className="heading-label"><span className="section-icon"><ShieldCheck /></span><h2>Predefined Campus GHG Emission Factors</h2></div>
                  <p>Predefined statutory baseline factors used across CARBengine to convert utility bills and solid waste quantities into kg CO₂e.</p>
                </div>
                <span className="calculation-tag predefined-badge">PREDEFINED CO₂e BASELINE</span>
              </div>

              <div className="factors-grid">
                <div className="factor-card predefined-card">
                  <div className="factor-top">
                    <span className="factor-icon elec"><Zap style={{ width: 14, height: 14 }} /></span>
                    <span className="factor-source">CEA Baseline v20</span>
                  </div>
                  <b>Grid Electricity Factor</b>
                  <p>Scope 2 indirect emissions per kWh consumed from regional distribution grid.</p>
                  <div className="predefined-factor-display">
                    <span className="factor-val">0.82</span>
                    <span className="factor-unit">kg CO₂e / kWh</span>
                  </div>
                </div>

                <div className="factor-card predefined-card">
                  <div className="factor-top">
                    <span className="factor-icon water"><Droplets style={{ width: 14, height: 14 }} /></span>
                    <span className="factor-source">Water Works Standard</span>
                  </div>
                  <b>Municipal Water Factor</b>
                  <p>Energy for municipal raw water pumping, sand filtration, and campus distribution.</p>
                  <div className="predefined-factor-display">
                    <span className="factor-val">0.38</span>
                    <span className="factor-unit">kg CO₂e / kL</span>
                  </div>
                </div>

                <div className="factor-card predefined-card">
                  <div className="factor-top">
                    <span className="factor-icon waste"><Trash2 style={{ width: 14, height: 14 }} /></span>
                    <span className="factor-source">CPCB / IPCC Guidelines</span>
                  </div>
                  <b>Landfill Solid Waste Factor</b>
                  <p>Methane generation and transport emissions per kg of unsegregated solid waste.</p>
                  <div className="predefined-factor-display">
                    <span className="factor-val">1.85</span>
                    <span className="factor-unit">kg CO₂e / kg</span>
                  </div>
                </div>

                <div className="factor-card predefined-card">
                  <div className="factor-top">
                    <span className="factor-icon offset"><Leaf style={{ width: 14, height: 14 }} /></span>
                    <span className="factor-source">ISO 14044 LCA Credit</span>
                  </div>
                  <b>Scrap Recycling Credit Factor</b>
                  <p>Avoided virgin resource extraction emissions credit for segregated paper and metal scrap.</p>
                  <div className="predefined-factor-display credit">
                    <span className="factor-val">-0.80</span>
                    <span className="factor-unit">kg CO₂e / kg (Credit)</span>
                  </div>
                </div>
              </div>
            </section>

            {/* AUDIT COMPLIANCE & STANDARDS CERTIFICATION BANNER */}
            <div className="goal-milestones-row audit-only">
              <div className="goal-milestone-card">
                <div className="milestone-icon"><ClipboardCheck /></div>
                <div>
                  <b>NAAC Green Audit Ready</b>
                  <small>Criterion 7 Environment Registry</small>
                </div>
              </div>
              <div className="goal-milestone-card">
                <div className="milestone-icon"><ShieldCheck /></div>
                <div>
                  <b>ISO 14064-1 Compliant</b>
                  <small>Scope 1 &amp; Scope 2 GHG protocol</small>
                </div>
              </div>
              <div className="goal-milestone-card">
                <div className="milestone-icon"><Award /></div>
                <div>
                  <b>Supporting Bills Verified</b>
                  <small>{auditTotals.verifiedCount} authenticated invoices</small>
                </div>
              </div>
              <div className="goal-milestone-card">
                <div className="milestone-icon"><Leaf /></div>
                <div>
                  <b>Live Dashboard Synced</b>
                  <small>Real-time telemetry reconciliation</small>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 5. DEVICE HEALTH & SETTINGS TAB */}
        {page === "device" && (
          <>
            <section className="primary-grid">
              <article className="card device-card" id="device-card">
                <div className="card-heading">
                  <div>
                    <div className="heading-label"><span className="section-icon"><Cpu /></span><h2>Device health</h2></div>
                    <p>Upload freshness from recorded_at</p>
                  </div>
                  <span className={`health-badge ${health}`}><i />{health === "connected" ? "Connected" : health === "delayed" ? "Delayed" : health === "offline" ? "Offline" : "Waiting"}</span>
                </div>
                <div className="health-summary">
                  <span className={`health-orb ${health}`}><Cpu /></span>
                  <div>
                    <b>{health === "connected" ? "Receiving sensor data" : health === "delayed" ? "Readings are delayed" : health === "offline" ? "No recent device data" : "Waiting for ELEC-01"}</b>
                    <small>{latest ? `Last measurement ${ago(now - timeMs(latest))}` : "Device status appears after its first reading."}</small>
                  </div>
                </div>
                <dl className="device-details">
                  <div><dt>Device ID</dt><dd>{DEVICE_ID}</dd></div>
                  <div><dt>Last recorded</dt><dd>{latest ? `${formatTime(latest.recorded_at, true)} IST` : "—"}</dd></div>
                  <div><dt>Frequency</dt><dd>{latest?.frequency_hz == null ? "—" : `${formatNumber(latest.frequency_hz, 2)} Hz`}</dd></div>
                  <div><dt>Power factor</dt><dd>{latest?.power_factor == null ? "—" : formatNumber(latest.power_factor, 2)}</dd></div>
                  <div><dt>Database</dt><dd>{supabaseConfigured ? "Supabase" : "Not configured"}</dd></div>
                </dl>
                <div className="health-rule"><i className="rule-dot" />Fresh ≤15s <i className="rule-dot amber-dot" />Delayed 15–60s <i className="rule-dot red-dot" />Offline &gt;60s</div>
              </article>
            </section>

            <section className="card readings-card">
              <div className="card-heading readings-heading">
                <div>
                  <div className="heading-label"><span className="section-icon"><Clock3 /></span><h2>Recent readings</h2></div>
                  <p>Newest database records first</p>
                </div>
                <div className="readings-tools">
                  <label className="table-search"><Search /><input type="search" placeholder="Filter readings" aria-label="Filter readings" value={filter} onChange={event => setFilter(event.target.value)} /></label>
                  <span className="row-count">{tableRows.length} shown</span>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Recorded (IST)</th><th>Voltage</th><th>Current</th><th>Power</th><th>Energy</th><th>Frequency</th><th>Power factor</th></tr>
                  </thead>
                  <tbody>
                    {tableRows.length === 0 ? (
                      <tr className="empty-row"><td colSpan={7}><div className="table-empty"><span className="empty-mini"><Activity /></span><b>{filter ? "No readings match that filter" : "Waiting for your first ELEC-01 reading"}</b><span>{filter ? "Try another time or measurement." : "When the database returns data, it will be listed here."}</span></div></td></tr>
                    ) : (
                      tableRows.map(reading => (
                        <tr key={rowKey(reading)}>
                          <td>{formatTime(reading.recorded_at)}</td>
                          <td>{formatNumber(reading.voltage_v, 1)} V</td>
                          <td>{formatNumber(reading.current_a, 2)} A</td>
                          <td>{formatNumber(reading.power_w, 1)} W</td>
                          <td>{formatNumber(reading.energy_kwh, 3)} kWh</td>
                          <td>{reading.frequency_hz == null ? "—" : `${formatNumber(reading.frequency_hz, 2)} Hz`}</td>
                          <td>{reading.power_factor == null ? "—" : formatNumber(reading.power_factor, 2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="readings-footer">
                <span>Readings are filtered to device {DEVICE_ID}. Timestamps are displayed in IST.</span>
                <button className="text-action" onClick={() => setRefreshKey(key => key + 1)}>Refresh <RefreshCw /></button>
              </div>
            </section>

            <section className="settings-strip" id="connection-card">
              <div className="settings-strip-icon"><Cpu /></div>
              <div>
                <b>Supabase connection</b>
                <p>{!supabaseConfigured ? <>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in <code>.env.local</code>. The browser uses read-only access for device {DEVICE_ID}.</> : serviceState === "error" ? error : realtimeConnected ? `Connected to Supabase Realtime and listening for ${DEVICE_ID}.` : "Project configured. Waiting for the Realtime subscription to connect."}</p>
              </div>
              <button className="outline-button" onClick={() => setRefreshKey(key => key + 1)} disabled={!supabaseConfigured}><RefreshCw /> Refresh data</button>
            </section>
          </>
        )}
        <footer className="page-footer"><span>CARBengine <span className="footer-sep">·</span> {pageHeading.title}</span><span>{realtimeConnected ? "Supabase Realtime" : supabaseConfigured ? "Connecting to Supabase" : "Cloud connection pending"}<i className={realtimeConnected ? "connected" : ""} /></span></footer>
      </div>
    </main>
  </div>;
}
