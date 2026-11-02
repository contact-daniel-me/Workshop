import { describe, it, expect } from "vitest";
import { detectFaceInVideo } from "./face-detection";

describe("Live Face Detection Client Engine", () => {
  it("returns default unaligned state when video element has no stream or zero dimensions", async () => {
    const video = document.createElement("video");
    const result = await detectFaceInVideo(video);

    expect(result.detected).toBe(false);
    expect(result.score).toBe(0);
    expect(result.alignment).toBe("no_face");
    expect(result.message).toContain("Align face");
  });

  it("handles null/undefined video element gracefully", async () => {
    const result = await detectFaceInVideo(null as unknown as HTMLVideoElement);
    expect(result.detected).toBe(false);
    expect(result.score).toBe(0);
  });
});
