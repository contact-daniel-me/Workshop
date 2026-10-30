import { describe, expect, it } from "vitest";
import {
  summarize,
  safeCell,
  INDIAN_PHONE,
  normalizePhone,
  getKolkataTime,
  getNextSessionUnlockTime,
  SESSION_START_HOUR,
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
  it("calculates session unlock at 12:00 PM IST correctly", () => {
    expect(SESSION_START_HOUR).toBe(12);

    // Morning at 9:00 AM IST (not yet marked) -> unlocks today at 12:00 PM
    const morningDate = new Date("2026-11-02T03:30:00.000Z"); // 03:30 UTC = 09:00 IST
    const unlockMorning = getNextSessionUnlockTime("2026-11-02", false, morningDate);
    expect(unlockMorning).toBe("2026-11-02T12:00:00+05:30");

    // Afternoon at 1:00 PM IST (already marked) -> unlocks tomorrow at 12:00 PM
    const afternoonDate = new Date("2026-11-02T07:30:00.000Z"); // 07:30 UTC = 13:00 IST
    const unlockTomorrow = getNextSessionUnlockTime("2026-11-02", true, afternoonDate);
    expect(unlockTomorrow).toBe("2026-11-03T12:00:00+05:30");

    // Past 12:00 PM even if not marked -> unlocks tomorrow at 12:00 PM
    const unlockPastNoon = getNextSessionUnlockTime("2026-11-02", false, afternoonDate);
    expect(unlockPastNoon).toBe("2026-11-03T12:00:00+05:30");
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
  });

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
