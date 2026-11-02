export interface LiveFaceDetectionState {
  detected: boolean;
  score: number; // 0 - 100 face detection confidence score
  brightness: number; // 0 - 100 illumination score
  alignment: "centered" | "align_face" | "too_dark" | "too_bright" | "no_face";
  message: string;
}

const DEFAULT_DETECTION_STATE: LiveFaceDetectionState = {
  detected: false,
  score: 0,
  brightness: 0,
  alignment: "no_face",
  message: "Align face within the oval guide",
};

/**
 * Universal client-side face detection from an HTML video feed.
 * Uses native browser FaceDetector (Shape Detection API) when available,
 * and falls back to fast off-screen canvas luminance, skin-tone chromatic analysis,
 * and feature gradient evaluation.
 */
export async function detectFaceInVideo(
  video: HTMLVideoElement,
  offscreenCanvas?: HTMLCanvasElement,
): Promise<LiveFaceDetectionState> {
  if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
    return DEFAULT_DETECTION_STATE;
  }

  // 1. Try native Web API FaceDetector if supported (Chromium browsers)
  if (typeof window !== "undefined" && "FaceDetector" in window) {
    try {
      type NativeDetector = {
        detect: (source: ImageBitmapSource) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
      };
      const FaceDetectorCtor = (window as unknown as { FaceDetector: new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => NativeDetector }).FaceDetector;
      const detector = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 1 });
      const faces = await detector.detect(video);

      if (faces && faces.length > 0) {
        const box = faces[0]!.boundingBox;
        const vidW = video.videoWidth;
        const vidH = video.videoHeight;

        // Check if bounding box is reasonably centered within the oval guide
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        const offsetX = Math.abs(centerX - vidW / 2) / vidW;
        const offsetY = Math.abs(centerY - vidH / 2) / vidH;

        const isCentered = offsetX < 0.28 && offsetY < 0.28;
        const sizeRatio = (box.width * box.height) / (vidW * vidH);
        const isGoodSize = sizeRatio > 0.04 && sizeRatio < 0.75;

        const score = Math.min(99, Math.max(70, Math.round(98 - (offsetX + offsetY) * 50)));

        if (isCentered && isGoodSize) {
          return {
            detected: true,
            score,
            brightness: 75,
            alignment: "centered",
            message: "Face Detected • Aligned in Guide",
          };
        } else {
          return {
            detected: true,
            score: Math.max(50, score - 20),
            brightness: 75,
            alignment: "align_face",
            message: "Center your face inside the oval reticle",
          };
        }
      }
    } catch {
      // Fallback to canvas feature analysis if native detector throws
    }
  }

  // 2. Fallback: Fast offscreen canvas skin-tone & central gradient analysis
  const canvas = offscreenCanvas || document.createElement("canvas");
  const sampleW = 160;
  const sampleH = 120;
  canvas.width = sampleW;
  canvas.height = sampleH;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return DEFAULT_DETECTION_STATE;

  try {
    ctx.drawImage(video, 0, 0, sampleW, sampleH);
    const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
    const data = imgData.data;

    let totalLuminance = 0;
    let centralSkinPixels = 0;
    let centralTotalPixels = 0;
    let centralVariance = 0;
    let lastLum = 0;

    // Define central oval ROI in sample coordinates
    const minX = Math.floor(sampleW * 0.25);
    const maxX = Math.floor(sampleW * 0.75);
    const minY = Math.floor(sampleH * 0.18);
    const maxY = Math.floor(sampleH * 0.82);

    for (let y = 0; y < sampleH; y += 2) {
      for (let x = 0; x < sampleW; x += 2) {
        const idx = (y * sampleW + x) * 4;
        const r = data[idx] ?? 0;
        const g = data[idx + 1] ?? 0;
        const b = data[idx + 2] ?? 0;

        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        totalLuminance += lum;

        const inCenter = x >= minX && x <= maxX && y >= minY && y <= maxY;
        if (inCenter) {
          centralTotalPixels++;
          // Rule-based skin-tone chromatic detection in RGB space
          const isSkin =
            r > 60 &&
            g > 35 &&
            b > 20 &&
            r > g &&
            r > b &&
            Math.abs(r - g) > 10 &&
            r - b > 10;
          if (isSkin) centralSkinPixels++;

          if (lastLum > 0) {
            centralVariance += Math.abs(lum - lastLum);
          }
          lastLum = lum;
        }
      }
    }

    const totalSampled = (sampleW * sampleH) / 4;
    const avgBrightness = Math.round((totalLuminance / totalSampled / 255) * 100);

    if (avgBrightness < 18) {
      return {
        detected: false,
        score: 0,
        brightness: avgBrightness,
        alignment: "too_dark",
        message: "Lighting is too dark • Face the light",
      };
    }

    if (avgBrightness > 95) {
      return {
        detected: false,
        score: 0,
        brightness: avgBrightness,
        alignment: "too_bright",
        message: "Overexposed glare • Adjust camera angle",
      };
    }

    const skinRatio = centralTotalPixels > 0 ? centralSkinPixels / centralTotalPixels : 0;
    const avgContrast = centralTotalPixels > 0 ? centralVariance / centralTotalPixels : 0;

    // Face presence criteria: adequate skin tone in center + facial edge contrast
    if (skinRatio >= 0.20 && avgContrast >= 8) {
      const score = Math.min(
        98,
        Math.max(65, Math.round(55 + skinRatio * 30 + Math.min(20, avgContrast)))
      );
      return {
        detected: true,
        score,
        brightness: avgBrightness,
        alignment: "centered",
        message: "Face Detected • Aligned in Guide",
      };
    } else if (skinRatio >= 0.10) {
      return {
        detected: true,
        score: Math.min(65, Math.round(skinRatio * 150)),
        brightness: avgBrightness,
        alignment: "align_face",
        message: "Center your face closer to the oval guide",
      };
    }

    return {
      detected: false,
      score: Math.round(skinRatio * 40),
      brightness: avgBrightness,
      alignment: "no_face",
      message: "Align participant's face within the oval guide",
    };
  } catch {
    return DEFAULT_DETECTION_STATE;
  }
}
