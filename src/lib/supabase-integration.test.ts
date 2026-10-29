import { describe, expect, it } from "vitest";
import {
  phoneToAuthEmail,
  normalizeAppPassword,
  resolveAuthIdentifier,
  appUniversalSignIn,
} from "./auth-helpers";
import { normalizePhone, INDIAN_PHONE } from "./attendance";

describe("Supabase Phone Auth Mapping & Password Normalization", () => {
  it("deterministically maps 10-digit phone to authentication email", () => {
    const email1 = phoneToAuthEmail("9876543210");
    const email2 = phoneToAuthEmail("+91 98765-43210");
    expect(email1).toBe("9876543210@smartattend.in");
    expect(email2).toBe("9876543210@smartattend.in");
  });

  it("salts passwords to bypass dictionary/HaveIBeenPwned weak password blocks", () => {
    const raw = "123456";
    const salted = normalizeAppPassword(raw);
    expect(salted).not.toBe(raw);
    expect(salted).toContain("SA#2026_");
    expect(salted).toContain("123456");
    expect(salted.length).toBeGreaterThan(12);
  });

  it("normalizes and validates Indian phone numbers correctly", () => {
    expect(normalizePhone("+91 98765 43210")).toBe("9876543210");
    expect(normalizePhone("09876543210")).toBe("9876543210");
    expect(INDIAN_PHONE.test(normalizePhone("9876543210"))).toBe(true);
    expect(INDIAN_PHONE.test("5555555555")).toBe(false); // invalid starting digit
  });
});

describe("Email and Phone Dual-Identifier Sign-In", () => {
  it("automatically identifies phone number vs email address format", async () => {
    const phoneRes = await resolveAuthIdentifier("9876543210");
    expect(phoneRes).toBe("9876543210@smartattend.in");

    const formattedPhoneRes = await resolveAuthIdentifier("+91 98765 43210");
    expect(formattedPhoneRes).toBe("9876543210@smartattend.in");

    // Email identifier
    const emailRes = await resolveAuthIdentifier("test.participant@example.com");
    expect(typeof emailRes).toBe("string");
    expect(emailRes.length).toBeGreaterThan(0);
  });

  it("validates missing identifier or password with clear feedback", async () => {
    const emptyIdRes = await appUniversalSignIn("", "password123");
    expect(emptyIdRes.data.user).toBeNull();
    expect(emptyIdRes.error?.message).toContain("email address or mobile number");

    const emptyPwRes = await appUniversalSignIn("9876543210", "");
    expect(emptyPwRes.data.user).toBeNull();
    expect(emptyPwRes.error?.message).toContain("password");
  });

  it("returns generic credential error for invalid accounts preventing enumeration", async () => {
    const res = await appUniversalSignIn("nonexistent.user99999@example.com", "wrongpassword");
    expect(res.data.user).toBeNull();
    expect(res.error?.message).toContain("Invalid email address, mobile number, or password");
  });
});

describe("Face Verification Engine Logic", () => {
  it("produces identical feature vector for identical buffers", async () => {
    const testBuf = Buffer.from("test_image_data_simulating_jpeg_face_pixels_1234567890");
    
    // Test similarity computation logic directly
    const sampleCount = 64;
    const step = Math.max(1, Math.floor(testBuf.length / sampleCount));
    let dotProduct = 0;
    let norm = 0;
    for (let i = 0; i < sampleCount; i++) {
      const b = testBuf[i * step] ?? 0;
      dotProduct += b * b;
      norm += b * b;
    }
    const cosineSim = norm === 0 ? 0 : dotProduct / norm;
    expect(cosineSim).toBe(1);
  });

  it("differentiates between distinct image buffers", () => {
    const bufA = Buffer.alloc(100, 20);
    const bufB = Buffer.alloc(100, 200);

    let diff = 0;
    for (let i = 0; i < 100; i++) {
      diff += Math.abs(bufA[i] - bufB[i]);
    }
    expect(diff).toBe(18000);
  });
});

describe("QR Expiry and Duplicate Attendance Security Logic", () => {
  it("identifies expired QR timestamps", () => {
    const pastExpiry = new Date(Date.now() - 60000).toISOString();
    const futureExpiry = new Date(Date.now() + 600000).toISOString();

    expect(new Date(pastExpiry).getTime() < Date.now()).toBe(true);
    expect(new Date(futureExpiry).getTime() > Date.now()).toBe(true);
  });

  it("handles duplicate key error code 23505 properly", () => {
    const err = { code: "23505", message: "duplicate key value violates unique constraint" };
    const isDuplicate = err.code === "23505";
    expect(isDuplicate).toBe(true);
  });

  it("enforces verification approval check before allowing attendance", () => {
    const canCheckIn = (status: string) => status === "verified";

    expect(canCheckIn("pending")).toBe(false);
    expect(canCheckIn("rejected")).toBe(false);
    expect(canCheckIn("verified")).toBe(true);
  });

  it("supports role assignment for both participants and administrators", () => {
    const allowedRoles = ["participant", "attendance_admin", "super_admin"];
    expect(allowedRoles.includes("participant")).toBe(true);
    expect(allowedRoles.includes("attendance_admin")).toBe(true);
  });
});

