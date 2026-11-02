/**
 * Hardware, driver, and SDK states for Startek FM220 Biometric Scanner
 */
export type StartekDeviceState =
  | "DEVICE_NOT_CONNECTED"
  | "DEVICE_DETECTED"
  | "DRIVER_MISSING"
  | "DRIVER_INCOMPATIBLE"
  | "SDK_UNAVAILABLE"
  | "DEVICE_READY"
  | "DEVICE_INIT_FAILED";

export interface StartekHardwareInfo {
  connected: boolean;
  state: StartekDeviceState;
  stateDescription: string;
  vendorId?: string; // e.g. "0B39" or "0BCA"
  productId?: string; // e.g. "8220"
  hardwareId?: string; // e.g. "USB\\VID_0B39&PID_8220"
  friendlyName?: string;
  driverInstalled: boolean;
  driverName?: string;
  driverVersion?: string;
  driverArchitecture?: string; // "x64" | "x86"
  isArchitectureCompatible: boolean;
  osArchitecture: string; // "win32-x64"
  rdServiceRunning: boolean;
  rdServicePort?: number;
  rdServiceVersion?: string;
  sdkAvailable: boolean;
  sdkType?: "NATIVE_DLL" | "ACPL_RD_SERVICE" | "NONE";
  sdkDetails?: string;
  lastCheckedAt: string;
  error?: string;
}

export type FingerType =
  | "right_thumb"
  | "right_index"
  | "right_middle"
  | "right_ring"
  | "right_little"
  | "left_thumb"
  | "left_index"
  | "left_middle"
  | "left_ring"
  | "left_little";

export interface BiometricCaptureResult {
  success: boolean;
  deviceState: StartekDeviceState;
  qualityScore?: number; // 0-100 scale
  templateEncrypted?: string; // AES-256-GCM encrypted template token
  templateHash?: string; // SHA-256 verification hash
  nfiqScore?: number; // NFIQ standard 1-5 (1 = best)
  capturedAt: string;
  error?: string;
}

export interface BiometricEnrollmentRecord {
  testUserId: string;
  finger: FingerType;
  enrolledAt: string;
  qualityScore: number;
  templateHash: string;
  encryptedTemplate: string;
  algorithm: "ANSI-378" | "ISO-19794-2" | "PROPRIETARY";
}

export interface BiometricVerificationResult {
  verified: boolean;
  matchScore: number; // e.g. 0-100 or matching distance
  threshold: number; // e.g. 60
  scale: string; // "0-100 where >= 60 indicates positive one-to-one identity match"
  testUserId: string;
  finger: FingerType;
  deviceState: StartekDeviceState;
  verifiedAt: string;
  failureReason?:
    | "DEVICE_UNAVAILABLE"
    | "POOR_QUALITY"
    | "NOT_ENROLLED"
    | "BIOMETRIC_MISMATCH"
    | "DIFFERENT_FINGER"
    | "INVALID_INPUT";
  message: string;
}
