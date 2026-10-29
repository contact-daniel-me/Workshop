import { describe, it, expect } from "vitest";
import { validateImageMagicBytes } from "./image-validation";
import { normalizePhone, INDIAN_PHONE } from "./attendance";

describe("Admin Register Participant Validation & Helpers", () => {
  it("strictly validates Indian 10-digit mobile phone numbers", () => {
    expect(INDIAN_PHONE.test(normalizePhone("9876543210"))).toBe(true);
    expect(INDIAN_PHONE.test(normalizePhone("+91 9876543210"))).toBe(true);
    expect(INDIAN_PHONE.test(normalizePhone("09876543210"))).toBe(true);
    expect(INDIAN_PHONE.test(normalizePhone("12345"))).toBe(false);
    expect(INDIAN_PHONE.test(normalizePhone("abcdefghij"))).toBe(false);
  });

  it("strictly validates image magic bytes to prevent forged files", () => {
    // Valid JPEG
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    expect(validateImageMagicBytes(jpeg).ext).toBe("jpg");

    // Valid PNG
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    expect(validateImageMagicBytes(png).ext).toBe("png");

    // Valid WebP
    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x10, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    expect(validateImageMagicBytes(webp).ext).toBe("webp");

    // Plain text disguised as image
    const fakeJpg = new TextEncoder().encode("Not an image file at all!");
    expect(() => validateImageMagicBytes(fakeJpg)).toThrow(/Invalid image format/);
  });

  it("validates email formatting correctly", () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    expect(emailRegex.test("ananya@growiota.in")).toBe(true);
    expect(emailRegex.test("participant.workshop@domain.co")).toBe(true);
    expect(emailRegex.test("invalid-email")).toBe(false);
    expect(emailRegex.test("missing@domain")).toBe(false);
  });
});

