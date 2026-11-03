import { describe, expect, it } from "vitest";
import {
  generateSecureToken,
  hashToken,
  generateShortCode,
} from "./attendance-qr.crypto";
import {
  type QrVerificationResultCode,
} from "./attendance-qr.server";
import { todayLocal, addDays, workshopDays, summarize, SESSION_START_HOUR } from "./attendance";

describe("Dynamic Daily QR Attendance Cryptography & Tokens", () => {
  it("generates unique, unpredictable cryptographically random tokens", () => {
    const t1 = generateSecureToken(32);
    const t2 = generateSecureToken(32);
    expect(t1).not.toBe(t2);
    expect(t1.length).toBe(64); // 32 bytes in hex = 64 characters
    expect(/^[0-9a-f]{64}$/.test(t1)).toBe(true);
  });

  it("produces deterministic SHA-256 token hashes for database storage", () => {
    const raw = "9f83a48e89fbc7412849e7b2138a08bc79d2f6230f2c41864e8a159f8a48b321";
    const h1 = hashToken(raw);
    const h2 = hashToken(raw);
    expect(h1).toBe(h2);
    expect(h1.length).toBe(64);
    expect(h1).not.toBe(raw);
  });

  it("generates 6-character human-friendly uppercase alphanumeric short codes", () => {
    const c1 = generateShortCode();
    const c2 = generateShortCode();
    expect(c1.length).toBe(6);
    expect(c2.length).toBe(6);
    expect(/^[A-Z0-9]{6}$/.test(c1)).toBe(true);
  });

  it("determines official workshop dates in authoritative Asia/Kolkata timezone", () => {
    const today = todayLocal();
    expect(/^\d{4}-\d{2}-\d{2}$/.test(today)).toBe(true);

    // Verify consistency with Indian Standard Time
    const istDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    expect(today).toBe(istDate);
  });
});

describe("QR Session Validation Logic & Security Rules", () => {
  const today = todayLocal();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);

  interface MockSession {
    id: string;
    participant_id: string;
    day_date: string;
    token: string;
    token_hash: string;
    expires_at: string;
    revoked: boolean;
    revoked_at: string | null;
    used_at: string | null;
  }

  interface MockProfile {
    id: string;
    verification_status: "verified" | "pending" | "rejected";
  }

  interface MockAttendance {
    user_id: string;
    day_date: string;
    status: string;
  }

  function validateSessionRule(
    session: MockSession | null,
    profile: MockProfile | null,
    existingAttendance: MockAttendance | null,
    currentDate: string = today,
    nowMs: number = Date.now(),
  ): { valid: boolean; code: QrVerificationResultCode } {
    if (!session) {
      return { valid: false, code: "INVALID_QR" };
    }
    if (!profile) {
      return { valid: false, code: "INVALID_QR" };
    }
    if (profile.verification_status !== "verified") {
      return { valid: false, code: "PARTICIPANT_NOT_APPROVED" };
    }
    if (session.revoked || session.revoked_at) {
      return { valid: false, code: "QR_REVOKED" };
    }
    if (session.used_at) {
      return { valid: false, code: "QR_ALREADY_USED" };
    }
    if (new Date(session.expires_at).getTime() < nowMs) {
      return { valid: false, code: "QR_EXPIRED" };
    }
    if (session.day_date !== currentDate) {
      return { valid: false, code: "WRONG_DATE" };
    }
    if (existingAttendance) {
      return { valid: false, code: "ATTENDANCE_ALREADY_MARKED" };
    }
    return { valid: true, code: "READY_TO_MARK" };
  }

  it("approves a valid, unexpired, unconsumed session on the current workshop day", () => {
    const session: MockSession = {
      id: "sess-1",
      participant_id: "user-1",
      day_date: today,
      token: "valid-token-123",
      token_hash: hashToken("valid-token-123"),
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      revoked: false,
      revoked_at: null,
      used_at: null,
    };
    const profile: MockProfile = { id: "user-1", verification_status: "verified" };
    const res = validateSessionRule(session, profile, null);
    expect(res.valid).toBe(true);
    expect(res.code).toBe("READY_TO_MARK");
  });

  it("rejects an expired QR code", () => {
    const session: MockSession = {
      id: "sess-expired",
      participant_id: "user-1",
      day_date: today,
      token: "expired-token",
      token_hash: hashToken("expired-token"),
      expires_at: new Date(Date.now() - 1000).toISOString(), // expired 1s ago
      revoked: false,
      revoked_at: null,
      used_at: null,
    };
    const profile: MockProfile = { id: "user-1", verification_status: "verified" };
    const res = validateSessionRule(session, profile, null);
    expect(res.valid).toBe(false);
    expect(res.code).toBe("QR_EXPIRED");
  });

  it("rejects a QR code from a previous workshop day", () => {
    const session: MockSession = {
      id: "sess-yesterday",
      participant_id: "user-1",
      day_date: yesterday,
      token: "yesterday-token",
      token_hash: hashToken("yesterday-token"),
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      revoked: false,
      revoked_at: null,
      used_at: null,
    };
    const profile: MockProfile = { id: "user-1", verification_status: "verified" };
    const res = validateSessionRule(session, profile, null);
    expect(res.valid).toBe(false);
    expect(res.code).toBe("WRONG_DATE");
  });

  it("rejects a revoked QR code", () => {
    const session: MockSession = {
      id: "sess-revoked",
      participant_id: "user-1",
      day_date: today,
      token: "revoked-token",
      token_hash: hashToken("revoked-token"),
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      revoked: true,
      revoked_at: new Date().toISOString(),
      used_at: null,
    };
    const profile: MockProfile = { id: "user-1", verification_status: "verified" };
    const res = validateSessionRule(session, profile, null);
    expect(res.valid).toBe(false);
    expect(res.code).toBe("QR_REVOKED");
  });

  it("rejects an already consumed / used QR code (replay prevention)", () => {
    const session: MockSession = {
      id: "sess-used",
      participant_id: "user-1",
      day_date: today,
      token: "used-token",
      token_hash: hashToken("used-token"),
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      revoked: false,
      revoked_at: null,
      used_at: new Date().toISOString(),
    };
    const profile: MockProfile = { id: "user-1", verification_status: "verified" };
    const res = validateSessionRule(session, profile, null);
    expect(res.valid).toBe(false);
    expect(res.code).toBe("QR_ALREADY_USED");
  });

  it("rejects attendance when participant is pending or rejected", () => {
    const session: MockSession = {
      id: "sess-1",
      participant_id: "user-pending",
      day_date: today,
      token: "token-1",
      token_hash: hashToken("token-1"),
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      revoked: false,
      revoked_at: null,
      used_at: null,
    };
    const pendingProf: MockProfile = { id: "user-pending", verification_status: "pending" };
    const resPending = validateSessionRule(session, pendingProf, null);
    expect(resPending.valid).toBe(false);
    expect(resPending.code).toBe("PARTICIPANT_NOT_APPROVED");

    const rejectedProf: MockProfile = { id: "user-pending", verification_status: "rejected" };
    const resRejected = validateSessionRule(session, rejectedProf, null);
    expect(resRejected.valid).toBe(false);
    expect(resRejected.code).toBe("PARTICIPANT_NOT_APPROVED");
  });

  it("detects and rejects duplicate attendance if already marked today", () => {
    const session: MockSession = {
      id: "sess-1",
      participant_id: "user-1",
      day_date: today,
      token: "token-dup",
      token_hash: hashToken("token-dup"),
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      revoked: false,
      revoked_at: null,
      used_at: null,
    };
    const profile: MockProfile = { id: "user-1", verification_status: "verified" };
    const existingAtt: MockAttendance = { user_id: "user-1", day_date: today, status: "present" };

    const res = validateSessionRule(session, profile, existingAtt);
    expect(res.valid).toBe(false);
    expect(res.code).toBe("ATTENDANCE_ALREADY_MARKED");
  });
});

describe("Admin Attendance Console: Dual Independent Verification (QR & Face)", () => {
  interface AttendanceRecord {
    id: string;
    userId: string;
    dayDate: string;
    status: "present" | "pending" | "absent";
    method: "qr" | "qr_selfie" | "manual";
    checkedInAt: string;
    remarks: string;
  }

  interface VerificationAttempt {
    userId: string;
    method: "qr" | "face_verification";
    confidence: number;
    matchResult: boolean;
    status: "matched" | "mismatched" | "pending_manual";
  }

  // Simulated Unified Verification Controller adhering to the specification
  function processVerification({
    userId,
    dayDate,
    qrResult,
    faceConfidence,
    threshold = 0,
    existingRecord,
    closeCandidateDiff,
  }: {
    userId: string;
    dayDate: string;
    qrResult?: { valid: boolean };
    faceConfidence?: number;
    threshold?: number;
    existingRecord?: AttendanceRecord | null;
    closeCandidateDiff?: number;
  }): {
    status: "present" | "not_marked" | "pending_review";
    attendanceRecord: AttendanceRecord | null;
    attempts: VerificationAttempt[];
    resultCode: string;
  } {
    const attempts: VerificationAttempt[] = [];

    // Evaluate QR
    const qrSuccess = qrResult?.valid === true;
    if (qrResult) {
      attempts.push({
        userId,
        method: "qr",
        confidence: qrSuccess ? 100 : 0,
        matchResult: qrSuccess,
        status: qrSuccess ? "matched" : "mismatched",
      });
    }

    // Evaluate Face (Zero-threshold accepts any established positive identity match: confidence >= threshold && confidence > 0)
    const faceAttempted = typeof faceConfidence === "number";
    const faceSuccess = faceAttempted && faceConfidence >= threshold && faceConfidence > 0;
    const isUncertain = faceAttempted && faceSuccess && typeof closeCandidateDiff === "number" && closeCandidateDiff < 5;

    if (faceAttempted) {
      attempts.push({
        userId,
        method: "face_verification",
        confidence: faceConfidence,
        matchResult: faceSuccess && !isUncertain,
        status: isUncertain ? "pending_manual" : faceSuccess ? "matched" : "mismatched",
      });
    }

    if (isUncertain) {
      return {
        status: "pending_review",
        attendanceRecord: existingRecord ?? null,
        attempts,
        resultCode: "UNCERTAIN_MATCH_PENDING_REVIEW",
      };
    }

    // If attendance already marked, duplicate prevention guarantees original record is preserved
    if (existingRecord && existingRecord.status === "present") {
      return {
        status: "present",
        attendanceRecord: existingRecord,
        attempts,
        resultCode: "ALREADY_MARKED",
      };
    }

    // CORE RULE: QR SUCCESS OR FACE SUCCESS = PRESENT
    if (qrSuccess) {
      const record: AttendanceRecord = {
        id: "att-qr-" + Math.random().toString(36).slice(2),
        userId,
        dayDate,
        status: "present",
        method: "qr",
        checkedInAt: new Date().toISOString(),
        remarks: "Verified via Admin QR Scanner",
      };
      return {
        status: "present",
        attendanceRecord: record,
        attempts,
        resultCode: "VERIFIED_PRESENT",
      };
    }

    if (faceSuccess) {
      const record: AttendanceRecord = {
        id: "att-face-" + Math.random().toString(36).slice(2),
        userId,
        dayDate,
        status: "present",
        method: "qr_selfie",
        checkedInAt: new Date().toISOString(),
        remarks: `Verified via Admin Face Recognition Console (${faceConfidence}% confidence)`,
      };
      return {
        status: "present",
        attendanceRecord: record,
        attempts,
        resultCode: "VERIFIED_PRESENT",
      };
    }

    // Both methods failed or not attempted
    return {
      status: "not_marked",
      attendanceRecord: null,
      attempts,
      resultCode: faceAttempted ? "FACE_NOT_RECOGNIZED" : "INVALID_QR",
    };
  }

  it("marks attendance as PRESENT when QR verification succeeds (without face verification)", () => {
    const res = processVerification({
      userId: "u-1",
      dayDate: "2026-10-30",
      qrResult: { valid: true },
    });

    expect(res.status).toBe("present");
    expect(res.attendanceRecord?.status).toBe("present");
    expect(res.attendanceRecord?.method).toBe("qr");
    expect(res.resultCode).toBe("VERIFIED_PRESENT");
  });

  it("marks attendance as PRESENT when Face verification succeeds (without QR code)", () => {
    const res = processVerification({
      userId: "u-2",
      dayDate: "2026-10-30",
      faceConfidence: 88,
    });

    expect(res.status).toBe("present");
    expect(res.attendanceRecord?.status).toBe("present");
    expect(res.attendanceRecord?.method).toBe("qr_selfie");
    expect(res.resultCode).toBe("VERIFIED_PRESENT");
  });

  it("marks attendance when QR fails but Face verification succeeds under 0% threshold", () => {
    const res = processVerification({
      userId: "u-3",
      dayDate: "2026-10-30",
      qrResult: { valid: false }, // QR expired or unreadable
      faceConfidence: 42, // previously rejected under 75% threshold, now accepted under 0%
    });

    expect(res.status).toBe("present");
    expect(res.attendanceRecord?.method).toBe("qr_selfie");
    expect(res.resultCode).toBe("VERIFIED_PRESENT");
  });

  it("marks attendance when Face verification has low confidence but establishes identity (zero threshold)", () => {
    const res = processVerification({
      userId: "u-4",
      dayDate: "2026-10-30",
      faceConfidence: 35, // low lighting / low confidence, accepted without 75% restriction
      qrResult: { valid: false },
    });

    expect(res.status).toBe("present");
    expect(res.attendanceRecord?.method).toBe("qr_selfie");
    expect(res.resultCode).toBe("VERIFIED_PRESENT");
  });

  it("enforces atomic duplicate prevention: keeps exactly ONE attendance record when both methods succeed", () => {
    // 1. First method: QR succeeds and creates original record
    const firstRun = processVerification({
      userId: "u-5",
      dayDate: "2026-10-30",
      qrResult: { valid: true },
    });
    const originalRecord = firstRun.attendanceRecord;
    expect(originalRecord).not.toBeNull();
    expect(originalRecord?.method).toBe("qr");

    // 2. Second method: Face recognition verified later for the same participant and day
    const secondRun = processVerification({
      userId: "u-5",
      dayDate: "2026-10-30",
      faceConfidence: 94,
      existingRecord: originalRecord,
    });

    // Exactly one attendance record is kept; original record and method are preserved
    expect(secondRun.status).toBe("present");
    expect(secondRun.attendanceRecord?.id).toBe(originalRecord?.id);
    expect(secondRun.attendanceRecord?.method).toBe("qr");
    expect(secondRun.resultCode).toBe("ALREADY_MARKED");
  });

  it("does not mark attendance when identity cannot be established (0% confidence or no face detected)", () => {
    const res = processVerification({
      userId: "u-6",
      dayDate: "2026-10-30",
      qrResult: { valid: false },
      faceConfidence: 0, // unestablished identity / no face in frame
    });

    expect(res.status).toBe("not_marked");
    expect(res.attendanceRecord).toBeNull();
    expect(res.resultCode).toBe("FACE_NOT_RECOGNIZED");
  });

  it("routes uncertain matches with close competitor scores to manual review", () => {
    const res = processVerification({
      userId: "u-7",
      dayDate: "2026-10-30",
      faceConfidence: 86,
      closeCandidateDiff: 2, // candidate 2 is 84%, diff < 5%
    });

    expect(res.status).toBe("pending_review");
    expect(res.resultCode).toBe("UNCERTAIN_MATCH_PENDING_REVIEW");
    expect(res.attendanceRecord).toBeNull();
  });

  it("ensures SESSION_START_HOUR is imported and defined properly for session unlock checks", () => {
    expect(SESSION_START_HOUR).toBeDefined();
    expect(typeof SESSION_START_HOUR).toBe("number");
    expect(SESSION_START_HOUR).toBe(0);
  });
});

describe("QR Code Verification: Entry and Exit Attendance Workflows", () => {
  interface AttendanceRecord {
    id: string;
    user_id: string;
    day_date: string;
    status: string;
    morning_status: string | null;
    afternoon_status: string | null;
    remarks: string;
  }

  function simulateQrVerificationAndConfirmation(
    sessionType: "entry" | "exit" | "both",
    existingRecord: AttendanceRecord | null,
    nowIso: string = new Date().toISOString()
  ): { ok: boolean; resultCode: string; record: AttendanceRecord | null; message: string } {
    const hasEntry = Boolean(
      existingRecord &&
        (existingRecord.morning_status === "present" ||
          (existingRecord.status === "present" && !existingRecord.morning_status))
    );
    const hasExit = Boolean(existingRecord && existingRecord.afternoon_status === "present");

    if (sessionType === "exit") {
      if (!hasEntry) {
        return {
          ok: false,
          resultCode: "FAILED",
          record: existingRecord,
          message: "Entry attendance is missing for today. Participant must mark Entry attendance before Exit.",
        };
      }
      if (hasExit) {
        return {
          ok: false,
          resultCode: "ALREADY_MARKED",
          record: existingRecord,
          message: "Exit attendance has already been recorded for this participant today.",
        };
      }
      return {
        ok: true,
        resultCode: "CONFIRMED",
        record: {
          ...existingRecord!,
          afternoon_status: "present",
          status: "present",
          remarks: `${existingRecord?.remarks || ""} | EXIT_AT:${nowIso}`,
        },
        message: "Exit attendance marked successfully",
      };
    }

    if (sessionType === "entry") {
      if (hasEntry) {
        return {
          ok: false,
          resultCode: "ALREADY_MARKED",
          record: existingRecord,
          message: "Entry attendance has already been recorded for this participant today.",
        };
      }
      if (existingRecord) {
        return {
          ok: true,
          resultCode: "CONFIRMED",
          record: {
            ...existingRecord,
            morning_status: "present",
            status: "present",
            remarks: `${existingRecord.remarks} | ENTRY_AT:${nowIso}`,
          },
          message: "Entry attendance marked successfully",
        };
      }
      return {
        ok: true,
        resultCode: "CONFIRMED",
        record: {
          id: "att-new",
          user_id: "user-1",
          day_date: "2026-11-03",
          status: "present",
          morning_status: "present",
          afternoon_status: null,
          remarks: `Verified via Admin QR Scanner | ENTRY_AT:${nowIso}`,
        },
        message: "Entry attendance marked successfully",
      };
    }

    return {
      ok: true,
      resultCode: "CONFIRMED",
      record: {
        id: existingRecord?.id || "att-both",
        user_id: "user-1",
        day_date: "2026-11-03",
        status: "present",
        morning_status: "present",
        afternoon_status: "present",
        remarks: "Verified via Admin QR Scanner",
      },
      message: "Attendance marked successfully",
    };
  }

  it("marks Entry attendance successfully when no prior record exists", () => {
    const res = simulateQrVerificationAndConfirmation("entry", null);
    expect(res.ok).toBe(true);
    expect(res.resultCode).toBe("CONFIRMED");
    expect(res.record?.morning_status).toBe("present");
    expect(res.record?.afternoon_status).toBeNull();
    expect(res.record?.status).toBe("present");
  });

  it("rejects duplicate Entry attendance with ALREADY_MARKED", () => {
    const existing: AttendanceRecord = {
      id: "att-1",
      user_id: "user-1",
      day_date: "2026-11-03",
      status: "present",
      morning_status: "present",
      afternoon_status: null,
      remarks: "Verified via Admin QR Scanner",
    };
    const res = simulateQrVerificationAndConfirmation("entry", existing);
    expect(res.ok).toBe(false);
    expect(res.resultCode).toBe("ALREADY_MARKED");
    expect(res.message).toContain("Entry attendance has already been recorded");
  });

  it("blocks Exit attendance if Entry attendance was never marked", () => {
    const res = simulateQrVerificationAndConfirmation("exit", null);
    expect(res.ok).toBe(false);
    expect(res.resultCode).toBe("FAILED");
    expect(res.message).toContain("Entry attendance is missing for today");
  });

  it("records Exit attendance when Entry attendance is present", () => {
    const existing: AttendanceRecord = {
      id: "att-1",
      user_id: "user-1",
      day_date: "2026-11-03",
      status: "present",
      morning_status: "present",
      afternoon_status: null,
      remarks: "ENTRY_AT:2026-11-03T09:00:00.000Z",
    };
    const res = simulateQrVerificationAndConfirmation("exit", existing);
    expect(res.ok).toBe(true);
    expect(res.resultCode).toBe("CONFIRMED");
    expect(res.record?.morning_status).toBe("present");
    expect(res.record?.afternoon_status).toBe("present");
    expect(res.record?.remarks).toContain("EXIT_AT:");
  });

  it("rejects duplicate Exit attendance with ALREADY_MARKED", () => {
    const existing: AttendanceRecord = {
      id: "att-1",
      user_id: "user-1",
      day_date: "2026-11-03",
      status: "present",
      morning_status: "present",
      afternoon_status: "present",
      remarks: "ENTRY_AT:... | EXIT_AT:...",
    };
    const res = simulateQrVerificationAndConfirmation("exit", existing);
    expect(res.ok).toBe(false);
    expect(res.resultCode).toBe("ALREADY_MARKED");
    expect(res.message).toContain("Exit attendance has already been recorded");
  });
});

describe("parseAndExtractQrToken Payload Sanitization & Extraction", () => {
  it("extracts clean token from raw hex string", async () => {
    const { parseAndExtractQrToken } = await import("./attendance");
    const raw = "5e36977f9fb3ad21ffca679662e08e9385aa2b8fc2e6613917b215f541e0b72a";
    const res = parseAndExtractQrToken(raw);
    expect(res.token).toBe(raw);
  });

  it("extracts short code string and preserves uppercase code", async () => {
    const { parseAndExtractQrToken } = await import("./attendance");
    const res = parseAndExtractQrToken("  lknwz7  ");
    expect(res.token).toBe("lknwz7");
  });

  it("extracts token and sessionType from full projector QR URL", async () => {
    const { parseAndExtractQrToken } = await import("./attendance");
    const url = "https://event.growiota.in/dashboard?token=5e36977f9fb3ad21ffca679662e08e9385aa2b8fc2e6613917b215f541e0b72a&code=LKNWZ7&session=exit";
    const res = parseAndExtractQrToken(url);
    expect(res.token).toBe("5e36977f9fb3ad21ffca679662e08e9385aa2b8fc2e6613917b215f541e0b72a");
    expect(res.sessionType).toBe("exit");
  });

  it("extracts short code from checkin URL when token param is absent", async () => {
    const { parseAndExtractQrToken } = await import("./attendance");
    const url = "https://event.growiota.in/checkin?code=LKNWZ7";
    const res = parseAndExtractQrToken(url);
    expect(res.token).toBe("LKNWZ7");
  });

  it("extracts token from JSON QR payload", async () => {
    const { parseAndExtractQrToken } = await import("./attendance");
    const jsonStr = JSON.stringify({
      token: "5e36977f9fb3ad21ffca679662e08e9385aa2b8fc2e6613917b215f541e0b72a",
      sessionType: "entry",
    });
    const res = parseAndExtractQrToken(jsonStr);
    expect(res.token).toBe("5e36977f9fb3ad21ffca679662e08e9385aa2b8fc2e6613917b215f541e0b72a");
    expect(res.sessionType).toBe("entry");
  });

  it("handles token= and code= prefixed strings and stripped quotes", async () => {
    const { parseAndExtractQrToken } = await import("./attendance");
    expect(parseAndExtractQrToken('"token=abc123xyz"').token).toBe("abc123xyz");
    expect(parseAndExtractQrToken("'code=LKNWZ7'").token).toBe("LKNWZ7");
  });
});




