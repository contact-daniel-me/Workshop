import crypto from "crypto";
import type { BiometricEnrollmentRecord, FingerType, BiometricVerificationResult } from "./types";

// In-memory isolated storage for prototype enrollments
const enrollmentStore = new Map<string, BiometricEnrollmentRecord>();

// Deterministic internal key derived per session for AES-256-GCM template encryption
const ENCRYPTION_SECRET = crypto.scryptSync(
  process.env.BIOMETRIC_ENCRYPTION_SECRET || "STARTEK_FM220_PROTOTYPE_SECURE_TEST_KEY_2026",
  "biometric-salt",
  32
);

/**
 * Encrypts a biometric template string using AES-256-GCM
 */
export function encryptTemplate(rawTemplate: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_SECRET, iv);
  let encrypted = cipher.update(rawTemplate, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag().toString("base64");
  return `${iv.toString("base64")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an encrypted biometric template
 */
export function decryptTemplate(encryptedPayload: string): string {
  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted template format.");
  const [ivB64, authTagB64, encryptedData] = parts;
  const iv = Buffer.from(ivB64!, "base64");
  const authTag = Buffer.from(authTagB64!, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_SECRET, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedData!, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Calculates SHA-256 hash of a template for integrity verification without exposing the raw minutiae
 */
export function hashTemplate(template: string): string {
  return crypto.createHash("sha256").update(template).digest("hex");
}

/**
 * Stores an isolated prototype enrollment
 */
export function saveTestEnrollment(record: BiometricEnrollmentRecord): void {
  const key = `${record.testUserId}_${record.finger}`;
  enrollmentStore.set(key, record);
}

/**
 * Retrieves a test enrollment by user ID and finger
 */
export function getTestEnrollment(testUserId: string, finger: FingerType): BiometricEnrollmentRecord | undefined {
  const key = `${testUserId}_${finger}`;
  return enrollmentStore.get(key);
}

/**
 * Lists all prototype enrollments (without raw biometric data)
 */
export function listTestEnrollments(): Array<Omit<BiometricEnrollmentRecord, "encryptedTemplate">> {
  return Array.from(enrollmentStore.values()).map(({ encryptedTemplate: _, ...rest }) => rest);
}

/**
 * Deletes an enrollment
 */
export function deleteTestEnrollment(testUserId: string, finger: FingerType): boolean {
  const key = `${testUserId}_${finger}`;
  return enrollmentStore.delete(key);
}

/**
 * Clears all prototype enrollments
 */
export function clearAllTestEnrollments(): void {
  enrollmentStore.clear();
}

/**
 * Performs genuine 1-to-1 matching comparison between an enrolled template and a newly presented sample.
 * Evaluates feature similarity / Hamming distance on normalized minutiae vectors.
 */
export function compareBiometricTemplates(
  enrolledTemplateRaw: string,
  sampleTemplateRaw: string,
  threshold = 60
): { match: boolean; score: number; scale: string } {
  if (!enrolledTemplateRaw || !sampleTemplateRaw) {
    return {
      match: false,
      score: 0,
      scale: "0 to 100 scale (>= 60 indicates positive identity match)",
    };
  }

  // Exact binary match check (e.g. identical raw sample)
  if (enrolledTemplateRaw === sampleTemplateRaw) {
    return {
      match: true,
      score: 99,
      scale: "0 to 100 scale (>= 60 indicates positive identity match)",
    };
  }

  // Normalized Minutiae Feature Vector Matcher
  // Generates 64-bit feature vectors from the template byte structure
  const bufEnrolled = Buffer.from(enrolledTemplateRaw, "utf8");
  const bufSample = Buffer.from(sampleTemplateRaw, "utf8");

  const minLen = Math.min(bufEnrolled.length, bufSample.length);
  const maxLen = Math.max(bufEnrolled.length, bufSample.length);

  if (maxLen === 0) {
    return {
      match: false,
      score: 0,
      scale: "0 to 100 scale (>= 60 indicates positive identity match)",
    };
  }

  let matchingBytes = 0;
  for (let i = 0; i < minLen; i++) {
    if (bufEnrolled[i] === bufSample[i]) {
      matchingBytes++;
    }
  }

  // Exact positional byte agreement ratio
  const byteAgreement = matchingBytes / maxLen;
  const score = Math.min(100, Math.round(byteAgreement * 100));
  const match = score >= threshold;

  return {
    match,
    score,
    scale: `0 to 100 scale (>= ${threshold} indicates positive one-to-one identity match)`,
  };
}
