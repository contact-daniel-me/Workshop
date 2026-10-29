/**
 * Genuine image validation using magic bytes.
 * Ensures uploaded files are real JPEG, PNG, or WebP images and not disguised executables or text files.
 */

export interface ValidatedImage {
  ext: "jpg" | "png" | "webp";
  mime: string;
}

/**
 * Validates a Buffer on the server against known image header magic bytes.
 */
export function validateImageMagicBytes(buffer: Uint8Array | Buffer): ValidatedImage {
  if (!buffer || buffer.length < 12) {
    throw new Error("Invalid image: file is too small or corrupted.");
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: "png", mime: "image/png" };
  }

  // WebP: RIFF (bytes 0-3) and WEBP (bytes 8-11)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { ext: "webp", mime: "image/webp" };
  }

  throw new Error("Invalid image format. Only authentic JPEG, PNG, and WebP images are permitted.");
}

/**
 * Validates a browser File object using slice + ArrayBuffer magic byte detection.
 */
export async function validateClientImageFile(file: File): Promise<ValidatedImage> {
  if (!file) throw new Error("Please select a photograph.");
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Photograph exceeds the 5 MB file size limit.");
  }
  if (file.size < 12) {
    throw new Error("Photograph file is too small or corrupted.");
  }

  const header = await file.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(header);
  return validateImageMagicBytes(bytes);
}

/**
 * Converts a File to base64 string.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      // Strip metadata data:image/...;base64, prefix if present
      const base64 = res.includes(",") ? res.split(",")[1] : res;
      resolve(base64);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

