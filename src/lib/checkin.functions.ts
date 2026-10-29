import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { todayLocal, workshopDays } from "./attendance";

function randomToken(bytes = 24) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
function randomShortCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => chars[b % chars.length]).join("");
}

/** Staff only: create a fresh QR for today, revoking any active one. */
export const generateQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Only administrators can generate QR codes.");
    const { data: settings } = await supabase.from("workshop_settings").select("*").single();
    if (!settings) throw new Error("Workshop settings missing.");
    const today = todayLocal();
    if (!workshopDays(settings).includes(today))
      throw new Error("Today is not a workshop day. Check the workshop dates in Settings.");
    await supabase.from("qr_sessions").update({ revoked: true }).eq("day_date", today).eq("revoked", false);
    const expires = new Date(Date.now() + settings.qr_validity_minutes * 60_000).toISOString();
    const { data, error } = await supabase
      .from("qr_sessions")
      .insert({ day_date: today, token: randomToken(), short_code: randomShortCode(), expires_at: expires, created_by: userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({ actor_id: userId, action: "qr_generated", details: { day: today, expires } });
    return data;
  });

export type CheckinResult =
  | { ok: true; status: "present" | "pending"; message: string }
  | { ok: false; message: string };

/** Participant: validate QR token/short code server-side and record attendance once. */
export const checkIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { code: string; selfiePath?: string | null }) => {
    const code = String(input.code ?? "").trim();
    if (!code || code.length > 100) throw new Error("Invalid code");
    const selfiePath = input.selfiePath ? String(input.selfiePath).slice(0, 300) : null;
    return { code, selfiePath };
  })
  .handler(async ({ data, context }): Promise<CheckinResult> => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const log = (action: string, details: Record<string, unknown>) =>
      supabaseAdmin.from("audit_logs").insert({ actor_id: userId, target_user: userId, action, details: details as never });

    const { data: profile } = await supabaseAdmin.from("profiles").select("id, verification_status").eq("id", userId).maybeSingle();
    if (!profile) return { ok: false, message: "No participant profile found for your account." };

    if (profile.verification_status !== "verified") {
      return {
        ok: false,
        message:
          profile.verification_status === "rejected"
            ? "Your registration has been rejected. You cannot mark attendance."
            : "Your registration is awaiting administrator approval. You cannot mark attendance until an admin approves your account.",
      };
    }

    const { data: settings } = await supabaseAdmin.from("workshop_settings").select("*").single();
    const today = todayLocal();
    if (!settings || !workshopDays(settings).includes(today))
      return { ok: false, message: "Attendance is not open today — it's not a workshop day." };

    const isToken = data.code.length > 10;
    const q = supabaseAdmin.from("qr_sessions").select("*").eq("day_date", today).eq("revoked", false);
    const { data: sessions } = await (isToken ? q.eq("token", data.code) : q.eq("short_code", data.code.toUpperCase()));
    const session = sessions?.[0];
    if (!session) {
      await log("checkin_invalid_code", { day: today });
      return { ok: false, message: "This code is invalid, revoked, or from a different day." };
    }
    if (new Date(session.expires_at).getTime() < Date.now()) {
      await log("checkin_expired_code", { day: today });
      return { ok: false, message: "This QR code has expired. Ask the organiser to show the current one." };
    }
    let status: "present" | "pending" = "present";
    let remarks: string | null = null;
    let confidenceScore: number | null = null;

    if (settings.require_selfie) {
      if (!data.selfiePath || !data.selfiePath.startsWith(`${userId}/`)) {
        return { ok: false, message: "A selfie is required for today's attendance." };
      }

      // Check if reference photo is present
      const { data: userProf } = await supabaseAdmin
        .from("profiles")
        .select("photo_path")
        .eq("id", userId)
        .maybeSingle();

      if (userProf?.photo_path) {
        try {
          const { verifyFaceAndRecordAttempt } = await import("./face-verification.server");
          const verifRes = await verifyFaceAndRecordAttempt({
            supabaseAdmin,
            userId,
            dayDate: today,
            referencePhotoPath: userProf.photo_path,
            selfiePhotoPath: data.selfiePath,
            threshold: 75,
          });

          confidenceScore = verifRes.confidence;
          if (verifRes.verified) {
            status = "present";
            remarks = `Biometric match confirmed (${verifRes.confidence}%) via ${verifRes.provider}`;
          } else {
            status = "pending";
            remarks = `Match score (${verifRes.confidence}%) below threshold. Queued for manual admin confirmation.`;
          }
        } catch (verifErr) {
          console.error("Face verification execution error:", verifErr);
          status = "pending";
          remarks = "Face verification fallback to manual admin review.";
        }
      } else {
        status = "pending";
        remarks = "No reference portrait on profile; manual review required.";
      }
    }

    const { error } = await supabaseAdmin.from("attendance").insert({
      user_id: userId,
      day_date: today,
      status,
      method: settings.require_selfie ? "qr_selfie" : "qr",
      selfie_path: settings.require_selfie ? data.selfiePath : null,
      qr_session_id: session.id,
      remarks,
      confidence_score: confidenceScore,
    });
    if (error) {
      if (error.code === "23505") {
        await log("checkin_duplicate", { day: today });
        return { ok: false, message: "Your attendance for today is already recorded." };
      }
      throw new Error(error.message);
    }
    await log("checkin", { day: today, status, confidence: confidenceScore });
    return {
      ok: true,
      status,
      message:
        status === "present"
          ? (confidenceScore ? `Identity verified (${confidenceScore}%)! You're marked present for today.` : "You're marked present for today.")
          : "Submitted! Face score queued for administrator verification.",
    };
  });
