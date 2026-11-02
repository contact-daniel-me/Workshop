import type {
  StartekHardwareInfo,
  BiometricCaptureResult,
  BiometricVerificationResult,
  BiometricEnrollmentRecord,
  FingerType,
} from "./types";
import { buildStartekHardwareInfo } from "./startek-detector";

const BRIDGE_BASE_URL = "http://127.0.0.1:8099";

/**
 * Checks whether the local Startek Biometric Bridge is running and retrieves live hardware status
 */
export async function fetchBiometricHardwareStatus(): Promise<StartekHardwareInfo> {
  try {
    const res = await fetch(`${BRIDGE_BASE_URL}/api/biometric/status`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2500),
    });

    if (res.ok) {
      const data = (await res.json()) as StartekHardwareInfo;
      return data;
    }
  } catch {
    // Bridge service is not currently running or reached
  }

  // Fallback direct probe: check if ACPL RD service is listening on port 11100 directly
  let rdServiceFound = false;
  let rdPort: number | undefined;

  for (const port of [11100, 11200, 11101]) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(500),
      });
      if (res.ok || res.status === 404 || res.status === 405) {
        rdServiceFound = true;
        rdPort = port;
        break;
      }
    } catch {
      // Not listening on this port
    }
  }

  return buildStartekHardwareInfo({
    connected: false,
    driverInstalled: false,
    rdPort,
    sdkDllFound: false,
  });
}

/**
 * Requests a fingerprint capture from the local hardware bridge
 */
export async function captureBiometricFingerprint(): Promise<BiometricCaptureResult> {
  try {
    const res = await fetch(`${BRIDGE_BASE_URL}/api/biometric/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(12000), // 12-second timeout for finger placement
    });

    const data = await res.json();
    return data as BiometricCaptureResult;
  } catch (err) {
    return {
      success: false,
      deviceState: "DEVICE_NOT_CONNECTED",
      error:
        err instanceof Error && err.name === "TimeoutError"
          ? "Fingerprint capture timed out. Ensure finger is placed firmly on sensor."
          : "Local Biometric Bridge is not responding on 127.0.0.1:8099. Start the bridge with: npm run biometric:bridge",
      capturedAt: new Date().toISOString(),
    };
  }
}

/**
 * Enrolls a test participant's fingerprint template into isolated test storage
 */
export async function enrollBiometricFingerprint(
  testUserId: string,
  finger: FingerType,
  sampleTemplate?: string
): Promise<{ success: boolean; record?: BiometricEnrollmentRecord; error?: string }> {
  try {
    const res = await fetch(`${BRIDGE_BASE_URL}/api/biometric/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testUserId, finger, sampleTemplate }),
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();
    if (res.ok) {
      return { success: true, record: data as BiometricEnrollmentRecord };
    }
    return { success: false, error: data.error || "Enrollment failed." };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Could not reach local biometric bridge on 127.0.0.1:8099.",
    };
  }
}

/**
 * Verifies a test participant's fingerprint against their enrolled template
 */
export async function verifyBiometricFingerprint(
  testUserId: string,
  finger: FingerType,
  options?: {
    sampleTemplate?: string;
    isNegativeTest?: boolean;
    testScenario?: "DIFFERENT_PERSON" | "DIFFERENT_FINGER" | "POOR_QUALITY";
  }
): Promise<BiometricVerificationResult> {
  try {
    const res = await fetch(`${BRIDGE_BASE_URL}/api/biometric/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        testUserId,
        finger,
        sampleTemplate: options?.sampleTemplate,
        isNegativeTest: options?.isNegativeTest,
        testScenario: options?.testScenario,
      }),
      signal: AbortSignal.timeout(8000),
    });

    const data = await res.json();
    return data as BiometricVerificationResult;
  } catch (err) {
    return {
      verified: false,
      matchScore: 0,
      threshold: 60,
      scale: "0 to 100 scale (>= 60 indicates positive one-to-one identity match)",
      testUserId,
      finger,
      deviceState: "DEVICE_NOT_CONNECTED",
      failureReason: "DEVICE_UNAVAILABLE",
      message:
        err instanceof Error
          ? err.message
          : "Biometric Bridge is unavailable. Start bridge at 127.0.0.1:8099.",
      verifiedAt: new Date().toISOString(),
    };
  }
}

/**
 * Fetches all active test enrollments from the isolated prototype store
 */
export async function fetchTestEnrollments(): Promise<
  Array<Omit<BiometricEnrollmentRecord, "encryptedTemplate">>
> {
  try {
    const res = await fetch(`${BRIDGE_BASE_URL}/api/biometric/enrollments`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      return (data.records as Array<Omit<BiometricEnrollmentRecord, "encryptedTemplate">>) || [];
    }
  } catch {
    // Bridge down
  }
  return [];
}

/**
 * Deletes a single enrollment or clears all test enrollments
 */
export async function deleteTestEnrollments(
  testUserId?: string,
  finger?: FingerType
): Promise<{ success: boolean; message: string }> {
  try {
    const query = testUserId && finger ? `?testUserId=${testUserId}&finger=${finger}` : "";
    const res = await fetch(`${BRIDGE_BASE_URL}/api/biometric/enrollments${query}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, message: data.message };
    }
  } catch (err) {
    return { success: false, message: (err as Error).message };
  }
  return { success: false, message: "Failed to delete test enrollments." };
}
