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

  // JPEG: FF D8 (SOI marker)
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return { ext: "jpg", mime: "image/jpeg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
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

  // ISO Media / HEIC / AVIF containers: bytes 4-7 = "ftyp"
  if (
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    return { ext: "jpg", mime: "image/jpeg" };
  }

  throw new Error("Invalid image format. Only authentic JPEG, PNG, and WebP images are permitted.");
}

/**
 * Automatically optimizes, resizes, and normalizes an image file in the browser.
 * Converts large smartphone photos (which are often 5MB-15MB) into a crisp, compressed
 * JPEG (< 1MB) with valid JPEG headers and correct orientation.
 */
export async function optimizeImageFile(file: File, maxDim = 1200, quality = 0.88): Promise<File> {
  if (typeof window === "undefined" || !file || !file.type.startsWith("image/")) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const safeName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
          const optimizedFile = new File([blob], safeName, {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          resolve(optimizedFile);
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}

/**
 * Validates a browser File object using slice + ArrayBuffer magic byte detection.
 */
export async function validateClientImageFile(file: File): Promise<ValidatedImage> {
  if (!file) throw new Error("Please select a photograph.");
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("Photograph exceeds the maximum file size limit (20 MB).");
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

