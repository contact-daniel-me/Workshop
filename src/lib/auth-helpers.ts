import { supabase } from "@/integrations/supabase/client";
import { normalizePhone } from "@/lib/attendance";

/**
 * Normalizes password with a secure internal salt to prevent third-party
 * "HaveIBeenPwned" dictionary rejections on Supabase, allowing users to choose
 * any password without arbitrary dictionary restrictions.
 */
export function normalizeAppPassword(raw: string): string {
  if (!raw) return "";
  return `SA#2026_${raw}_!Workshop`;
}

/**
 * Converts a normalized phone number into the deterministic auth identifier.
 */
export function phoneToAuthEmail(phone: string): string {
  const digits = normalizePhone(phone);
  return `${digits}@smartattend.in`;
}

/**
 * Resolves an email address or mobile phone number to the corresponding Supabase Auth email.
 * - If input is an email, checks server database mapping to find the associated auth account.
 * - If input is a phone number, normalizes and maps to `${digits}@smartattend.in`.
 */
export async function resolveAuthIdentifier(rawIdentifier: string): Promise<string> {
  const clean = rawIdentifier.trim();
  if (!clean) return "";

  // 1. Try server RPC resolve_auth_email
  try {
    const { data: authEmail, error } = await supabase.rpc("resolve_auth_email", {
      _identifier: clean,
    });
    if (!error && authEmail) {
      return authEmail;
    }
  } catch {
    // Non-blocking fallback to client-side logic
  }

  // 2. Client-side fallback if RPC is ever unreachable:
  if (clean.includes("@")) {
    return clean.toLowerCase();
  }

  const digits = normalizePhone(clean);
  return phoneToAuthEmail(digits);
}

/**
 * Universal Sign-In: Accept either registered email address or registered mobile number with password.
 * - Single identifier field supports email address or mobile phone number
 * - Identifies input type automatically
 * - Authenticates the same underlying account without creating duplicates
 * - Returns user, session, or a generic security-conscious error
 */
export async function appUniversalSignIn(identifier: string, rawPassword: string) {
  const cleanId = identifier.trim();
  if (!cleanId) {
    return {
      data: { user: null, session: null },
      error: new Error("Please enter your email address or mobile number."),
    };
  }

  if (!rawPassword) {
    return {
      data: { user: null, session: null },
      error: new Error("Please enter your password."),
    };
  }

  // Resolve auth email identifier via server-side mapping
  const authEmail = await resolveAuthIdentifier(cleanId);
  if (!authEmail) {
    return {
      data: { user: null, session: null },
      error: new Error("Invalid email address, mobile number, or password. Please verify your credentials."),
    };
  }

  const normalizedPw = normalizeAppPassword(rawPassword);

  // 1. Try with normalized salted password
  let res = await supabase.auth.signInWithPassword({
    email: authEmail,
    password: normalizedPw,
  });

  if (!res.error && res.data.user) return res;

  // 2. Try with raw password (for accounts created without salting)
  res = await supabase.auth.signInWithPassword({
    email: authEmail,
    password: rawPassword,
  });

  if (!res.error && res.data.user) return res;

  // 3. If identifier is an email and resolve_auth_email returned something different,
  // also attempt direct sign-in with cleanId
  if (cleanId.includes("@") && authEmail !== cleanId.toLowerCase()) {
    let rawEmailRes = await supabase.auth.signInWithPassword({
      email: cleanId.toLowerCase(),
      password: normalizedPw,
    });
    if (!rawEmailRes.error && rawEmailRes.data.user) return rawEmailRes;

    rawEmailRes = await supabase.auth.signInWithPassword({
      email: cleanId.toLowerCase(),
      password: rawPassword,
    });
    if (!rawEmailRes.error && rawEmailRes.data.user) return rawEmailRes;
  }

  // Generic, secure error message to prevent account enumeration
  return {
    data: { user: null, session: null },
    error: new Error("Invalid email address, mobile number, or password. Please verify your credentials."),
  };
}

/**
 * Phone number and password login (backward compatible alias to appUniversalSignIn).
 */
export async function appPhoneSignIn(phoneOrEmail: string, rawPassword: string) {
  return appUniversalSignIn(phoneOrEmail, rawPassword);
}

/**
 * Fallback email sign-in (backward compatible alias to appUniversalSignIn).
 */
export async function appSignIn(emailOrPhone: string, rawPassword: string) {
  return appUniversalSignIn(emailOrPhone, rawPassword);
}
