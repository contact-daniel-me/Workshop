/**
 * Image Cropping Utility using HTML5 Canvas
 * Handles rotation, zooming, scaling, and square bounding box extraction.
 */

export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Loads an image from a URL or ObjectURL
 */
export function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });
}

export function getRadianAngle(degreeValue: number): number {
  return (degreeValue * Math.PI) / 180;
}

/**
 * Returns the new bounding area of a rotated rectangle
 */
export function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation);
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

/**
 * Crops and rotates an image using an HTML5 Canvas, returning a high-quality Blob
 */
export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: PixelCrop,
  rotation = 0,
  outputType = "image/jpeg",
  outputQuality = 0.92
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas 2D rendering context not available.");
  }

  const rotRad = getRadianAngle(rotation);

  // Calculate rotated bounding box
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.width, image.height, rotation);

  // Set intermediate canvas size to match the rotated bounding box
  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  // Translate canvas center to image center, then apply rotation
  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.translate(-image.width / 2, -image.height / 2);

  // Draw the original image onto the rotated canvas
  ctx.drawImage(image, 0, 0);

  // Create the final cropped canvas (standardize to max 800x800 for high quality profile photos)
  const targetSize = Math.min(Math.max(Math.round(pixelCrop.width), Math.round(pixelCrop.height)), 800);
  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = targetSize;
  croppedCanvas.height = targetSize;

  const croppedCtx = croppedCanvas.getContext("2d");
  if (!croppedCtx) {
    throw new Error("Cropped canvas 2D rendering context not available.");
  }

  // Draw only the selected crop area onto the final canvas
  croppedCtx.drawImage(
    canvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    targetSize,
    targetSize
  );

  return new Promise((resolve, reject) => {
    croppedCanvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas toBlob failed to produce an image."));
          return;
        }
        resolve(blob);
      },
      outputType,
      outputQuality
    );
  });
}

/**
 * Converts a Blob to a File with a specified filename
 */
export function blobToFile(blob: Blob, fileName = "profile_photo.jpg"): File {
  return new File([blob], fileName, { type: blob.type || "image/jpeg" });
}
