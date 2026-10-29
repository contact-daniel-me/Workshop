import { describe, it, expect } from "vitest";
import { validateImageMagicBytes } from "./image-validation";

describe("validateImageMagicBytes", () => {
  it("recognizes genuine JPEG header bytes", () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const result = validateImageMagicBytes(jpegBytes);
    expect(result.ext).toBe("jpg");
    expect(result.mime).toBe("image/jpeg");
  });

  it("recognizes genuine PNG header bytes", () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const result = validateImageMagicBytes(pngBytes);
    expect(result.ext).toBe("png");
    expect(result.mime).toBe("image/png");
  });

  it("recognizes genuine WebP header bytes", () => {
    const webpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    const result = validateImageMagicBytes(webpBytes);
    expect(result.ext).toBe("webp");
    expect(result.mime).toBe("image/webp");
  });

  it("rejects non-image text files or executables", () => {
    const textBytes = new TextEncoder().encode("Hello world! This is a plain text file.");
    expect(() => validateImageMagicBytes(textBytes)).toThrow(/Invalid image format/);
  });

  it("rejects corrupted or too-small files", () => {
    const tooSmall = new Uint8Array([0xff, 0xd8]);
    expect(() => validateImageMagicBytes(tooSmall)).toThrow(/too small/);
  });
});
