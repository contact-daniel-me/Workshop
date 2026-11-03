import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { todayLocal, workshopDays, getKolkataTime, getNextSessionUnlockTime, SESSION_START_HOUR } from "./attendance";
import { computeVisualFeatureSimilarity, fetchStorageImage } from "./face-verification.server";

export interface ParticipantQrResponse {
  ok: boolean;
  code:
    | "ACTIVE_QR"
    | "ALREADY_PRESENT"
    | "NOT_APPROVED"
    | "NO_SESSION_SCHEDULED"
    | "LOCKED_UNTIL_SESSION_TIME"
    | "ERROR"
    | "UNAUTHORIZED";
  message: string;
  token?: string;
  shortCode?: string;
  expiresAt?: string;
  unlocksAt?: string;
  dayDate?: string;
  alreadyMarked?: boolean;
  entryMarked?: boolean;
  exitMarked?: boolean;
  sessionType?: "entry" | "exit" | "both";
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

    // Check if today is configured as a holiday / non-working day
    const { data: todayDayConfig } = await supabaseAdmin
      .from("workshop_days")
      .select("is_active, topic")
      .eq("day_date", today)
      .maybeSingle();

    if (todayDayConfig && !todayDayConfig.is_active) {
      return {
        ok: false,
        code: "HOLIDAY_NON_WORKING_DAY",
        dayDate: today,
        message: `Today (${today}) is declared a non-working day or holiday (${todayDayConfig.topic || "Holiday"}). Attendance is not applicable.`,
      };
    }

    if (!settings || !workshopDays(settings).includes(today)) {
      return {
        ok: false,
        code: "NO_SESSION_SCHEDULED",
        dayDate: today,
        message: "No workshop session is scheduled for today.",
      };
    }

    // 4. Check if participant has already marked BOTH Entry and Exit for today
    const { data: existingAttendance } = await supabaseAdmin
      .from("attendance")
      .select("id, status, morning_status, afternoon_status, checked_in_at, method")
      .eq("user_id", targetId)
      .eq("day_date", today)
      .maybeSingle();

    const hasEntry = Boolean(
      existingAttendance &&
        (existingAttendance.morning_status === "present" ||
          (existingAttendance.status === "present" && !existingAttendance.morning_status))
    );
    const hasExit = Boolean(existingAttendance && existingAttendance.afternoon_status === "present");

    if (hasEntry && hasExit) {
      const nextUnlock = getNextSessionUnlockTime(today, true);
      return {
        ok: true,
        code: "ALREADY_PRESENT",
        alreadyMarked: true,
        entryMarked: true,
        exitMarked: true,
        status: existingAttendance.status,
        checkedInAt: existingAttendance.checked_in_at,
        dayDate: today,
        unlocksAt: nextUnlock,
        message: "Both Entry and Exit attendance have already been recorded for today.",
      };
    }

    // 5. Restrict QR generation until session start (12:00 AM Midnight IST)
    const kolkata = getKolkataTime();
    const isStaffOperation = targetId !== userId;
    if (SESSION_START_HOUR > 0 && kolkata.hour < SESSION_START_HOUR && !isStaffOperation) {
      const unlocksAt = getNextSessionUnlockTime(today, false);
      return {
        ok: false,
        code: "LOCKED_UNTIL_SESSION_TIME",
        dayDate: today,
        unlocksAt,
        message: "Today's attendance QR code will generate at 12:00 AM.",
      };
    }

    // 6. Check if an active, unexpired, unused token exists for today
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
        entryMarked: hasEntry,
        exitMarked: hasExit,
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
      entryMarked: hasEntry,
      exitMarked: hasExit,
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
  entryMarked?: boolean;
  exitMarked?: boolean;
  sessionType?: "entry" | "exit" | "both";
}

/**
 * 2. Admin Server Function: verifyParticipantQr
 * Validates a scanned QR token or short code and returns verified participant details.
 */
export const verifyParticipantQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { token: string; sessionType?: "entry" | "exit" | "both" }) => {
    let clean = String(input.token ?? "").trim();
    let sessionType: "entry" | "exit" | "both" = input.sessionType || "entry";
    // Support JSON QR payload or raw token
    if (clean.startsWith("{") && clean.endsWith("}")) {
      try {
        const parsed = JSON.parse(clean);
        if (parsed.token) clean = String(parsed.token).trim();
        if (parsed.sessionType && (parsed.sessionType === "entry" || parsed.sessionType === "exit" || parsed.sessionType === "both")) {
          sessionType = parsed.sessionType;
        }
      } catch {
        // Fall back to clean
      }
    }
    return { token: clean, sessionType };
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

    // 6. Check existing attendance record for Entry / Exit rules
    const { data: attRecord } = await supabaseAdmin
      .from("attendance")
      .select("id, status, morning_status, afternoon_status, checked_in_at, method")
      .eq("user_id", profile.id)
      .eq("day_date", today)
      .maybeSingle();

    const hasEntry = Boolean(
      attRecord &&
        (attRecord.morning_status === "present" ||
          (attRecord.status === "present" && !attRecord.morning_status))
    );
    const hasExit = Boolean(attRecord && attRecord.afternoon_status === "present");

    if (input.sessionType === "exit") {
      if (!hasEntry) {
        return {
          valid: false,
          resultCode: "VERIFICATION_FAILED",
          resultMessage: "Entry attendance is missing for today. Participant must mark Entry attendance before Exit.",
          participant: participantData,
          attendance: attRecord
            ? {
                id: attRecord.id,
                status: attRecord.status,
                checkedInAt: attRecord.checked_in_at,
                method: attRecord.method,
              }
            : undefined,
        };
      }
      if (hasExit) {
        return {
          valid: false,
          resultCode: "ATTENDANCE_ALREADY_MARKED",
          resultMessage: "Exit attendance has already been recorded for today.",
          participant: participantData,
          attendance: {
            id: attRecord!.id,
            status: attRecord!.status,
            checkedInAt: attRecord!.checked_in_at,
            method: attRecord!.method,
          },
        };
      }
    } else if (input.sessionType === "entry") {
      if (hasEntry) {
        return {
          valid: false,
          resultCode: "ATTENDANCE_ALREADY_MARKED",
          resultMessage: "Entry attendance has already been recorded for today.",
          participant: participantData,
          attendance: {
            id: attRecord!.id,
            status: attRecord!.status,
            checkedInAt: attRecord!.checked_in_at,
            method: attRecord!.method,
          },
        };
      }
    } else {
      // sessionType === "both"
      if (hasEntry && hasExit) {
        return {
          valid: false,
          resultCode: "ATTENDANCE_ALREADY_MARKED",
          resultMessage: "Both Entry and Exit attendance have already been recorded for today.",
          participant: participantData,
          attendance: {
            id: attRecord!.id,
            status: attRecord!.status,
            checkedInAt: attRecord!.checked_in_at,
            method: attRecord!.method,
          },
        };
      }
    }

    // All checks passed!
    return {
      valid: true,
      resultCode: "READY_TO_MARK",
      resultMessage:
        input.sessionType === "exit"
          ? "Valid QR — Ready to Mark Exit Attendance"
          : "Valid QR — Ready to Mark Entry Attendance",
      participant: participantData,
      session: {
        id: session.id,
        dayDate: session.day_date,
        expiresAt: session.expires_at,
        token: session.token,
      },
      entryMarked: hasEntry,
      exitMarked: hasExit,
      sessionType: input.sessionType,
    };
  });

export interface ConfirmAttendanceResult {
  ok: boolean;
  message: string;
  resultCode: "CONFIRMED" | "ALREADY_MARKED" | "FAILED" | "UNAUTHORIZED";
  sessionType?: "entry" | "exit" | "both";
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
    morningStatus?: string | null;
    afternoonStatus?: string | null;
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
  .validator((input: { token: string; sessionType?: "entry" | "exit" | "both" }) => {
    let clean = String(input.token ?? "").trim();
    let sessionType: "entry" | "exit" | "both" = input.sessionType || "entry";
    if (clean.startsWith("{") && clean.endsWith("}")) {
      try {
        const p = JSON.parse(clean);
        if (p.token) clean = String(p.token).trim();
        if (p.sessionType && (p.sessionType === "entry" || p.sessionType === "exit" || p.sessionType === "both")) {
          sessionType = p.sessionType;
        }
      } catch {
        // fallback
      }
    }
    return { token: clean, sessionType };
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

    const { token, sessionType } = input;
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

    // 4. Check existing attendance for Entry / Exit rules
    const { data: existing } = await supabaseAdmin
      .from("attendance")
      .select("id, status, morning_status, afternoon_status, checked_in_at, method, remarks")
      .eq("user_id", profile.id)
      .eq("day_date", today)
      .maybeSingle();

    const hasEntry = Boolean(
      existing &&
        (existing.morning_status === "present" ||
          (existing.status === "present" && !existing.morning_status))
    );
    const hasExit = Boolean(existing && existing.afternoon_status === "present");

    if (sessionType === "exit") {
      if (!hasEntry) {
        return {
          ok: false,
          resultCode: "FAILED",
          message: "Entry attendance is missing for today. Participant must mark Entry attendance before Exit.",
        };
      }
      if (hasExit) {
        return {
          ok: false,
          resultCode: "ALREADY_MARKED",
          message: "Exit attendance has already been recorded for this participant today.",
          attendance: {
            id: existing!.id,
            status: existing!.status,
            morningStatus: existing!.morning_status,
            afternoonStatus: existing!.afternoon_status,
            checkedInAt: existing!.checked_in_at,
            dayDate: today,
            method: existing!.method,
          },
        };
      }
    } else if (sessionType === "entry") {
      if (hasEntry) {
        return {
          ok: false,
          resultCode: "ALREADY_MARKED",
          message: "Entry attendance has already been recorded for this participant today.",
          attendance: {
            id: existing!.id,
            status: existing!.status,
            morningStatus: existing!.morning_status,
            afternoonStatus: existing!.afternoon_status,
            checkedInAt: existing!.checked_in_at,
            dayDate: today,
            method: existing!.method,
          },
        };
      }
    } else {
      // both
      if (hasEntry && hasExit) {
        return {
          ok: false,
          resultCode: "ALREADY_MARKED",
          message: "Both Entry and Exit attendance have already been recorded for today.",
          attendance: {
            id: existing!.id,
            status: existing!.status,
            morningStatus: existing!.morning_status,
            afternoonStatus: existing!.afternoon_status,
            checkedInAt: existing!.checked_in_at,
            dayDate: today,
            method: existing!.method,
          },
        };
      }
    }

    // 5. Insert or Update attendance atomically
    let targetAttendanceId: string;
    let finalMorningStatus: string | null = null;
    let finalAfternoonStatus: string | null = null;

    if (sessionType === "exit") {
      const updatedRemarks = existing?.remarks
        ? `${existing.remarks} | EXIT_AT:${nowIso}`
        : `Verified via Admin QR Scanner | EXIT_AT:${nowIso}`;

      const { data: updated, error: attErr } = await supabaseAdmin
        .from("attendance")
        .update({
          afternoon_status: "present",
          status: "present",
          remarks: updatedRemarks,
          updated_at: nowIso,
        })
        .eq("id", existing!.id)
        .select()
        .single();

      if (attErr || !updated) {
        return {
          ok: false,
          resultCode: "FAILED",
          message: `Failed to record Exit attendance: ${attErr?.message || "Unknown error"}`,
        };
      }
      targetAttendanceId = updated.id;
      finalMorningStatus = updated.morning_status;
      finalAfternoonStatus = updated.afternoon_status;
    } else if (sessionType === "entry") {
      if (existing) {
        const updatedRemarks = existing.remarks
          ? `${existing.remarks} | ENTRY_AT:${nowIso}`
          : `Verified via Admin QR Scanner | ENTRY_AT:${nowIso}`;

        const { data: updated, error: attErr } = await supabaseAdmin
          .from("attendance")
          .update({
            morning_status: "present",
            status: "present",
            checked_in_at: existing.checked_in_at || nowIso,
            method: "qr",
            marked_by: userId,
            remarks: updatedRemarks,
            updated_at: nowIso,
          })
          .eq("id", existing.id)
          .select()
          .single();

        if (attErr || !updated) {
          return {
            ok: false,
            resultCode: "FAILED",
            message: `Failed to update Entry attendance: ${attErr?.message || "Unknown error"}`,
          };
        }
        targetAttendanceId = updated.id;
        finalMorningStatus = updated.morning_status;
        finalAfternoonStatus = updated.afternoon_status;
      } else {
        const { data: inserted, error: attErr } = await supabaseAdmin
          .from("attendance")
          .insert({
            user_id: profile.id,
            day_date: today,
            status: "present",
            morning_status: "present",
            afternoon_status: null,
            method: "qr",
            qr_session_id: session.id,
            marked_by: userId,
            remarks: `Verified via Admin QR Scanner | ENTRY_AT:${nowIso}`,
            checked_in_at: nowIso,
          })
          .select()
          .single();

        if (attErr || !inserted) {
          if (attErr?.code === "23505") {
            return {
              ok: false,
              resultCode: "ALREADY_MARKED",
              message: "Attendance was just marked concurrently.",
            };
          }
          return {
            ok: false,
            resultCode: "FAILED",
            message: `Failed to record Entry attendance: ${attErr?.message || "Unknown error"}`,
          };
        }
        targetAttendanceId = inserted.id;
        finalMorningStatus = inserted.morning_status;
        finalAfternoonStatus = inserted.afternoon_status;
      }
    } else {
      // both
      if (existing) {
        const updatedRemarks = existing.remarks
          ? `${existing.remarks} | ATTENDANCE_AT:${nowIso}`
          : `Verified via Admin QR Scanner | ATTENDANCE_AT:${nowIso}`;

        const { data: updated, error: attErr } = await supabaseAdmin
          .from("attendance")
          .update({
            morning_status: "present",
            afternoon_status: "present",
            status: "present",
            checked_in_at: existing.checked_in_at || nowIso,
            method: "qr",
            marked_by: userId,
            remarks: updatedRemarks,
            updated_at: nowIso,
          })
          .eq("id", existing.id)
          .select()
          .single();

        if (attErr || !updated) {
          return {
            ok: false,
            resultCode: "FAILED",
            message: `Failed to record attendance: ${attErr?.message || "Unknown error"}`,
          };
        }
        targetAttendanceId = updated.id;
        finalMorningStatus = updated.morning_status;
        finalAfternoonStatus = updated.afternoon_status;
      } else {
        const { data: inserted, error: attErr } = await supabaseAdmin
          .from("attendance")
          .insert({
            user_id: profile.id,
            day_date: today,
            status: "present",
            morning_status: "present",
            afternoon_status: "present",
            method: "qr",
            qr_session_id: session.id,
            marked_by: userId,
            remarks: `Verified via Admin QR Scanner | ATTENDANCE_AT:${nowIso}`,
            checked_in_at: nowIso,
          })
          .select()
          .single();

        if (attErr || !inserted) {
          if (attErr?.code === "23505") {
            return {
              ok: false,
              resultCode: "ALREADY_MARKED",
              message: "Attendance was just marked concurrently.",
            };
          }
          return {
            ok: false,
            resultCode: "FAILED",
            message: `Failed to record attendance: ${attErr?.message || "Unknown error"}`,
          };
        }
        targetAttendanceId = inserted.id;
        finalMorningStatus = inserted.morning_status;
        finalAfternoonStatus = inserted.afternoon_status;
      }
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
      action: sessionType === "exit" ? "attendance_exit_confirmed_qr_scan" : "attendance_entry_confirmed_qr_scan",
      details: {
        attendanceId: targetAttendanceId,
        sessionId: session.id,
        dayDate: today,
        sessionType,
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
      sessionType,
      message: sessionType === "exit" ? "Exit attendance marked successfully" : "Entry attendance marked successfully",
      participant: {
        id: profile.id,
        fullName: profile.full_name,
        participantCode: profile.participant_code,
        email: profile.email,
        photoUrl,
      },
      attendance: {
        id: targetAttendanceId,
        status: "present",
        morningStatus: finalMorningStatus,
        afternoonStatus: finalAfternoonStatus,
        checkedInAt: nowIso,
        dayDate: today,
        method: "qr_scan",
      },
    };
  });

export type FaceVerificationResultCode =
  | "VERIFIED_PRESENT"
  | "ALREADY_MARKED"
  | "FACE_NOT_RECOGNIZED"
  | "UNCERTAIN_MATCH_PENDING_REVIEW"
  | "NO_SESSION_SCHEDULED"
  | "PARTICIPANT_NOT_APPROVED"
  | "NO_REFERENCE_PHOTO"
  | "NO_ELIGIBLE_PARTICIPANTS"
  | "INVALID_IMAGE"
  | "UNAUTHORIZED"
  | "ERROR";

export interface AdminFaceVerificationResult {
  ok: boolean;
  resultCode: FaceVerificationResultCode;
  message: string;
  confidence?: number;
  threshold?: number;
  participant?: {
    id: string;
    fullName: string;
    participantCode: string;
    email: string;
    phone: string;
    photoUrl?: string | null;
    verificationStatus: string;
  };
  attendance?: {
    id: string;
    status: string;
    checkedInAt: string;
    dayDate: string;
    method: string;
    remarks?: string | null;
  };
  candidates?: Array<{
    id: string;
    fullName: string;
    participantCode: string;
    score: number;
  }>;
}

/**
 * 4. Admin Server Function: adminVerifyFaceAttendance
 * Verifies participant identity biometrically from live camera capture (1-to-1 or 1-to-N),
 * and marks attendance automatically when verification succeeds.
 * Enforces atomic duplicate prevention: QR or Face = Present (exactly one record).
 */
export const adminVerifyFaceAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { imageBase64: string; participantId?: string; sessionType?: "entry" | "exit" | "both" }) => {
    return {
      imageBase64: String(input.imageBase64 ?? "").trim(),
      participantId: input.participantId ? String(input.participantId).trim() : undefined,
      sessionType: input.sessionType || "entry",
    };
  })
  .handler(async ({ data: input, context }): Promise<AdminFaceVerificationResult> => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Authorization check: Administrator staff only
    const { data: isStaff } = await supabaseAdmin.rpc("is_staff", { _user_id: userId });
    if (!isStaff) {
      return {
        ok: false,
        resultCode: "UNAUTHORIZED",
        message: "Only authorized administrators can access the face verification console.",
      };
    }

    // 2. Validate live capture image payload
    const { imageBase64, participantId, sessionType = "entry" } = input;
    if (!imageBase64) {
      return {
        ok: false,
        resultCode: "INVALID_IMAGE",
        message: "No live photo capture received.",
      };
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, "").trim();
    let liveBuffer: Buffer;
    try {
      liveBuffer = Buffer.from(cleanBase64, "base64");
      if (liveBuffer.length < 300) {
        return {
          ok: false,
          resultCode: "INVALID_IMAGE",
          message: "Captured image data is too small or corrupt.",
        };
      }
    } catch {
      return {
        ok: false,
        resultCode: "INVALID_IMAGE",
        message: "Invalid image encoding received.",
      };
    }

    // 3. Workshop schedule check for today
    const today = todayLocal();
    const nowIso = new Date().toISOString();
    const { data: settings } = await supabaseAdmin
      .from("workshop_settings")
      .select("*")
      .maybeSingle();

    // Check if today is configured as a holiday / non-working day
    const { data: todayDayConfig } = await supabaseAdmin
      .from("workshop_days")
      .select("is_active, topic")
      .eq("day_date", today)
      .maybeSingle();

    if (todayDayConfig && !todayDayConfig.is_active) {
      return {
        ok: false,
        code: "HOLIDAY_NON_WORKING_DAY",
        dayDate: today,
        message: `Today (${today}) is declared a non-working day or holiday (${todayDayConfig.topic || "Holiday"}). Attendance is not applicable.`,
      };
    }

    if (!settings || !workshopDays(settings).includes(today)) {
      return {
        ok: false,
        resultCode: "NO_SESSION_SCHEDULED",
        message: `No workshop session is scheduled for today (${today}).`,
      };
    }

    // Calibrated internal verification threshold (40% safeguard against arbitrary auto-approvals)
    const INTERNAL_FACE_MATCH_THRESHOLD = 40.0;
    const envThreshold = Number(process.env.FACE_VERIFICATION_CONFIDENCE_THRESHOLD);
    const threshold = Number.isFinite(envThreshold) && envThreshold > 0 ? envThreshold : INTERNAL_FACE_MATCH_THRESHOLD;

    // Helper to generate signed photo URL
    const getPhotoUrl = async (photoPath: string | null): Promise<string | null> => {
      if (!photoPath) return null;
      try {
        const { data: signRes } = await supabaseAdmin.storage.from("photos").createSignedUrl(photoPath, 3600);
        return signRes?.signedUrl ?? null;
      } catch {
        return null;
      }
    };

    // Helper to mark attendance atomically or return existing record
    const recordFaceAttendance = async (
      matchedProfile: {
        id: string;
        full_name: string;
        participant_code: string;
        email: string;
        phone: string;
        photo_path: string | null;
        verification_status: string;
      },
      confidence: number,
    ): Promise<AdminFaceVerificationResult> => {
      // Check existing attendance record
      const { data: existing } = await supabaseAdmin
        .from("attendance")
        .select("id, status, morning_status, afternoon_status, checked_in_at, method, remarks")
        .eq("user_id", matchedProfile.id)
        .eq("day_date", today)
        .maybeSingle();

      const photoUrl = await getPhotoUrl(matchedProfile.photo_path);

      const hasEntry = Boolean(
        existing &&
          (existing.morning_status === "present" ||
            (existing.status === "present" && !existing.morning_status)),
      );
      const hasExit = Boolean(existing && existing.afternoon_status === "present");

      // Enforce Entry / Exit Attendance Rules
      if (sessionType === "exit") {
        if (!hasEntry) {
          return {
            ok: false,
            resultCode: "ERROR",
            message: "Entry attendance is missing for today. Participant must mark Entry attendance before Exit.",
            confidence,
            threshold,
            participant: {
              id: matchedProfile.id,
              fullName: matchedProfile.full_name,
              participantCode: matchedProfile.participant_code,
              email: matchedProfile.email,
              phone: matchedProfile.phone,
              photoUrl,
              verificationStatus: matchedProfile.verification_status,
            },
          };
        }

        if (hasExit) {
          return {
            ok: true,
            resultCode: "ALREADY_MARKED",
            message: "Exit attendance has already been recorded for today.",
            confidence,
            threshold,
            participant: {
              id: matchedProfile.id,
              fullName: matchedProfile.full_name,
              participantCode: matchedProfile.participant_code,
              email: matchedProfile.email,
              phone: matchedProfile.phone,
              photoUrl,
              verificationStatus: matchedProfile.verification_status,
            },
            attendance: existing
              ? {
                  id: existing.id,
                  status: existing.status,
                  checkedInAt: existing.checked_in_at,
                  dayDate: today,
                  method: existing.method,
                  remarks: existing.remarks,
                }
              : undefined,
          };
        }

        // Record Exit
        const updatedRemarks = existing?.remarks
          ? `${existing.remarks} | EXIT_AT:${nowIso}`
          : `Verified via Admin Face Console | EXIT_AT:${nowIso}`;

        await supabaseAdmin
          .from("attendance")
          .update({
            afternoon_status: "present",
            status: "present",
            remarks: updatedRemarks,
            updated_at: nowIso,
          })
          .eq("id", existing!.id);

        return {
          ok: true,
          resultCode: "VERIFIED_PRESENT",
          message: `Identity confirmed. Exit attendance recorded for ${matchedProfile.full_name}.`,
          confidence,
          threshold,
          participant: {
            id: matchedProfile.id,
            fullName: matchedProfile.full_name,
            participantCode: matchedProfile.participant_code,
            email: matchedProfile.email,
            phone: matchedProfile.phone,
            photoUrl,
            verificationStatus: matchedProfile.verification_status,
          },
        };
      }

      // sessionType === "entry" or "both"
      if (hasEntry) {
        return {
          ok: true,
          resultCode: "ALREADY_MARKED",
          message: `Entry attendance has already been recorded for today.`,
          confidence,
          threshold,
          participant: {
            id: matchedProfile.id,
            fullName: matchedProfile.full_name,
            participantCode: matchedProfile.participant_code,
            email: matchedProfile.email,
            phone: matchedProfile.phone,
            photoUrl,
            verificationStatus: matchedProfile.verification_status,
          },
          attendance: {
            id: existing!.id,
            status: existing!.status,
            checkedInAt: existing!.checked_in_at,
            dayDate: today,
            method: existing!.method,
            remarks: existing!.remarks,
          },
        };
      }

      if (existing) {
        // Update existing record
        await supabaseAdmin
          .from("attendance")
          .update({
            morning_status: "present",
            afternoon_status: sessionType === "both" ? "present" : existing.afternoon_status,
            status: "present",
            checked_in_at: existing.checked_in_at || nowIso,
            method: "qr_selfie",
            marked_by: userId,
            remarks: `Verified via Admin Face Console`,
            updated_at: nowIso,
          })
          .eq("id", existing.id);

        return {
          ok: true,
          resultCode: "VERIFIED_PRESENT",
          message: `Identity confirmed. Entry attendance recorded for ${matchedProfile.full_name}.`,
          confidence,
          threshold,
          participant: {
            id: matchedProfile.id,
            fullName: matchedProfile.full_name,
            participantCode: matchedProfile.participant_code,
            email: matchedProfile.email,
            phone: matchedProfile.phone,
            photoUrl,
            verificationStatus: matchedProfile.verification_status,
          },
        };
      }

      // Insert new attendance atomically using qr_selfie enum
      const { data: newAtt, error: attErr } = await supabaseAdmin
        .from("attendance")
        .insert({
          user_id: matchedProfile.id,
          day_date: today,
          status: "present",
          morning_status: "present",
          afternoon_status: sessionType === "both" ? "present" : null,
          method: "qr_selfie", // The DB enum representing biometric face verification
          marked_by: userId,
          remarks: `Verified via Admin Face Recognition Console`,
          checked_in_at: nowIso,
        })
        .select()
        .single();

      if (attErr) {
        if (attErr.code === "23505") {
          // Concurrently inserted! Fetch the winner
          const { data: winner } = await supabaseAdmin
            .from("attendance")
            .select("id, status, checked_in_at, method, remarks")
            .eq("user_id", matchedProfile.id)
            .eq("day_date", today)
            .maybeSingle();

          return {
            ok: true,
            resultCode: "ALREADY_MARKED",
            message: "Attendance was just marked concurrently.",
            confidence,
            threshold,
            participant: {
              id: matchedProfile.id,
              fullName: matchedProfile.full_name,
              participantCode: matchedProfile.participant_code,
              email: matchedProfile.email,
              phone: matchedProfile.phone,
              photoUrl,
              verificationStatus: matchedProfile.verification_status,
            },
            attendance: winner
              ? {
                  id: winner.id,
                  status: winner.status,
                  checkedInAt: winner.checked_in_at,
                  dayDate: today,
                  method: winner.method,
                  remarks: winner.remarks,
                }
              : undefined,
          };
        }

        console.error("[Face Verification Attendance Insert Error]:", attErr);
        return {
          ok: false,
          resultCode: "ERROR",
          message: `Failed to record attendance: ${attErr.message}`,
        };
      }

      // Record successful verification attempt in audit trail
      try {
        await supabaseAdmin.from("verification_attempts").insert({
          user_id: matchedProfile.id,
          day_date: today,
          method: "face_verification",
          reference_photo_path: matchedProfile.photo_path,
          confidence,
          match_result: true,
          status: "matched",
          provider: "server_vision",
          provider_response: {
            method: "admin_face_recognition",
            confidence,
            threshold,
            verified_by: userId,
          } as never,
        });

        await supabaseAdmin.from("audit_logs").insert({
          actor_id: userId,
          target_user: matchedProfile.id,
          action: "attendance_confirmed_face_verification",
          details: {
            attendanceId: newAtt.id,
            confidence,
            dayDate: today,
            method: "face_verification",
          } as never,
        });
      } catch (logErr) {
        console.warn("[Face Verification Log Error]:", logErr);
      }

      return {
        ok: true,
        resultCode: "VERIFIED_PRESENT",
        message: "Attendance Marked Successfully — Face Verified.",
        confidence,
        threshold,
        participant: {
          id: matchedProfile.id,
          fullName: matchedProfile.full_name,
          participantCode: matchedProfile.participant_code,
          email: matchedProfile.email,
          phone: matchedProfile.phone,
          photoUrl,
          verificationStatus: matchedProfile.verification_status,
        },
        attendance: {
          id: newAtt.id,
          status: "present",
          checkedInAt: nowIso,
          dayDate: today,
          method: "qr_selfie",
          remarks: newAtt.remarks,
        },
      };
    };

    // =========================================================================
    // CASE A: 1-to-1 Targeted Verification (Specific Participant Provided)
    // =========================================================================
    if (participantId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, participant_code, email, phone, photo_path, verification_status")
        .eq("id", participantId)
        .maybeSingle();

      if (!profile) {
        return {
          ok: false,
          resultCode: "ERROR",
          message: "Participant profile not found.",
        };
      }

      if (profile.verification_status !== "verified") {
        return {
          ok: false,
          resultCode: "PARTICIPANT_NOT_APPROVED",
          message: `Participant registration is ${profile.verification_status.toUpperCase()}. Only approved participants can have attendance marked.`,
        };
      }

      if (!profile.photo_path) {
        return {
          ok: false,
          resultCode: "NO_REFERENCE_PHOTO",
          message: "Participant does not have an enrolled reference portrait. Please upload a profile photo first.",
        };
      }

      // Download reference photo
      let refBuffer: Buffer;
      try {
        refBuffer = await fetchStorageImage(supabaseAdmin, "photos", profile.photo_path);
      } catch (err) {
        return {
          ok: false,
          resultCode: "ERROR",
          message: `Could not retrieve enrolled reference photo: ${err instanceof Error ? err.message : "Not found"}`,
        };
      }

      // Compare visual features
      const confidence = computeVisualFeatureSimilarity(refBuffer, liveBuffer);

      if (confidence < threshold || confidence <= 0) {
        // Record failed attempt
        try {
          await supabaseAdmin.from("verification_attempts").insert({
            user_id: profile.id,
            day_date: today,
            method: "face_verification",
            reference_photo_path: profile.photo_path,
            confidence,
            match_result: false,
            status: "mismatched",
            provider: "server_vision",
            provider_response: { confidence, threshold, error: "Score below threshold or no face detected" } as never,
          });
        } catch {
          // ignore
        }

        return {
          ok: false,
          resultCode: "FACE_NOT_RECOGNIZED",
          message: `Face Not Recognized — Unable to establish a reliable facial match against ${profile.full_name}'s enrolled portrait (${confidence}% match). Try capturing again with good lighting or verify using QR code.`,
          confidence,
          threshold,
        };
      }

      // Verified! Mark attendance
      return await recordFaceAttendance(profile, confidence);
    }

    // =========================================================================
    // CASE B: 1-to-N Automatic Identification Against Enrolled Participants
    // =========================================================================
    const { data: approvedProfiles, error: fetchErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, participant_code, email, phone, photo_path, verification_status")
      .eq("verification_status", "verified")
      .not("photo_path", "is", null);

    if (fetchErr || !approvedProfiles?.length) {
      return {
        ok: false,
        resultCode: "NO_ELIGIBLE_PARTICIPANTS",
        message: "No approved participants with registered reference photos found in the system.",
      };
    }

    // Evaluate live photo against reference photos
    const scores: Array<{
      profile: (typeof approvedProfiles)[number];
      score: number;
    }> = [];

    // Compare with all candidate portraits
    await Promise.all(
      approvedProfiles.map(async (prof) => {
        if (!prof.photo_path) return;
        try {
          const refBuf = await fetchStorageImage(supabaseAdmin, "photos", prof.photo_path);
          const score = computeVisualFeatureSimilarity(refBuf, liveBuffer);
          scores.push({ profile: prof, score });
        } catch {
          // Ignore individual photo fetch failure
        }
      }),
    );

    scores.sort((a, b) => b.score - a.score);

    const top = scores[0];
    const second = scores[1];

    if (!top || top.score < threshold || top.score <= 0) {
      return {
        ok: false,
        resultCode: "FACE_NOT_RECOGNIZED",
        message: "Face Not Recognized — No matching enrolled attendee could be established from the captured image. Please retry with clearer framing or scan participant QR code.",
        confidence: top?.score ?? 0,
        threshold,
      };
    }

    // Ambiguity guard: If 2 participants match with close similarity scores (diff < 5%),
    // flag for manual review instead of falsely auto-selecting an arbitrary person.
    if (second && second.score >= threshold && top.score - second.score < 5 && top.score > 0) {
      return {
        ok: false,
        resultCode: "UNCERTAIN_MATCH_PENDING_REVIEW",
        message: `Uncertain Match — Multiple participants (${top.profile.full_name} at ${top.score}% and ${second.profile.full_name} at ${second.score}%) matched closely. Please select the participant manually or verify using QR code scan.`,
        confidence: top.score,
        threshold,
        candidates: [
          {
            id: top.profile.id,
            fullName: top.profile.full_name,
            participantCode: top.profile.participant_code,
            score: top.score,
          },
          {
            id: second.profile.id,
            fullName: second.profile.full_name,
            participantCode: second.profile.participant_code,
            score: second.score,
          },
        ],
      };
    }

    // Clear match! Mark attendance
    return await recordFaceAttendance(top.profile, top.score);
  });


