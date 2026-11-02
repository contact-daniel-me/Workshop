import { describe, it, expect, beforeEach } from "vitest";
import {
  parseUsbHardwareId,
  isStartekFm220,
  resolveStartekDeviceState,
  buildStartekHardwareInfo,
  STARTEK_HARDWARE_SPECS,
} from "./startek-detector";
import {
  encryptTemplate,
  decryptTemplate,
  hashTemplate,
  saveTestEnrollment,
  getTestEnrollment,
  listTestEnrollments,
  deleteTestEnrollment,
  clearAllTestEnrollments,
  compareBiometricTemplates,
} from "./test-store";

describe("Startek FM220 Hardware Detection & Diagnostics", () => {
  it("accurately extracts VID and PID from USB hardware ID strings", () => {
    const res1 = parseUsbHardwareId("USB\\VID_0B39&PID_8220&REV_0001");
    expect(res1.vid).toBe("0B39");
    expect(res1.pid).toBe("8220");

    const res2 = parseUsbHardwareId("USB\\VID_0BCA&PID_8220");
    expect(res2.vid).toBe("0BCA");
    expect(res2.pid).toBe("8220");

    const resEmpty = parseUsbHardwareId("");
    expect(resEmpty.vid).toBeUndefined();
    expect(resEmpty.pid).toBeUndefined();
  });

  it("recognizes official Startek FM220 hardware identifiers and friendly names", () => {
    expect(isStartekFm220("USB\\VID_0B39&PID_8220")).toBe(true);
    expect(isStartekFm220("USB\\VID_0BCA&PID_8220")).toBe(true);
    expect(isStartekFm220(undefined, "Startek FM220 Fingerprint Scanner")).toBe(true);
    expect(isStartekFm220(undefined, "FM220U Fingerprint Scanner")).toBe(true);

    // Non-Startek devices must not match
    expect(isStartekFm220("USB\\VID_0C45&PID_671E")).toBe(false); // Webcam
    expect(isStartekFm220("USB\\VID_0CF3&PID_E009")).toBe(false); // Bluetooth
    expect(isStartekFm220(undefined, "Generic USB Optical Mouse")).toBe(false);
  });

  it("resolves DEVICE_NOT_CONNECTED when scanner is physically unplugged", () => {
    const res = resolveStartekDeviceState({ connected: false });
    expect(res.state).toBe("DEVICE_NOT_CONNECTED");
    expect(res.description).toContain("physically disconnected");
  });

  it("resolves DRIVER_MISSING when hardware is connected but driver is absent or Code 28", () => {
    const res1 = resolveStartekDeviceState({
      connected: true,
      hasProblem: true,
      problemCode: 28,
    });
    expect(res1.state).toBe("DRIVER_MISSING");

    const res2 = resolveStartekDeviceState({
      connected: true,
      driverInstalled: false,
    });
    expect(res2.state).toBe("DRIVER_MISSING");
  });

  it("resolves DRIVER_INCOMPATIBLE when Code 52 or Code 31 occurs", () => {
    const res = resolveStartekDeviceState({
      connected: true,
      driverInstalled: true,
      hasProblem: true,
      problemCode: 52,
    });
    expect(res.state).toBe("DRIVER_INCOMPATIBLE");
    expect(res.description).toContain("incompatible with Windows 11");
  });

  it("resolves SDK_UNAVAILABLE when driver is installed but neither RD service nor native SDK is active", () => {
    const res = resolveStartekDeviceState({
      connected: true,
      driverInstalled: true,
      hasProblem: false,
      rdPort: undefined,
      sdkDllFound: false,
    });
    expect(res.state).toBe("SDK_UNAVAILABLE");
    expect(res.description).toContain("neither the ACPL RD Service");
  });

  it("resolves DEVICE_READY when hardware, driver, and ACPL RD Service are running", () => {
    const res = resolveStartekDeviceState({
      connected: true,
      driverInstalled: true,
      hasProblem: false,
      rdPort: 11100,
    });
    expect(res.state).toBe("DEVICE_READY");
    expect(res.description).toContain("ACPL RD Service port 11100");
  });

  it("builds full diagnostic telemetry for Windows 11 64-bit environment", () => {
    const info = buildStartekHardwareInfo({
      connected: true,
      rawHardwareId: "USB\\VID_0B39&PID_8220",
      friendlyName: "Startek FM220",
      driverInstalled: true,
      driverArch: "x64",
      rdPort: 11100,
    });

    expect(info.vendorId).toBe("0B39");
    expect(info.productId).toBe("8220");
    expect(info.osArchitecture).toBe("win32-x64");
    expect(info.isArchitectureCompatible).toBe(true);
    expect(info.rdServiceRunning).toBe(true);
    expect(info.sdkType).toBe("ACPL_RD_SERVICE");
    expect(info.state).toBe("DEVICE_READY");
  });
});

describe("Biometric Template Security & Isolated Test Storage", () => {
  beforeEach(() => {
    clearAllTestEnrollments();
  });

  it("safely encrypts and decrypts biometric templates with AES-256-GCM", () => {
    const rawTemplate = "ANSI378_SAMPLE_MINUTIAE_DATA_VEC_789423984723984";
    const encrypted = encryptTemplate(rawTemplate);

    expect(encrypted).not.toBe(rawTemplate);
    expect(encrypted).toContain(":"); // IV:AuthTag:Encrypted

    const decrypted = decryptTemplate(encrypted);
    expect(decrypted).toBe(rawTemplate);
  });

  it("computes SHA-256 integrity hash of template", () => {
    const rawTemplate = "MINUTIAE_HASH_TEST_STRING";
    const hash = hashTemplate(rawTemplate);
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashTemplate(rawTemplate));
  });

  it("manages isolated test enrollments without touching production data", () => {
    const rawTemplate = "TEST_USER_RAW_SAMPLE_1";
    saveTestEnrollment({
      testUserId: "TEST-01",
      finger: "right_index",
      enrolledAt: new Date().toISOString(),
      qualityScore: 85,
      templateHash: hashTemplate(rawTemplate),
      encryptedTemplate: encryptTemplate(rawTemplate),
      algorithm: "ANSI-378",
    });

    const stored = getTestEnrollment("TEST-01", "right_index");
    expect(stored).toBeDefined();
    expect(stored?.qualityScore).toBe(85);

    const list = listTestEnrollments();
    expect(list).toHaveLength(1);
    expect(list[0]?.testUserId).toBe("TEST-01");
    // Ensure raw encryptedTemplate is omitted in public listing
    expect((list[0] as any).encryptedTemplate).toBeUndefined();

    // Delete single
    const deleted = deleteTestEnrollment("TEST-01", "right_index");
    expect(deleted).toBe(true);
    expect(getTestEnrollment("TEST-01", "right_index")).toBeUndefined();
  });
});

describe("One-to-One Biometric Matching Engine & Negative Testing", () => {
  it("positively verifies identical / matching fingerprint templates", () => {
    const template = "MINUTIAE_ANSI_378_FINGERPRINT_SAMPLE_ALPHA_V1";
    const comparison = compareBiometricTemplates(template, template, 60);

    expect(comparison.match).toBe(true);
    expect(comparison.score).toBeGreaterThanOrEqual(60);
    expect(comparison.scale).toContain("0 to 100");
  });

  it("accurately rejects different finger or impostor fingerprint templates", () => {
    const enrolledTemplate = "MINUTIAE_PERSON_A_RIGHT_INDEX_TEXTURE_HASH_84729482";
    const impostorTemplate = "MINUTIAE_PERSON_B_LEFT_THUMB_TEXTURE_HASH_19472910";

    const comparison = compareBiometricTemplates(enrolledTemplate, impostorTemplate, 60);
    expect(comparison.match).toBe(false);
    expect(comparison.score).toBeLessThan(60);
  });

  it("handles corrupted, empty, or invalid input gracefully", () => {
    const emptyComp = compareBiometricTemplates("", "VALID_SAMPLE", 60);
    expect(emptyComp.match).toBe(false);
    expect(emptyComp.score).toBe(0);

    const bothEmpty = compareBiometricTemplates("", "", 60);
    expect(bothEmpty.match).toBe(false);
    expect(bothEmpty.score).toBe(0);
  });
});
