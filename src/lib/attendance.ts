// Pure attendance rules — shared by dashboards and Excel exports.
export type AttStatus = "present" | "pending" | "excused" | "absent" | "rejected";
export type DayState = "Present" | "Absent" | "Pending" | "Excused" | "Open" | "Not Held" | "Holiday";

export interface WorkshopCalendarDay {
  date: string; // YYYY-MM-DD
  dayNumber: number | null; // e.g. 1, 2, 3... or null for holidays
  isActive: boolean; // true = Active workshop day, false = Holiday / Non-working
  holidayReason?: string | null;
  isToday: boolean;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  dayName: string; // "Sun", "Mon", etc.
}

export interface WorkshopDayRecord {
  day_date: string;
  is_active: boolean;
  topic?: string | null;
  day_number?: number | null;
}

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

/**
 * Computes the workshop timeline with active days and holidays.
 * Holidays do NOT increment the active day number.
 * Active days are assigned sequential day numbers (Day 1, Day 2, Day 3...).
 * The timeline automatically encompasses the configured duration_days of active sessions.
 */
export function computeWorkshopSchedule(
  s: Pick<Settings, "start_date" | "duration_days">,
  configuredDays: WorkshopDayRecord[] | Record<string, { is_active: boolean; topic?: string | null }> = {},
  today: string = todayLocal()
): WorkshopCalendarDay[] {
  const configMap = new Map<string, { is_active: boolean; topic?: string | null }>();
  if (Array.isArray(configuredDays)) {
    configuredDays.forEach((d) => {
      configMap.set(d.day_date, { is_active: d.is_active, topic: d.topic });
    });
  } else if (configuredDays && typeof configuredDays === "object") {
    Object.entries(configuredDays).forEach(([k, v]) => {
      configMap.set(k, v);
    });
  }

  const schedule: WorkshopCalendarDay[] = [];
  let currentDate = s.start_date;
  let activeCount = 0;
  const targetActiveDays = Math.max(1, s.duration_days || 30);
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Safeguard against infinite loops: at most 365 calendar days
  let iteration = 0;
  while (activeCount < targetActiveDays && iteration < 365) {
    iteration++;
    const cfg = configMap.get(currentDate);
    const isExplicitlyInactive = cfg ? cfg.is_active === false : false;
    const dt = new Date(currentDate + "T00:00:00Z");
    const dayOfWeek = dt.getUTCDay();

    if (isExplicitlyInactive) {
      schedule.push({
        date: currentDate,
        dayNumber: null,
        isActive: false,
        holidayReason: cfg?.topic || "Non-Working Day / Holiday",
        isToday: currentDate === today,
        dayOfWeek,
        dayName: dayNames[dayOfWeek],
      });
    } else {
      activeCount++;
      schedule.push({
        date: currentDate,
        dayNumber: activeCount,
        isActive: true,
        holidayReason: null,
        isToday: currentDate === today,
        dayOfWeek,
        dayName: dayNames[dayOfWeek],
      });
    }

    currentDate = addDays(currentDate, 1);
  }

  // Also include any explicitly configured days that fall beyond the target active days
  configMap.forEach((cfg, date) => {
    if (date >= currentDate && !schedule.some((d) => d.date === date)) {
      const dt = new Date(date + "T00:00:00Z");
      const dayOfWeek = dt.getUTCDay();
      schedule.push({
        date,
        dayNumber: cfg.is_active ? ++activeCount : null,
        isActive: cfg.is_active,
        holidayReason: cfg.is_active ? null : (cfg.topic || "Non-Working Day / Holiday"),
        isToday: date === today,
        dayOfWeek,
        dayName: dayNames[dayOfWeek],
      });
    }
  });

  return schedule.sort((a, b) => a.date.localeCompare(b.date));
}

export function workshopDays(
  s: Pick<Settings, "start_date" | "duration_days">,
  configuredDays?: WorkshopDayRecord[] | Record<string, { is_active: boolean; topic?: string | null }>
): string[] {
  if (
    !configuredDays ||
    (Array.isArray(configuredDays) && configuredDays.length === 0) ||
    (typeof configuredDays === "object" && Object.keys(configuredDays).length === 0)
  ) {
    return Array.from({ length: s.duration_days }, (_, i) => addDays(s.start_date, i));
  }
  const schedule = computeWorkshopSchedule(s, configuredDays);
  return schedule.filter((d) => d.isActive).map((d) => d.date);
}

export function dayState(
  day: string,
  today: string,
  status?: AttStatus | null,
  isHoliday = false
): DayState {
  if (isHoliday) return "Holiday";
  if (status === "present") return "Present";
  if (status === "excused") return "Excused";
  if (status === "pending") return "Pending";
  if (status === "absent" || status === "rejected") return day <= today ? "Absent" : "Not Held";
  if (day < today) return "Absent";
  if (day === today) return "Open";
  return "Not Held";
}

export type SessionSlot = "morning" | "afternoon" | "both";

export interface SessionAttendanceInfo {
  morning: boolean;
  afternoon: boolean;
  overall: "present" | "incomplete" | "absent" | "pending" | "excused";
}

/**
 * Resolves session-wise attendance (Morning / Afternoon / Overall).
 * Handles explicit session flags as well as legacy / QR records.
 */
export function resolveSessionAttendance(att?: {
  status?: string | null;
  morning_status?: string | null;
  afternoon_status?: string | null;
  method?: string | null;
} | null): SessionAttendanceInfo {
  if (!att || !att.status) {
    return { morning: false, afternoon: false, overall: "absent" };
  }

  if (att.status === "pending") {
    return { morning: false, afternoon: false, overall: "pending" };
  }
  if (att.status === "excused") {
    return { morning: false, afternoon: false, overall: "excused" };
  }
  if (att.status !== "present") {
    return { morning: false, afternoon: false, overall: "absent" };
  }

  // Check explicit morning / afternoon flags
  const hasMorning = att.morning_status === "present";
  const hasAfternoon = att.afternoon_status === "present";

  // If neither flag was explicitly configured, but record status is present (legacy or standard check-in):
  if (att.morning_status == null && att.afternoon_status == null) {
    return { morning: true, afternoon: true, overall: "present" };
  }

  if (hasMorning && hasAfternoon) {
    return { morning: true, afternoon: true, overall: "present" };
  }
  if (hasMorning || hasAfternoon) {
    return { morning: hasMorning, afternoon: hasAfternoon, overall: "incomplete" };
  }

  return { morning: false, afternoon: false, overall: "absent" };
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
  configuredDays?: WorkshopDayRecord[] | Record<string, { is_active: boolean; topic?: string | null }>
): Summary {
  const byDay = new Map(records.map((r) => [r.day_date, r.status]));
  const schedule = computeWorkshopSchedule(s, configuredDays, today);
  const activeDays = schedule.filter((d) => d.isActive);

  const states = schedule.map((d) => ({
    day: d.date,
    state: dayState(d.date, today, byDay.get(d.date), !d.isActive),
  }));
  const count = (st: DayState) => states.filter((x) => x.state === st).length;
  const present = count("Present");
  const absent = count("Absent");
  const pending = count("Pending");
  const excused = count("Excused");
  const remaining = count("Not Held") + count("Open");
  const closedNonExcused = states.filter(
    (x) => x.day < today && x.state !== "Excused" && x.state !== "Holiday",
  ).length;
  const todayPresent = states.some((x) => x.day === today && x.state === "Present") ? 1 : 0;
  const eligible = closedNonExcused + todayPresent;
  const total = activeDays.length - excused;
  return {
    present,
    absent,
    pending,
    excused,
    remaining,
    eligible,
    total: Math.max(0, total),
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
