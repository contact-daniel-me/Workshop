// Pure attendance rules — shared by dashboards and Excel exports.
export type AttStatus = "present" | "pending" | "excused" | "absent" | "rejected";
export type DayState = "Present" | "Absent" | "Pending" | "Excused" | "Open" | "Not Held";

export interface Settings {
  name: string;
  start_date: string; // YYYY-MM-DD
  duration_days: number;
  qr_validity_minutes: number;
  require_selfie: boolean;
  low_attendance_threshold: number;
}

export const TZ = "Asia/Kolkata";
export const SESSION_START_HOUR = 0; // 12:00 AM (Midnight)

export function getKolkataTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10);
  const day = parseInt(map.day, 10);
  let hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0;
  const minute = parseInt(map.minute, 10);
  const second = parseInt(map.second, 10);

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    todayDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

/**
 * Returns the ISO string of the target 12:00 AM (Midnight) IST for QR generation.
 * - When already marked today, the next session QR generates tomorrow at 12:00 AM (midnight: 00:00:00 IST).
 * - If not yet marked today, the session QR starts at 12:00 AM (midnight: 00:00:00 IST) of the target day.
 */
export function getNextSessionUnlockTime(todayDate: string, isAlreadyMarked: boolean, _now = new Date()): string {
  if (isAlreadyMarked) {
    return `${addDays(todayDate, 1)}T00:00:00+05:30`;
  }
  return `${todayDate}T00:00:00+05:30`;
}

export function todayLocal(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function workshopDays(s: Pick<Settings, "start_date" | "duration_days">): string[] {
  return Array.from({ length: s.duration_days }, (_, i) => addDays(s.start_date, i));
}

export function dayState(day: string, today: string, status?: AttStatus | null): DayState {
  if (status === "present") return "Present";
  if (status === "excused") return "Excused";
  if (status === "pending") return "Pending";
  if (status === "absent" || status === "rejected") return day <= today ? "Absent" : "Not Held";
  if (day < today) return "Absent";
  if (day === today) return "Open";
  return "Not Held";
}

export interface Summary {
  present: number;
  absent: number;
  pending: number;
  excused: number;
  remaining: number;
  eligible: number; // denominator for current %
  total: number; // denominator for final %
  currentPct: number;
  finalPct: number;
  states: { day: string; state: DayState }[];
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Current % = present / eligible days so far. Eligible = closed days (before today)
 * plus today only if it already counts as present. Pending never counts as present.
 * Excused days are removed from the denominator.
 */
export function summarize(
  s: Pick<Settings, "start_date" | "duration_days">,
  records: { day_date: string; status: AttStatus }[],
  today: string = todayLocal(),
): Summary {
  const byDay = new Map(records.map((r) => [r.day_date, r.status]));
  const states = workshopDays(s).map((day) => ({ day, state: dayState(day, today, byDay.get(day)) }));
  const count = (st: DayState) => states.filter((x) => x.state === st).length;
  const present = count("Present");
  const absent = count("Absent");
  const pending = count("Pending");
  const excused = count("Excused");
  const remaining = count("Not Held") + count("Open");
  const closedNonExcused = states.filter(
    (x) => x.day < today && x.state !== "Excused",
  ).length;
  const todayPresent = states.some((x) => x.day === today && x.state === "Present") ? 1 : 0;
  const eligible = closedNonExcused + todayPresent;
  const total = s.duration_days - excused;
  return {
    present,
    absent,
    pending,
    excused,
    remaining,
    eligible,
    total,
    currentPct: eligible ? round2((present / eligible) * 100) : 0,
    finalPct: total ? round2((present / total) * 100) : 0,
    states,
  };
}

/** Neutralise spreadsheet formula injection for user-controlled strings. */
export function safeCell(v: unknown): string | number {
  if (typeof v === "number") return v;
  const s = v == null ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

export const INDIAN_PHONE = /^(?:\+91)?[6-9]\d{9}$/;
export function normalizePhone(p: string) {
  let digits = p.replace(/[\s\-()]/g, "");
  if (digits.startsWith("+91")) digits = digits.slice(3);
  else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return digits;
}
