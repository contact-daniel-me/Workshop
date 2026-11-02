import { describe, expect, it } from "vitest";
import {
  computeWorkshopSchedule,
  workshopDays,
  summarize,
  dayState,
  type Settings,
} from "./attendance";

describe("Workshop Calendar & Holiday Schedule Computation", () => {
  const settings: Settings = {
    name: "Event Workshop",
    start_date: "2026-10-29",
    duration_days: 10,
    qr_validity_minutes: 15,
    require_selfie: false,
    low_attendance_threshold: 75,
  };

  it("calculates sequential days when no holidays are configured", () => {
    const schedule = computeWorkshopSchedule(settings, {});
    expect(schedule.length).toBe(10);
    expect(schedule[0].date).toBe("2026-10-29");
    expect(schedule[0].dayNumber).toBe(1);
    expect(schedule[0].isActive).toBe(true);
    expect(schedule[9].date).toBe("2026-11-07");
    expect(schedule[9].dayNumber).toBe(10);
  });

  it("skips holidays without incrementing the workshop day number", () => {
    // Oct 31 & Nov 1 configured as holidays
    const configuredDays = {
      "2026-10-31": { is_active: false, topic: "Diwali Public Holiday" },
      "2026-11-01": { is_active: false, topic: "Sunday Non-Working Day" },
    };

    const schedule = computeWorkshopSchedule(settings, configuredDays);
    // Should have 10 active days + 2 holidays = 12 total calendar days
    expect(schedule.length).toBe(12);

    const oct29 = schedule.find((d) => d.date === "2026-10-29")!;
    expect(oct29.isActive).toBe(true);
    expect(oct29.dayNumber).toBe(1);

    const oct30 = schedule.find((d) => d.date === "2026-10-30")!;
    expect(oct30.isActive).toBe(true);
    expect(oct30.dayNumber).toBe(2);

    const oct31 = schedule.find((d) => d.date === "2026-10-31")!;
    expect(oct31.isActive).toBe(false);
    expect(oct31.dayNumber).toBeNull();
    expect(oct31.holidayReason).toBe("Diwali Public Holiday");

    const nov1 = schedule.find((d) => d.date === "2026-11-01")!;
    expect(nov1.isActive).toBe(false);
    expect(nov1.dayNumber).toBeNull();
    expect(nov1.holidayReason).toBe("Sunday Non-Working Day");

    // Nov 2 must be Day 3 (NOT Day 5!)
    const nov2 = schedule.find((d) => d.date === "2026-11-02")!;
    expect(nov2.isActive).toBe(true);
    expect(nov2.dayNumber).toBe(3);

    // Nov 3 must be Day 4
    const nov3 = schedule.find((d) => d.date === "2026-11-03")!;
    expect(nov3.isActive).toBe(true);
    expect(nov3.dayNumber).toBe(4);
  });

  it("correctly filters only active dates for workshopDays", () => {
    const configuredDays = {
      "2026-10-31": { is_active: false, topic: "Weekend" },
      "2026-11-01": { is_active: false, topic: "Weekend" },
    };
    const activeDates = workshopDays(settings, configuredDays);
    expect(activeDates.length).toBe(10);
    expect(activeDates.includes("2026-10-31")).toBe(false);
    expect(activeDates.includes("2026-11-01")).toBe(false);
    expect(activeDates[2]).toBe("2026-11-02"); // Day 3
  });

  it("handles weekend bulk rules properly (e.g. Saturdays and Sundays off)", () => {
    // Generate dates from 2026-10-29 to 2026-11-15 and mark all Sat/Sun as holidays
    const configuredDays: Record<string, { is_active: boolean; topic: string }> = {};
    for (let i = 0; i < 30; i++) {
      const dt = new Date("2026-10-29T00:00:00Z");
      dt.setUTCDate(dt.getUTCDate() + i);
      const dateStr = dt.toISOString().slice(0, 10);
      const day = dt.getUTCDay();
      if (day === 0 || day === 6) {
        configuredDays[dateStr] = { is_active: false, topic: day === 0 ? "Sunday" : "Saturday" };
      }
    }

    const schedule = computeWorkshopSchedule(settings, configuredDays);
    const activeDays = schedule.filter((d) => d.isActive);
    expect(activeDays.length).toBe(10);

    // Verify none of the active days fall on a Saturday (6) or Sunday (0)
    for (const ad of activeDays) {
      const dayOfWeek = new Date(ad.date + "T00:00:00Z").getUTCDay();
      expect(dayOfWeek).not.toBe(0);
      expect(dayOfWeek).not.toBe(6);
      expect(ad.dayNumber).toBeGreaterThan(0);
    }
  });

  it("restarts timeline numbering from Day 1 when start_date is reset", () => {
    // Admin resets timeline start_date to 2026-11-02
    const resetSettings: Settings = {
      ...settings,
      start_date: "2026-11-02",
      duration_days: 10,
    };

    const schedule = computeWorkshopSchedule(resetSettings, {});
    expect(schedule[0].date).toBe("2026-11-02");
    expect(schedule[0].dayNumber).toBe(1);
    expect(schedule[9].date).toBe("2026-11-11");
    expect(schedule[9].dayNumber).toBe(10);
  });

  it("excludes holidays from attendance summarize denominator", () => {
    const configuredDays = {
      "2026-10-31": { is_active: false, topic: "Holiday" },
      "2026-11-01": { is_active: false, topic: "Holiday" },
    };

    // User attended Day 1 (10-29) and Day 2 (10-30). Today is Nov 2 (Day 3).
    const records = [
      { day_date: "2026-10-29", status: "present" as const },
      { day_date: "2026-10-30", status: "present" as const },
    ];

    const summary = summarize(settings, records, "2026-11-02", configuredDays);
    // Closed days before today: Oct 29 (present), Oct 30 (present), Oct 31 (holiday - excluded!), Nov 1 (holiday - excluded!)
    // So eligible = 2 days!
    expect(summary.eligible).toBe(2);
    expect(summary.present).toBe(2);
    expect(summary.currentPct).toBe(100);
    expect(summary.absent).toBe(0); // Holidays are never counted as absent!

    // Verify states has Holiday state
    const oct31State = summary.states.find((s) => s.day === "2026-10-31");
    expect(oct31State?.state).toBe("Holiday");
  });
});

