import type ExcelJS from "exceljs";
import {
  safeCell,
  type Settings,
  type Summary,
  workshopDays,
  resolveSessionAttendance,
  formatIstTimestamp,
  formatIstDate,
} from "./attendance";

let _exceljsPromise: Promise<any> | null = null;
async function getExcelJS() {
  if (!_exceljsPromise) {
    _exceljsPromise = import("exceljs");
  }
  const mod = await _exceljsPromise;
  return (mod.default || mod);
}

export interface ParticipantRow {
  id: string;
  participant_code: string;
  full_name: string;
  phone: string;
  email: string;
  photo_path?: string | null;
  verification_status: "pending" | "verified" | "rejected";
  summary: Summary;
  rawAttendance: Record<string, {
    status: string;
    checked_in_at: string;
    method: string;
    remarks?: string | null;
    morning_status?: string | null;
    afternoon_status?: string | null;
  }>;
}

/** Styling helpers for professional spreadsheets */
const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0F172A" }, // Slate 900
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 11,
  bold: true,
  color: { argb: "FFFFFFFF" },
};
const CELL_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE2E8F0" } },
  left: { style: "thin", color: { argb: "FFE2E8F0" } },
  bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
  right: { style: "thin", color: { argb: "FFE2E8F0" } },
};

function applyHeaderStyle(row: ExcelJS.Row) {
  row.height = 28;
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = CELL_BORDER;
  });
}

function applyBodyStyle(row: ExcelJS.Row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { name: "Calibri", size: 10 };
    cell.alignment = { vertical: "middle" };
    cell.border = CELL_BORDER;
  });
}

/**
 * Option A: Complete 30-Day Attendance Sheet with Summary Tab
 */
export async function generate30DayWorkbook(
  settings: Settings,
  participants: ParticipantRow[],
): Promise<Uint8Array> {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = settings.name || "Event Management Portal";
  wb.created = new Date();

  const days = workshopDays(settings);

  // Sheet 1: Master Attendance Sheet
  const ws = wb.addWorksheet("Master Attendance", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 1 }],
  });

  const columns: Partial<ExcelJS.Column>[] = [
    { header: "Participant ID", key: "code", width: 16 },
    { header: "Full Name", key: "name", width: 24 },
    { header: "Phone Number", key: "phone", width: 16 },
    { header: "Email Address", key: "email", width: 28 },
    { header: "Registration", key: "reg_status", width: 15 },
  ];

  days.forEach((day, idx) => {
    columns.push({
      header: `Day ${idx + 1}\n(${day.slice(5)})`,
      key: `day_${idx + 1}`,
      width: 12,
    });
  });

  columns.push(
    { header: "Total Present", key: "total_present", width: 14 },
    { header: "Total Absent", key: "total_absent", width: 14 },
    { header: "Total Pending", key: "total_pending", width: 14 },
    { header: "Total Excused", key: "total_excused", width: 14 },
    { header: "Current %", key: "current_pct", width: 13 },
    { header: "Final %", key: "final_pct", width: 14 },
    { header: "Status", key: "status_flag", width: 16 },
  );

  ws.columns = columns;
  applyHeaderStyle(ws.getRow(1));

  participants.forEach((p) => {
    const dayMap = new Map(p.summary.states.map((s) => [s.day, s.state]));
    const rowValues: Record<string, unknown> = {
      code: safeCell(p.participant_code),
      name: safeCell(p.full_name),
      phone: safeCell(p.phone),
      email: safeCell(p.email),
      reg_status: p.verification_status.toUpperCase(),
      total_present: p.summary.present,
      total_absent: p.summary.absent,
      total_pending: p.summary.pending,
      total_excused: p.summary.excused,
      current_pct: `${p.summary.currentPct}%`,
      final_pct: `${p.summary.finalPct}%`,
      status_flag:
        p.summary.currentPct < settings.low_attendance_threshold
          ? "LOW ATTENDANCE"
          : "REGULAR",
    };

    days.forEach((day, idx) => {
      rowValues[`day_${idx + 1}`] = dayMap.get(day) ?? "Not Held";
    });

    const row = ws.addRow(rowValues);
    applyBodyStyle(row);

    // Colorize status cell
    const statusCell = row.getCell("status_flag");
    if (p.summary.currentPct < settings.low_attendance_threshold) {
      statusCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFDC2626" } };
    } else {
      statusCell.font = { name: "Calibri", size: 10, color: { argb: "FF16A34A" } };
    }
  });

  // Sheet 2: Workshop Summary & Analytics
  const summaryWs = wb.addWorksheet("Summary Statistics");
  summaryWs.columns = [
    { header: "Metric", key: "metric", width: 32 },
    { header: "Value", key: "val", width: 28 },
  ];
  applyHeaderStyle(summaryWs.getRow(1));

  const totalParticipants = participants.length;
  const verifiedCount = participants.filter((p) => p.verification_status === "verified").length;
  const avgAttendance = totalParticipants
    ? Math.round(
        (participants.reduce((acc, p) => acc + p.summary.currentPct, 0) / totalParticipants) * 100,
      ) / 100
    : 0;
  const lowAttendanceCount = participants.filter(
    (p) => p.summary.currentPct < settings.low_attendance_threshold,
  ).length;

  const summaryRows = [
    { metric: "Workshop Name", val: safeCell(settings.name) },
    { metric: "Start Date", val: settings.start_date },
    { metric: "Total Configured Days", val: settings.duration_days },
    { metric: "Total Registered Participants", val: totalParticipants },
    { metric: "Identity Verified Participants", val: verifiedCount },
    { metric: "Average Attendance Rate", val: `${avgAttendance}%` },
    { metric: `Low Attendance Threshold (<${settings.low_attendance_threshold}%)`, val: `${lowAttendanceCount} Participants` },
    { metric: "Report Generated On", val: new Date().toISOString() },
  ];

  summaryRows.forEach((r) => {
    const row = summaryWs.addRow(r);
    applyBodyStyle(row);
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

/**
 * Option B: Daily Attendance Report
 */
export async function generateDailyReportWorkbook(
  date: string,
  records: Array<{
    participant_code: string;
    full_name: string;
    phone: string;
    status: string;
    checked_in_at: string;
    method: string;
    verified_by?: string | null;
    remarks?: string | null;
  }>,
): Promise<Uint8Array> {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Event Management Portal";

  const ws = wb.addWorksheet(`Daily Attendance ${date}`, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = [
    { header: "Participant ID", key: "code", width: 16 },
    { header: "Full Name", key: "name", width: 24 },
    { header: "Phone", key: "phone", width: 16 },
    { header: "Attendance Date", key: "date", width: 16 },
    { header: "Status", key: "status", width: 14 },
    { header: "Check-in Time", key: "time", width: 22 },
    { header: "Method", key: "method", width: 15 },
    { header: "Verified By", key: "verified_by", width: 20 },
    { header: "Remarks", key: "remarks", width: 30 },
  ];
  applyHeaderStyle(ws.getRow(1));

  records.forEach((r) => {
    const row = ws.addRow({
      code: safeCell(r.participant_code),
      name: safeCell(r.full_name),
      phone: safeCell(r.phone),
      date,
      status: r.status.toUpperCase(),
      time: r.checked_in_at ? new Date(r.checked_in_at).toLocaleString() : "-",
      method:
        r.method === "qr_selfie" || r.method === "face"
          ? "Face Verified"
          : r.method === "qr" || r.method === "qr_scan"
          ? "QR Scan"
          : r.method === "manual"
          ? "Manual Override"
          : r.method,
      verified_by: safeCell(r.verified_by ?? "System"),
      remarks: safeCell(r.remarks ?? ""),
    });
    applyBodyStyle(row);
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

/**
 * Option C: Individual Participant Attendance Report
 */
export async function generateIndividualReportWorkbook(
  participant: ParticipantRow,
  settings: Settings,
): Promise<Uint8Array> {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Event Management Portal";

  const ws = wb.addWorksheet(`${participant.participant_code} Report`, {
    views: [{ state: "frozen", ySplit: 6 }],
  });

  // Profile Header block
  ws.addRow(["Individual Attendance Report"]);
  ws.addRow(["Participant ID:", safeCell(participant.participant_code)]);
  ws.addRow(["Full Name:", safeCell(participant.full_name), "Phone:", safeCell(participant.phone)]);
  ws.addRow(["Email:", safeCell(participant.email), "Status:", participant.verification_status.toUpperCase()]);
  ws.addRow([
    "Current Attendance:",
    `${participant.summary.currentPct}%`,
    "Final Attendance:",
    `${participant.summary.finalPct}%`,
  ]);
  ws.addRow([]); // spacer

  const headerRow = ws.addRow([
    "Day #",
    "Session Date",
    "State",
    "Check-in Timestamp",
    "Method",
    "Remarks",
  ]);
  applyHeaderStyle(headerRow);

  participant.summary.states.forEach((st, idx) => {
    const raw = participant.rawAttendance[st.day];
    const row = ws.addRow([
      `Day ${idx + 1}`,
      st.day,
      st.state,
      raw?.checked_in_at ? new Date(raw.checked_in_at).toLocaleTimeString() : "-",
      raw?.method ?? "-",
      safeCell(raw?.remarks ?? ""),
    ]);
    applyBodyStyle(row);
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

/**
 * Summary Statistics Worksheet Generator
 */
function addSummaryWorksheet(
  wb: any,
  title = "Summary Statistics",
  stats: {
    workshopName: string;
    reportScope: string;
    totalParticipants: number;
    totalEntryCount: number;
    totalExitCount: number;
    completeAttendanceCount: number;
    entryOnlyCount: number;
    exitOnlyCount: number;
    noAttendanceCount: number;
  },
) {
  const ws = wb.addWorksheet(title, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = [
    { header: "Attendance Metric", key: "metric", width: 36 },
    { header: "Count / Value", key: "value", width: 28 },
  ];
  applyHeaderStyle(ws.getRow(1));

  const entryPct = stats.totalParticipants
    ? `${((stats.totalEntryCount / stats.totalParticipants) * 100).toFixed(1)}%`
    : "0%";
  const exitPct = stats.totalParticipants
    ? `${((stats.totalExitCount / stats.totalParticipants) * 100).toFixed(1)}%`
    : "0%";
  const completePct = stats.totalParticipants
    ? `${((stats.completeAttendanceCount / stats.totalParticipants) * 100).toFixed(1)}%`
    : "0%";

  const rows = [
    { metric: "Workshop Name", value: stats.workshopName },
    { metric: "Report Scope / Date Range", value: stats.reportScope },
    { metric: "Total Registered Participants", value: stats.totalParticipants },
    { metric: "Total Entry Records", value: stats.totalEntryCount },
    { metric: "Total Exit Records", value: stats.totalExitCount },
    { metric: "Complete Attendance (Both Entry & Exit)", value: stats.completeAttendanceCount },
    { metric: "Entry Only Attendance", value: stats.entryOnlyCount },
    { metric: "Exit Only Attendance", value: stats.exitOnlyCount },
    { metric: "No Attendance (Absent)", value: stats.noAttendanceCount },
    { metric: "Entry Attendance Percentage", value: entryPct },
    { metric: "Exit Attendance Percentage", value: exitPct },
    { metric: "Complete Attendance Percentage", value: completePct },
    { metric: "Report Generated On", value: formatIstTimestamp(new Date()) },
  ];

  rows.forEach((r) => {
    const row = ws.addRow(r);
    applyBodyStyle(row);
  });
}

/**
 * Single-Day Excel Download:
 * Exports all participants (including absentees) for a selected date with exact timestamps in IST.
 */
export async function generateDailyAttendanceExcel({
  date,
  participants,
  attendanceRecords,
  settings,
}: {
  date: string;
  participants: Array<{
    id: string;
    participant_code: string;
    full_name: string;
    phone?: string;
    email?: string;
  }>;
  attendanceRecords: Array<{
    user_id: string;
    status: string;
    morning_status?: string | null;
    afternoon_status?: string | null;
    entry_status?: string | null;
    exit_status?: string | null;
    checked_in_at?: string | null;
    updated_at?: string | null;
    remarks?: string | null;
    method?: string | null;
  }>;
  settings?: Settings | null;
}): Promise<Uint8Array> {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = settings?.name || "Event Management Portal";
  wb.created = new Date();

  const ws = wb.addWorksheet(`Attendance ${date}`, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const columns: Partial<ExcelJS.Column>[] = [
    { header: "Sl. No.", key: "sl", width: 10 },
    { header: "Participant ID", key: "id", width: 22 },
    { header: "Name", key: "name", width: 26 },
    { header: "Registration Number", key: "code", width: 22 },
    { header: "Date", key: "date", width: 16 },
    { header: "Entry Status", key: "entry_status", width: 16 },
    { header: "Entry Time", key: "entry_time", width: 22 },
    { header: "Exit Status", key: "exit_status", width: 16 },
    { header: "Exit Time", key: "exit_time", width: 22 },
    { header: "Verification Method", key: "method", width: 22 },
    { header: "Overall Status", key: "overall_status", width: 18 },
  ];
  ws.columns = columns;
  applyHeaderStyle(ws.getRow(1));

  // Enable autoFilter
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  const attMap = new Map<string, (typeof attendanceRecords)[number]>();
  attendanceRecords.forEach((a) => attMap.set(a.user_id, a));

  let totalEntry = 0;
  let totalExit = 0;
  let completeCount = 0;
  let entryOnlyCount = 0;
  let exitOnlyCount = 0;
  let noAttendanceCount = 0;

  participants.forEach((p, idx) => {
    const att = attMap.get(p.id);
    const session = resolveSessionAttendance(att);

    const hasEntry = session.entry;
    const hasExit = session.exit;

    if (hasEntry) totalEntry++;
    if (hasExit) totalExit++;

    let overall = "Absent";
    if (hasEntry && hasExit) {
      overall = "Complete";
      completeCount++;
    } else if (hasEntry) {
      overall = "Entry Only";
      entryOnlyCount++;
    } else if (hasExit) {
      overall = "Exit Only";
      exitOnlyCount++;
    } else {
      noAttendanceCount++;
    }

    const methodDisplay = !att
      ? "-"
      : att.method === "qr_selfie" || att.method === "face"
      ? "Face Recognition"
      : att.method === "qr" || att.method === "qr_scan"
      ? "QR Scan"
      : att.method === "manual"
      ? "Manual Override"
      : att.method ?? "-";

    const entryTimeFormatted = session.entryTime ? formatIstTimestamp(session.entryTime) : "-";
    const exitTimeFormatted = session.exitTime ? formatIstTimestamp(session.exitTime) : "-";

    const row = ws.addRow({
      sl: idx + 1,
      id: safeCell(p.id),
      name: safeCell(p.full_name),
      code: safeCell(p.participant_code),
      date: formatIstDate(date),
      entry_status: hasEntry ? "Present" : "Missing",
      entry_time: entryTimeFormatted,
      exit_status: hasExit ? "Present" : "Missing",
      exit_time: exitTimeFormatted,
      method: methodDisplay,
      overall_status: overall,
    });
    applyBodyStyle(row);

    // Color code overall status
    const overallCell = row.getCell("overall_status");
    if (overall === "Complete") {
      overallCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF16A34A" } };
    } else if (overall === "Absent") {
      overallCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFDC2626" } };
    } else {
      overallCell.font = { name: "Calibri", size: 10, color: { argb: "FFD97706" } };
    }
  });

  // Sheet 2: Summary Worksheet
  addSummaryWorksheet(wb, "Summary Statistics", {
    workshopName: settings?.name || "ESDP Workshop",
    reportScope: `Selected Date: ${formatIstDate(date)} (${date})`,
    totalParticipants: participants.length,
    totalEntryCount: totalEntry,
    totalExitCount: totalExit,
    completeAttendanceCount: completeCount,
    entryOnlyCount,
    exitOnlyCount,
    noAttendanceCount,
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

/**
 * Date Range / Bulk Attendance Excel Download:
 * Generates an Excel workbook for a selected date range with All, Entry-only, or Exit-only.
 */
export async function generateDateRangeAttendanceExcel({
  startDate,
  endDate,
  participants,
  attendanceRecords,
  settings,
  sessionType = "all",
}: {
  startDate: string;
  endDate: string;
  participants: Array<{
    id: string;
    participant_code: string;
    full_name: string;
    phone?: string;
    email?: string;
  }>;
  attendanceRecords: Array<{
    user_id: string;
    day_date: string;
    status: string;
    morning_status?: string | null;
    afternoon_status?: string | null;
    entry_status?: string | null;
    exit_status?: string | null;
    checked_in_at?: string | null;
    updated_at?: string | null;
    remarks?: string | null;
    method?: string | null;
  }>;
  settings?: Settings | null;
  sessionType?: "all" | "entry" | "exit";
}): Promise<Uint8Array> {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = settings?.name || "Event Management Portal";
  wb.created = new Date();

  const titleSuffix = sessionType === "entry" ? "Entry Attendance" : sessionType === "exit" ? "Exit Attendance" : "Attendance";
  const ws = wb.addWorksheet(titleSuffix, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const columns: Partial<ExcelJS.Column>[] = [
    { header: "Sl. No.", key: "sl", width: 10 },
    { header: "Participant ID", key: "id", width: 22 },
    { header: "Name", key: "name", width: 26 },
    { header: "Registration Number", key: "code", width: 22 },
    { header: "Attendance Date", key: "date", width: 16 },
  ];

  if (sessionType === "all" || sessionType === "entry") {
    columns.push(
      { header: "Entry Status", key: "entry_status", width: 16 },
      { header: "Entry Time (IST)", key: "entry_time", width: 22 },
    );
  }
  if (sessionType === "all" || sessionType === "exit") {
    columns.push(
      { header: "Exit Status", key: "exit_status", width: 16 },
      { header: "Exit Time (IST)", key: "exit_time", width: 22 },
    );
  }
  columns.push(
    { header: "Verification Method", key: "method", width: 22 },
    { header: "Overall Status", key: "overall_status", width: 18 },
  );

  ws.columns = columns;
  applyHeaderStyle(ws.getRow(1));

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  // Map of date -> userId -> record
  const mapByDateAndUser = new Map<string, Map<string, (typeof attendanceRecords)[number]>>();
  attendanceRecords.forEach((a) => {
    let dayMap = mapByDateAndUser.get(a.day_date);
    if (!dayMap) {
      dayMap = new Map();
      mapByDateAndUser.set(a.day_date, dayMap);
    }
    dayMap.set(a.user_id, a);
  });

  // Collect all unique dates in range sorted ascending
  const uniqueDates = Array.from(
    new Set(attendanceRecords.map((a) => a.day_date).concat([startDate, endDate])),
  )
    .filter((d) => d >= startDate && d <= endDate)
    .sort();

  let sl = 1;
  let totalEntry = 0;
  let totalExit = 0;
  let completeCount = 0;
  let entryOnlyCount = 0;
  let exitOnlyCount = 0;
  let noAttendanceCount = 0;

  uniqueDates.forEach((d) => {
    const dayMap = mapByDateAndUser.get(d) ?? new Map();
    participants.forEach((p) => {
      const att = dayMap.get(p.id);
      const session = resolveSessionAttendance(att);

      const hasEntry = session.entry;
      const hasExit = session.exit;

      if (hasEntry) totalEntry++;
      if (hasExit) totalExit++;

      let overall = "Absent";
      if (hasEntry && hasExit) {
        overall = "Complete";
        completeCount++;
      } else if (hasEntry) {
        overall = "Entry Only";
        entryOnlyCount++;
      } else if (hasExit) {
        overall = "Exit Only";
        exitOnlyCount++;
      } else {
        noAttendanceCount++;
      }

      // Filter by sessionType if entry-only or exit-only requested
      if (sessionType === "entry" && !hasEntry) return;
      if (sessionType === "exit" && !hasExit) return;

      const methodDisplay = !att
        ? "-"
        : att.method === "qr_selfie" || att.method === "face"
        ? "Face Recognition"
        : att.method === "qr" || att.method === "qr_scan"
        ? "QR Scan"
        : att.method === "manual"
        ? "Manual Override"
        : att.method ?? "-";

      const rowValues: Record<string, unknown> = {
        sl: sl++,
        id: safeCell(p.id),
        name: safeCell(p.full_name),
        code: safeCell(p.participant_code),
        date: formatIstDate(d),
        method: methodDisplay,
        overall_status: overall,
      };

      if (sessionType === "all" || sessionType === "entry") {
        rowValues.entry_status = hasEntry ? "Present" : "Missing";
        rowValues.entry_time = session.entryTime ? formatIstTimestamp(session.entryTime) : "-";
      }
      if (sessionType === "all" || sessionType === "exit") {
        rowValues.exit_status = hasExit ? "Present" : "Missing";
        rowValues.exit_time = session.exitTime ? formatIstTimestamp(session.exitTime) : "-";
      }

      const row = ws.addRow(rowValues);
      applyBodyStyle(row);
    });
  });

  // Summary Sheet
  addSummaryWorksheet(wb, "Summary Statistics", {
    workshopName: settings?.name || "ESDP Workshop",
    reportScope: `Date Range: ${formatIstDate(startDate)} to ${formatIstDate(endDate)}`,
    totalParticipants: participants.length,
    totalEntryCount: totalEntry,
    totalExitCount: totalExit,
    completeAttendanceCount: completeCount,
    entryOnlyCount,
    exitOnlyCount,
    noAttendanceCount,
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

/**
 * Triggers actual file download in browser
 */
export function downloadExcelFile(data: Uint8Array, filename: string) {
  // Coerce Uint8Array to ArrayBuffer for Blob compatibility
  const blob = new Blob([data.buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

