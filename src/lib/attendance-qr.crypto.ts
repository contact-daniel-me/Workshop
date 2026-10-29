import crypto from "node:crypto";

/**
 * Generate cryptographically secure random token (48-char hex)
 */
export function generateSecureToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Hash token using SHA-256 for secure storage & fast indexed lookup
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

/**
 * 6-character human-friendly uppercase alphanumeric short code
 */
export function generateShortCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars[bytes[i]! % chars.length];
  }
  return result;
}
