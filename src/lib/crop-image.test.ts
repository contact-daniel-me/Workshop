import { describe, expect, it } from "vitest";
import { getRadianAngle, rotateSize, blobToFile } from "./crop-image";

describe("Crop Image Calculations", () => {
  it("converts degree angles to radians correctly", () => {
    expect(getRadianAngle(0)).toBe(0);
    expect(getRadianAngle(90)).toBeCloseTo(Math.PI / 2, 5);
    expect(getRadianAngle(180)).toBeCloseTo(Math.PI, 5);
    expect(getRadianAngle(270)).toBeCloseTo((3 * Math.PI) / 2, 5);
    expect(getRadianAngle(360)).toBeCloseTo(2 * Math.PI, 5);
  });

  it("calculates rotated bounding box dimensions accurately", () => {
    // At 0 degrees rotation, width and height remain unchanged
    const unrotated = rotateSize(800, 600, 0);
    expect(Math.round(unrotated.width)).toBe(800);
    expect(Math.round(unrotated.height)).toBe(600);

    // At 90 degrees rotation, width and height swap
    const rotated90 = rotateSize(800, 600, 90);
    expect(Math.round(rotated90.width)).toBe(600);
    expect(Math.round(rotated90.height)).toBe(800);

    // At 180 degrees rotation, dimensions are identical to original
    const rotated180 = rotateSize(800, 600, 180);
    expect(Math.round(rotated180.width)).toBe(800);
    expect(Math.round(rotated180.height)).toBe(600);

    // At 270 degrees rotation, width and height swap
    const rotated270 = rotateSize(800, 600, 270);
    expect(Math.round(rotated270.width)).toBe(600);
    expect(Math.round(rotated270.height)).toBe(800);
  });

  it("converts Blobs to standard File objects with proper metadata", () => {
    const mockBlob = new Blob(["mock-image-data-bytes"], { type: "image/jpeg" });
    const file = blobToFile(mockBlob, "participant_cropped.jpg");

    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("participant_cropped.jpg");
    expect(file.type).toBe("image/jpeg");
    expect(file.size).toBe(mockBlob.size);
  });
});

