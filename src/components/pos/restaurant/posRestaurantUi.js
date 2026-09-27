import { KITCHEN_STATUS, TABLE_STATUS_META } from "@shared/pos/restaurant.js";

/** Visual tokens per table-status tone. One place so floor, orders and panel agree. */
const TONE_CLASS = {
  free: "border-emerald-500/40 bg-emerald-500/5 text-foreground",
  busy: "border-sky-500/50 bg-sky-500/10 text-foreground",
  kitchen: "border-amber-500/60 bg-amber-500/10 text-foreground",
  ready: "border-emerald-600 bg-emerald-500/20 text-foreground",
  bill: "border-violet-500/60 bg-violet-500/10 text-foreground",
  cleaning: "border-dashed border-muted-foreground/40 bg-muted/50 text-muted-foreground",
};

const DOT_CLASS = {
  free: "bg-emerald-500",
  busy: "bg-sky-500",
  kitchen: "bg-amber-500",
  ready: "bg-emerald-600",
  bill: "bg-violet-500",
  cleaning: "bg-muted-foreground",
};

export function tableTone(status) {
  return TABLE_STATUS_META[status]?.tone || "free";
}

export function tableToneClass(status) {
  return TONE_CLASS[tableTone(status)];
}

export function tableDotClass(status) {
  return DOT_CLASS[tableTone(status)];
}

export function tableStatusLabel(status) {
  return TABLE_STATUS_META[status]?.label || "Available";
}

export function clockTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function minutesLabel(minutes) {
  if (minutes == null) return "";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  return `${h}h ${minutes % 60}m`;
}

/** KOT lifecycle on the kitchen display: New → Preparing → Ready → served / collected (completed). */
export const KITCHEN_COLUMNS = [
  { status: KITCHEN_STATUS.NEW, title: "New", action: { next: KITCHEN_STATUS.PREPARING, label: "Start preparing" }, tone: "border-sky-500/50" },
  { status: KITCHEN_STATUS.PREPARING, title: "Preparing", action: { next: KITCHEN_STATUS.READY, label: "Mark ready" }, tone: "border-amber-500/60" },
  { status: KITCHEN_STATUS.READY, title: "Ready", action: { next: KITCHEN_STATUS.COMPLETED, label: "Served" }, tone: "border-emerald-600" },
];
