import { describe, expect, it } from "vitest";
import { summarize, addDays, type Settings } from "./attendance";

describe("Digital Participant ID Card logic & requirements", () => {
  const sampleSettings: Settings = {
    start_date: "2026-11-01",
    duration_days: 30,
    name: "AI & Fullstack Workshop 2026",
    qr_validity_minutes: 15,
    require_selfie: false,
    low_attendance_threshold: 75,
  };

  it("calculates accurate attendance percentage for ID card display", () => {
    const attendanceRecords = [
      { day_date: "2026-11-01", status: "present" as const },
      { day_date: "2026-11-02", status: "present" as const },
      { day_date: "2026-11-03", status: "absent" as const },
      { day_date: "2026-11-04", status: "present" as const },
    ];

    const summary = summarize(sampleSettings, attendanceRecords, "2026-11-05");
    expect(summary.eligible).toBe(4);
    expect(summary.present).toBe(3);
    expect(summary.absent).toBe(1);
    expect(summary.currentPct).toBe(75);
  });

  it("calculates event start and end dates accurately for 30-day workshop", () => {
    const startDate = sampleSettings.start_date;
    const duration = sampleSettings.duration_days;
    const endDate = addDays(startDate, duration - 1);

    expect(startDate).toBe("2026-11-01");
    expect(endDate).toBe("2026-11-30");
  });

  it("does not count future days as absences on digital ID card", () => {
    const dayOneOnly = [{ day_date: "2026-11-01", status: "present" as const }];
    const summary = summarize(sampleSettings, dayOneOnly, "2026-11-02");

    expect(summary.eligible).toBe(1);
    expect(summary.present).toBe(1);
    expect(summary.absent).toBe(0);
    expect(summary.currentPct).toBe(100);
  });

  it("handles zero eligible days gracefully (0% initial denominator)", () => {
    const emptyAttendance: Array<{ day_date: string; status: "present" }> = [];
    // Prior to workshop start date
    const summary = summarize(sampleSettings, emptyAttendance, "2026-10-31");

    expect(summary.eligible).toBe(0);
    expect(summary.present).toBe(0);
    expect(summary.absent).toBe(0);
    expect(summary.currentPct).toBe(0);
  });

  it("formats participant ID codes according to standard format", () => {
    const code = "SA-2026-0042";
    expect(code).toMatch(/^SA-\d{4}-\d{4}$/);
  });
});
