import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { todayLocal, workshopDays } from "./attendance";

export interface ParticipantQrResponse {
  ok: boolean;
  code:
    | "ACTIVE_QR"
    | "ALREADY_PRESENT"
    | "NOT_APPROVED"
    | "NO_SESSION_SCHEDULED"
    | "ERROR"
    | "UNAUTHORIZED";
  message: string;
  token?: string;
  shortCode?: string;
  expiresAt?: string;
  dayDate?: string;
  alreadyMarked?: boolean;
  status?: string;
  checkedInAt?: string;
}

/**
 * 1. Participant Server Function: getParticipantDailyQr
 * Returns the participant's unique, daily attendance QR token for today's workshop session.
 * Reuses existing valid unexpired session, or generates a new one.
 */
export const getParticipantDailyQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { participantId?: string }) => {
    return { participantId: input?.participantId };
  })
  .handler(async ({ data: input, context }): Promise<ParticipantQrResponse> => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const targetId = input?.participantId || userId;

    // Security check: Only staff can generate on behalf of another user
    if (targetId !== userId) {
      const { data: staff } = await supabaseAdmin.rpc("is_staff", { _user_id: userId });
      if (!staff) {
        return {
          ok: false,
          code: "UNAUTHORIZED",
          message: "You are not authorized to generate a QR for another participant.",
        };
      }
    }

    // 1. First, check if participant profile exists & is approved
    const { data: profile, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id, verification_status, full_name, participant_code")
      .eq("id", targetId)
      .maybeSingle();

    if (profErr || !profile) {
      return {
        ok: false,
        code: "ERROR",
        message: "Participant profile not found.",
      };
    }

    if (profile.verification_status !== "verified") {
      return {
        ok: false,
        code: "NOT_APPROVED",
        message:
          profile.verification_status === "rejected"
            ? "Your registration has been rejected. No attendance QR will be issued."
            : "Your account is pending administrator approval. Attendance QR is locked until approved.",
      };
    }

    // 2. Determine official session date in workshop timezone (Asia/Kolkata)
    const today = todayLocal();

    // 3. Check workshop calendar
    const { data: settings } = await supabaseAdmin
      .from("workshop_settings")
      .select("*")
      .maybeSingle();

    if (!settings || !workshopDays(settings).includes(today)) {
      return {
        ok: false,
        code: "NO_SESSION_SCHEDULED",
        dayDate: today,
        message: "No workshop session is scheduled for today.",
      };
    }

    // 4. Check if participant is already marked present for today
    const { data: existingAttendance } = await supabaseAdmin
      .from("attendance")
      .select("id, status, checked_in_at, method")
      .eq("user_id", targetId)
      .eq("day_date", today)
      .maybeSingle();

    if (existingAttendance && (existingAttendance.status === "present" || existingAttendance.status === "pending")) {
      return {
        ok: true,
        code: "ALREADY_PRESENT",
        alreadyMarked: true,
        status: existingAttendance.status,
        checkedInAt: existingAttendance.checked_in_at,
        dayDate: today,
        message: `Attendance is already recorded as ${existingAttendance.status.toUpperCase()} for today.`,
      };
    }

    // 5. Check if an active, unexpired, unused token exists for today
    const nowIso = new Date().toISOString();
    const expiryBufferTime = new Date(Date.now() + 30_000).toISOString();

    const { data: activeSessions } = await supabaseAdmin
      .from("qr_sessions")
      .select("*")
      .eq("created_by", targetId)
      .eq("day_date", today)
      .eq("revoked", false)
      .gt("expires_at", expiryBufferTime)
      .order("created_at", { ascending: false })
      .limit(1);

    const activeSession = activeSessions?.[0];
    if (activeSession) {
      return {
        ok: true,
        code: "ACTIVE_QR",
        token: activeSession.token,
        shortCode: activeSession.short_code,
        expiresAt: activeSession.expires_at,
        dayDate: activeSession.day_date,
        message: "Active session reused.",
      };
    }

    // 6. Otherwise revoke older expired tokens for today
    await supabaseAdmin
      .from("qr_sessions")
      .update({ revoked: true })
      .eq("created_by", targetId)
      .eq("day_date", today)
      .eq("revoked", false);

    // 7. Generate a new cryptographically secure token
    const { generateSecureToken, generateShortCode } = await import("./attendance-qr.crypto");
    const token = generateSecureToken(32);
    const short_code = generateShortCode();

    const validityMinutes = settings.qr_validity_minutes || 15;
    const expiresAt = new Date(Date.now() + validityMinutes * 60_000).toISOString();

    const { data: newSession, error: insertErr } = await supabaseAdmin
      .from("qr_sessions")
      .insert({
        day_date: today,
        token,
        short_code,
        expires_at: expiresAt,
        revoked: false,
        created_by: targetId,
      })
      .select()
      .single();

    if (insertErr || !newSession) {
      console.error("Failed to insert qr_session:", insertErr);
      return {
        ok: false,
        code: "ERROR",
        message: "Could not generate attendance QR. Please try again.",
      };
    }

    // Audit log
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      target_user: targetId,
      action: "qr_token_generated",
      details: {
        sessionId: newSession.id,
        dayDate: today,
        expiresAt,
      } as never,
    });

    return {
      ok: true,
      code: "ACTIVE_QR",
      token,
      shortCode: short_code,
      expiresAt,
      dayDate: today,
      message: "New attendance QR token generated.",
    };
  });

export type QrVerificationResultCode =
  | "READY_TO_MARK"
  | "ATTENDANCE_ALREADY_MARKED"
  | "QR_EXPIRED"
  | "INVALID_QR"
  | "WRONG_DATE"
  | "PARTICIPANT_NOT_APPROVED"
  | "QR_REVOKED"
  | "QR_ALREADY_USED"
  | "VERIFICATION_FAILED"
  | "UNAUTHORIZED";

export interface QrVerificationResult {
  valid: boolean;
  resultCode: QrVerificationResultCode;
  resultMessage: string;
  participant?: {
    id: string;
    fullName: string;
    participantCode: string;
    email: string;
    phone: string;
    photoUrl?: string | null;
    photoPath?: string | null;
    verificationStatus: string;
  };
  session?: {
    id: string;
    dayDate: string;
    expiresAt: string;
    token: string;
  };
  attendance?: {
    id: string;
    status: string;
    checkedInAt: string;
    method: string;
  };
}

/**
 * 2. Admin Server Function: verifyParticipantQr
 * Validates a scanned QR token or short code and returns verified participant details.
 */
export const verifyParticipantQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { token: string }) => {
    let clean = String(input.token ?? "").trim();
    // Support JSON QR payload or raw token
    if (clean.startsWith("{") && clean.endsWith("}")) {
      try {
        const parsed = JSON.parse(clean);
        if (parsed.token) clean = String(parsed.token).trim();
      } catch {
        // Fall back to clean
      }
    }
    return { token: clean };
  })
  .handler(async ({ data: input, context }): Promise<QrVerificationResult> => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Authorization check: Only staff
    const { data: isStaff } = await supabaseAdmin.rpc("is_staff", { _user_id: userId });
    if (!isStaff) {
      return {
        valid: false,
        resultCode: "UNAUTHORIZED",
        resultMessage: "Only authorized administrators can verify attendance QR codes.",
      };
    }

    const { token } = input;
    if (!token) {
      return {
        valid: false,
        resultCode: "INVALID_QR",
        resultMessage: "QR token is empty or invalid.",
      };
    }

    const today = todayLocal();

    // Query session by token or short_code
    const { data: sessions, error: sessionErr } = await supabaseAdmin
      .from("qr_sessions")
      .select("*")
      .or(`token.eq.${token},short_code.eq.${token.toUpperCase()}`)
      .order("created_at", { ascending: false })
      .limit(1);

    if (sessionErr || !sessions?.length) {
      return {
        valid: false,
        resultCode: "INVALID_QR",
        resultMessage: "Invalid QR — Token not recognized or does not exist.",
      };
    }

    const session = sessions[0] as unknown as {
      id: string;
      participant_id?: string | null;
      created_by?: string | null;
      day_date: string;
      token: string;
      expires_at: string;
      revoked: boolean;
      revoked_at?: string | null;
      used_at?: string | null;
    };

    const targetParticipantId = session.participant_id || session.created_by;
    if (!targetParticipantId) {
      return {
        valid: false,
        resultCode: "INVALID_QR",
        resultMessage: "Invalid QR — Token is not bound to a registered participant.",
      };
    }

    // Load participant profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, participant_code, email, phone, photo_path, verification_status")
      .eq("id", targetParticipantId)
      .maybeSingle();

    if (!profile) {
      return {
        valid: false,
        resultCode: "INVALID_QR",
        resultMessage: "Participant profile not found.",
      };
    }

    // Generate signed photo URL if photo exists
    let photoUrl: string | null = null;
    if (profile.photo_path) {
      const { data: signRes } = await supabaseAdmin.storage
        .from("photos")
        .createSignedUrl(profile.photo_path, 3600);
      photoUrl = signRes?.signedUrl ?? null;
    }

    const participantData = {
      id: profile.id,
      fullName: profile.full_name,
      participantCode: profile.participant_code,
      email: profile.email,
      phone: profile.phone,
      photoUrl,
      photoPath: profile.photo_path,
      verificationStatus: profile.verification_status,
    };

    // 1. Participant approval status check
    if (profile.verification_status !== "verified") {
      return {
        valid: false,
        resultCode: "PARTICIPANT_NOT_APPROVED",
        resultMessage: `Participant Not Approved — Registration status is ${profile.verification_status}.`,
        participant: participantData,
      };
    }

    // 2. Revocation check
    if (session.revoked || session.revoked_at) {
      return {
        valid: false,
        resultCode: "QR_REVOKED",
        resultMessage: "QR Revoked — This QR code has been revoked and is no longer valid.",
      };
    }

    // 3. Already used check
    if (session.used_at) {
      return {
        valid: false,
        resultCode: "QR_ALREADY_USED",
        resultMessage: "QR Already Used — This attendance code has already been scanned.",
      };
    }

    // 4. Expiration check
    if (new Date(session.expires_at).getTime() < Date.now()) {
      return {
        valid: false,
        resultCode: "QR_EXPIRED",
        resultMessage: `QR Expired — This QR code expired at ${new Date(session.expires_at).toLocaleTimeString()}. Ask participant to refresh.`,
      };
    }

    // 5. Date check
    if (session.day_date !== today) {
      return {
        valid: false,
        resultCode: "WRONG_DATE",
        resultMessage: `Wrong Workshop Date — This QR is for ${session.day_date}, but today's session is ${today}.`,
      };
    }

    // 6. Check existing attendance record
    const { data: attRecord } = await supabaseAdmin
      .from("attendance")
      .select("id, status, checked_in_at, method")
      .eq("user_id", profile.id)
      .eq("day_date", today)
      .maybeSingle();

    if (attRecord) {
      return {
        valid: false,
        resultCode: "ATTENDANCE_ALREADY_MARKED",
        resultMessage: `Attendance Already Marked — Recorded as ${attRecord.status.toUpperCase()} at ${new Date(attRecord.checked_in_at).toLocaleTimeString()}.`,
        participant: participantData,
        attendance: {
          id: attRecord.id,
          status: attRecord.status,
          checkedInAt: attRecord.checked_in_at,
          method: attRecord.method,
        },
      };
    }

    // All checks passed!
    return {
      valid: true,
      resultCode: "READY_TO_MARK",
      resultMessage: "Valid QR — Ready to Mark Attendance",
      participant: participantData,
      session: {
        id: session.id,
        dayDate: session.day_date,
        expiresAt: session.expires_at,
        token: session.token,
      },
    };
  });

export interface ConfirmAttendanceResult {
  ok: boolean;
  message: string;
  resultCode: "CONFIRMED" | "ALREADY_MARKED" | "FAILED" | "UNAUTHORIZED";
  participant?: {
    id: string;
    fullName: string;
    participantCode: string;
    email: string;
    photoUrl?: string | null;
  };
  attendance?: {
    id: string;
    status: string;
    checkedInAt: string;
    dayDate: string;
    method: string;
  };
}

/**
 * 3. Admin Server Function: confirmParticipantAttendance
 * Atomically marks attendance for the verified participant and consumes the QR token.
 */
export const confirmParticipantAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { token: string }) => {
    let clean = String(input.token ?? "").trim();
    if (clean.startsWith("{") && clean.endsWith("}")) {
      try {
        const p = JSON.parse(clean);
        if (p.token) clean = String(p.token).trim();
      } catch {
        // fallback
      }
    }
    return { token: clean };
  })
  .handler(async ({ data: input, context }): Promise<ConfirmAttendanceResult> => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Verify caller is staff
    const { data: isStaff } = await supabaseAdmin.rpc("is_staff", { _user_id: userId });
    if (!isStaff) {
      return {
        ok: false,
        resultCode: "UNAUTHORIZED",
        message: "Only authorized administrators can confirm attendance.",
      };
    }

    const { token } = input;
    const today = todayLocal();
    const nowIso = new Date().toISOString();

    // 2. Fetch session
    const { data: sessions } = await supabaseAdmin
      .from("qr_sessions")
      .select("*")
      .or(`token.eq.${token},short_code.eq.${token.toUpperCase()}`)
      .limit(1);

    const session = sessions?.[0] as unknown as {
      id: string;
      participant_id?: string | null;
      created_by?: string | null;
      day_date: string;
      expires_at: string;
      revoked: boolean;
      revoked_at?: string | null;
      used_at?: string | null;
    };

    const targetParticipantId = session?.participant_id || session?.created_by;
    if (!session || !targetParticipantId) {
      return {
        ok: false,
        resultCode: "FAILED",
        message: "Invalid or unrecognized QR token.",
      };
    }

    if (session.revoked) {
      return {
        ok: false,
        resultCode: "FAILED",
        message: "This QR code has already been consumed or revoked.",
      };
    }

    if (new Date(session.expires_at).getTime() < Date.now()) {
      return {
        ok: false,
        resultCode: "FAILED",
        message: "This QR code has expired.",
      };
    }

    if (session.day_date !== today) {
      return {
        ok: false,
        resultCode: "FAILED",
        message: `This QR is for date ${session.day_date}, but today is ${today}.`,
      };
    }

    // 3. Load profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, participant_code, email, photo_path, verification_status")
      .eq("id", targetParticipantId)
      .maybeSingle();

    if (!profile || profile.verification_status !== "verified") {
      return {
        ok: false,
        resultCode: "FAILED",
        message: "Participant profile is not approved.",
      };
    }

    // 4. Check if already marked
    const { data: existing } = await supabaseAdmin
      .from("attendance")
      .select("id, status, checked_in_at, method")
      .eq("user_id", profile.id)
      .eq("day_date", today)
      .maybeSingle();

    if (existing) {
      return {
        ok: false,
        resultCode: "ALREADY_MARKED",
        message: "Attendance has already been recorded for this participant today.",
        attendance: {
          id: existing.id,
          status: existing.status,
          checkedInAt: existing.checked_in_at,
          dayDate: today,
          method: existing.method,
        },
      };
    }

    // 5. Insert attendance atomically
    const { data: newAttendance, error: attErr } = await supabaseAdmin
      .from("attendance")
      .insert({
        user_id: profile.id,
        day_date: today,
        status: "present",
        method: "qr",
        qr_session_id: session.id,
        marked_by: userId,
        remarks: "Verified via Admin QR Scanner",
        checked_in_at: nowIso,
      })
      .select()
      .single();

    if (attErr) {
      if (attErr.code === "23505") {
        return {
          ok: false,
          resultCode: "ALREADY_MARKED",
          message: "Attendance was just marked concurrently.",
        };
      }
      console.error("Attendance insertion failed:", attErr);
      return {
        ok: false,
        resultCode: "FAILED",
        message: `Failed to insert attendance: ${attErr.message}`,
      };
    }

    // 6. Mark token as consumed
    await supabaseAdmin
      .from("qr_sessions")
      .update({ revoked: true })
      .eq("id", session.id);

    // 7. Insert audit log
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      target_user: profile.id,
      action: "attendance_confirmed_qr_scan",
      details: {
        attendanceId: newAttendance.id,
        sessionId: session.id,
        dayDate: today,
        method: "qr_scan",
      } as never,
    });

    // 8. Generate signed photo URL for final response
    let photoUrl: string | null = null;
    if (profile.photo_path) {
      const { data: signRes } = await supabaseAdmin.storage
        .from("photos")
        .createSignedUrl(profile.photo_path, 3600);
      photoUrl = signRes?.signedUrl ?? null;
    }

    return {
      ok: true,
      resultCode: "CONFIRMED",
      message: "Attendance marked successfully",
      participant: {
        id: profile.id,
        fullName: profile.full_name,
        participantCode: profile.participant_code,
        email: profile.email,
        photoUrl,
      },
      attendance: {
        id: newAttendance.id,
        status: "present",
        checkedInAt: nowIso,
        dayDate: today,
        method: "qr_scan",
      },
    };
  });

