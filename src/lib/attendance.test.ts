import { describe, expect, it } from "vitest";
import {
  summarize,
  safeCell,
  INDIAN_PHONE,
  normalizePhone,
  getKolkataTime,
  getNextSessionUnlockTime,
  SESSION_START_HOUR,
  resolveSessionAttendance,
} from "./attendance";
import { generate30DayWorkbook, generateDailyReportWorkbook } from "./excel";

const s = { start_date: "2026-11-01", duration_days: 30, name: "Workshop Attendance", qr_validity_minutes: 15, require_selfie: false, low_attendance_threshold: 75 };
const days = (n: number, status: "present" | "pending" | "excused" = "present") =>
  Array.from({ length: n }, (_, i) => ({
    day_date: `2026-11-${String(i + 1).padStart(2, "0")}`,
    status,
  }));

describe("attendance percentage", () => {
  it("24 of 30 days present gives 80% final", () => {
    const r = summarize(s, days(24), "2026-12-15");
    expect(r.present).toBe(24);
    expect(r.absent).toBe(6);
    expect(r.finalPct).toBe(80);
  });
  it("future days are not counted as absent", () => {
    const r = summarize(s, days(5), "2026-11-06");
    expect(r.absent).toBe(0);
    expect(r.eligible).toBe(5);
    expect(r.currentPct).toBe(100);
  });
  it("pending is not counted as present", () => {
    const r = summarize(s, days(2, "pending"), "2026-11-03");
    expect(r.present).toBe(0);
    expect(r.pending).toBe(2);
    expect(r.currentPct).toBe(0);
  });
  it("excused days leave the denominator", () => {
    const r = summarize(s, [...days(1), { day_date: "2026-11-02", status: "excused" }], "2026-11-03");
    expect(r.eligible).toBe(1);
    expect(r.total).toBe(29);
  });
  it("rounds to two decimals", () => {
    const r = summarize(s, days(1), "2026-11-04");
    expect(r.currentPct).toBe(33.33);
  });
});

describe("helpers", () => {
  it("blocks formula injection", () => expect(safeCell("=SUM(A1)")).toBe("'=SUM(A1)"));
  it("validates Indian phones", () => {
    expect(INDIAN_PHONE.test(normalizePhone("+91 98765 43210"))).toBe(true);
    expect(INDIAN_PHONE.test("12345")).toBe(false);
  });
  it("calculates session unlock at 12:00 AM (midnight) IST correctly", () => {
    expect(SESSION_START_HOUR).toBe(0);

    // Target day when not yet marked -> starts at 12:00 AM (midnight: 00:00:00 IST)
    const unlockToday = getNextSessionUnlockTime("2026-11-02", false);
    expect(unlockToday).toBe("2026-11-02T00:00:00+05:30");

    // Already marked for today -> unlocks tomorrow at 12:00 AM (midnight: 00:00:00 IST)
    const unlockTomorrow = getNextSessionUnlockTime("2026-11-02", true);
    expect(unlockTomorrow).toBe("2026-11-03T00:00:00+05:30");
  });
});

describe("excel export generation", () => {
  it("generates valid 30-day excel workbook bytes", async () => {
    const summary = summarize(s, days(10), "2026-11-15");
    const bytes = await generate30DayWorkbook(s, [
      {
        id: "user-1",
        participant_code: "SA-2026-0001",
        full_name: "John Doe",
        phone: "9876543210",
        email: "john@example.com",
        verification_status: "verified",
        summary,
        rawAttendance: {},
      },
    ]);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1000);
  }, 35000);

  it("generates valid daily report bytes", async () => {
    const bytes = await generateDailyReportWorkbook("2026-11-01", [
      {
        participant_code: "SA-2026-0001",
        full_name: "John Doe",
        phone: "9876543210",
        status: "present",
        checked_in_at: new Date().toISOString(),
        method: "qr",
      },
    ]);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(500);
  });
});

describe("resolveSessionAttendance", () => {
  it("resolves null/undefined attendance to absent", () => {
    expect(resolveSessionAttendance(null)).toEqual({
      entry: false,
      exit: false,
      morning: false,
      afternoon: false,
      overall: "absent",
      detailedStatus: "Absent",
    });
    expect(resolveSessionAttendance(undefined)).toEqual({
      entry: false,
      exit: false,
      morning: false,
      afternoon: false,
      overall: "absent",
      detailedStatus: "Absent",
    });
  });

  it("resolves legacy or QR check-in without explicit session flags to both present", () => {
    const res = resolveSessionAttendance({
      status: "present",
      morning_status: null,
      afternoon_status: null,
      method: "qr",
    });
    expect(res).toEqual({
      entry: true,
      exit: true,
      morning: true,
      afternoon: true,
      entryTime: null,
      exitTime: null,
      overall: "present",
      detailedStatus: "Complete",
    });
  });

  it("resolves morning only present as incomplete (Entry Only)", () => {
    const res = resolveSessionAttendance({
      status: "present",
      morning_status: "present",
      afternoon_status: null,
      method: "manual",
    });
    expect(res).toEqual({
      entry: true,
      exit: false,
      morning: true,
      afternoon: false,
      entryTime: null,
      exitTime: null,
      overall: "incomplete",
      detailedStatus: "Entry Only",
    });
  });

  it("resolves afternoon only present as incomplete (Exit Only)", () => {
    const res = resolveSessionAttendance({
      status: "present",
      morning_status: null,
      afternoon_status: "present",
      method: "manual",
    });
    expect(res).toEqual({
      entry: false,
      exit: true,
      morning: false,
      afternoon: true,
      entryTime: null,
      exitTime: null,
      overall: "incomplete",
      detailedStatus: "Exit Only",
    });
  });

  it("resolves both sessions explicitly present as present", () => {
    const res = resolveSessionAttendance({
      status: "present",
      morning_status: "present",
      afternoon_status: "present",
      method: "manual",
    });
    expect(res).toEqual({
      entry: true,
      exit: true,
      morning: true,
      afternoon: true,
      entryTime: null,
      exitTime: null,
      overall: "present",
      detailedStatus: "Complete",
    });
  });

  it("resolves pending and excused correctly", () => {
    expect(resolveSessionAttendance({ status: "pending" })).toEqual({
      entry: false,
      exit: false,
      morning: false,
      afternoon: false,
      overall: "pending",
      detailedStatus: "Pending",
    });
    expect(resolveSessionAttendance({ status: "excused" })).toEqual({
      entry: false,
      exit: false,
      morning: false,
      afternoon: false,
      overall: "excused",
      detailedStatus: "Excused",
    });
  });
});
