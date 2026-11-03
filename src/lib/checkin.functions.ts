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
    const { data: dayConfig } = await supabase.from("workshop_days").select("is_active, topic").eq("day_date", today).maybeSingle();
    if (dayConfig && !dayConfig.is_active)
      throw new Error(`Today (${today}) is configured as a non-working day or holiday (${dayConfig.topic || "Holiday"}). QR session generation is disabled.`);
    if (!workshopDays(settings).includes(today))
      throw new Error("Today is not a workshop day. Check the workshop dates in Settings.");
    // Revoke only previous staff-generated venue projector sessions for today (preserve participant personal tokens)
    const { data: staffList } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "organizer", "staff"]);
    const staffIds = (staffList ?? []).map((s) => s.user_id);
    if (!staffIds.includes(userId)) staffIds.push(userId);
    await supabase
      .from("qr_sessions")
      .update({ revoked: true })
      .eq("day_date", today)
      .in("created_by", staffIds)
      .eq("revoked", false);
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
  .validator((input: { code: string; selfiePath?: string | null; sessionType?: "entry" | "exit" | "both" }) => {
    const code = String(input.code ?? "").trim();
    if (!code || code.length > 100) throw new Error("Invalid code");
    const selfiePath = input.selfiePath ? String(input.selfiePath).slice(0, 300) : null;
    const sessionType = input.sessionType || "entry";
    return { code, selfiePath, sessionType };
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
    const { data: dayConfig } = await supabaseAdmin.from("workshop_days").select("is_active, topic").eq("day_date", today).maybeSingle();
    if (dayConfig && !dayConfig.is_active)
      return { ok: false, message: `Attendance is not open today (${today}): it is configured as a non-working day or holiday (${dayConfig.topic || "Holiday"}).` };
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

    // Check existing attendance for this user and day
    const { data: existingAttendance } = await supabaseAdmin
      .from("attendance")
      .select("*")
      .eq("user_id", userId)
      .eq("day_date", today)
      .maybeSingle();

    const hasEntry = Boolean(
      existingAttendance &&
        (existingAttendance.morning_status === "present" ||
          (existingAttendance.status === "present" && !existingAttendance.morning_status)),
    );
    const hasExit = Boolean(existingAttendance && existingAttendance.afternoon_status === "present");

    // Enforce Entry / Exit Attendance Rules
    if (data.sessionType === "entry") {
      if (hasEntry) {
        await log("checkin_duplicate_entry", { day: today });
        return { ok: false, message: "Entry attendance for today is already recorded." };
      }
    } else if (data.sessionType === "exit") {
      if (!hasEntry) {
        await log("checkin_missing_entry_for_exit", { day: today });
        return {
          ok: false,
          message: "Entry attendance is missing for today. You must mark Entry attendance first before marking Exit attendance.",
        };
      }
      if (hasExit) {
        await log("checkin_duplicate_exit", { day: today });
        return { ok: false, message: "Exit attendance for today is already recorded." };
      }
    } else if (data.sessionType === "both") {
      if (hasEntry && hasExit) {
        await log("checkin_duplicate_both", { day: today });
        return { ok: false, message: "Both Entry and Exit attendance for today are already recorded." };
      }
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
          });

          confidenceScore = verifRes.confidence;
          if (verifRes.verified) {
            status = "present";
            remarks = `Biometric match confirmed via ${verifRes.provider}`;
          } else {
            status = "pending";
            remarks = "Biometric match queued for administrator confirmation.";
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

    const nowIso = new Date().toISOString();

    if (data.sessionType === "exit" && existingAttendance) {
      const updatedRemarks = existingAttendance.remarks
        ? `${existingAttendance.remarks} | EXIT_AT:${nowIso}`
        : `EXIT_AT:${nowIso}`;

      const { error: updateErr } = await supabaseAdmin
        .from("attendance")
        .update({
          afternoon_status: status === "present" ? "present" : null,
          status: "present",
          remarks: updatedRemarks,
          updated_at: nowIso,
        })
        .eq("id", existingAttendance.id);

      if (updateErr) throw new Error(updateErr.message);

      await log("checkin_exit", { day: today, status, sessionType: "exit" });
      return {
        ok: true,
        status,
        message:
          status === "present"
            ? "Identity verified! Your Exit attendance has been recorded successfully."
            : "Exit attendance submitted and queued for administrator verification.",
      };
    }

    if (existingAttendance) {
      // Existing row (e.g. from admin pending or incomplete)
      const isExitAction = data.sessionType === "exit";
      const isBothAction = data.sessionType === "both";

      const updatedRemarks = isExitAction
        ? (existingAttendance.remarks ? `${existingAttendance.remarks} | EXIT_AT:${nowIso}` : `EXIT_AT:${nowIso}`)
        : (remarks || existingAttendance.remarks);

      const { error: updateErr } = await supabaseAdmin
        .from("attendance")
        .update({
          morning_status: isExitAction ? existingAttendance.morning_status : (status === "present" ? "present" : null),
          afternoon_status: isExitAction || isBothAction ? (status === "present" ? "present" : null) : existingAttendance.afternoon_status,
          status: status === "present" ? "present" : existingAttendance.status,
          checked_in_at: existingAttendance.checked_in_at || nowIso,
          method: settings.require_selfie ? "qr_selfie" : "qr",
          selfie_path: settings.require_selfie ? data.selfiePath : existingAttendance.selfie_path,
          qr_session_id: session.id,
          remarks: updatedRemarks,
          confidence_score: confidenceScore ?? existingAttendance.confidence_score,
          updated_at: nowIso,
        })
        .eq("id", existingAttendance.id);

      if (updateErr) throw new Error(updateErr.message);
    } else {
      // First check-in of the day (Entry)
      const { error: insertErr } = await supabaseAdmin.from("attendance").insert({
        user_id: userId,
        day_date: today,
        status,
        morning_status: status === "present" ? "present" : null,
        afternoon_status: data.sessionType === "both" && status === "present" ? "present" : null,
        method: settings.require_selfie ? "qr_selfie" : "qr",
        selfie_path: settings.require_selfie ? data.selfiePath : null,
        qr_session_id: session.id,
        remarks,
        confidence_score: confidenceScore,
        checked_in_at: nowIso,
        updated_at: nowIso,
      });

      if (insertErr) {
        if (insertErr.code === "23505") {
          await log("checkin_duplicate", { day: today });
          return { ok: false, message: "Your attendance for today is already recorded." };
        }
        throw new Error(insertErr.message);
      }
    }

    await log("checkin", { day: today, status, sessionType: data.sessionType });
    return {
      ok: true,
      status,
      message:
        status === "present"
          ? (data.sessionType === "both"
              ? "Your attendance for today is marked present."
              : "Identity verified! Your Entry attendance is marked present.")
          : "Submitted! Face verification queued for administrator review.",
    };
  });
