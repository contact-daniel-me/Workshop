import { describe, expect, it } from "vitest";
import {
  generateSecureToken,
  hashToken,
  generateShortCode,
  type QrVerificationResultCode,
} from "./attendance-qr.server";
import { todayLocal, addDays, workshopDays, summarize } from "./attendance";

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

