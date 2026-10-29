import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AttStatus } from "./attendance";

/** Staff only: Mark or correct participant attendance manually with a mandatory reason */
export const markAttendanceManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      userId: string;
      dayDate: string;
      status: AttStatus;
      remarks: string;
    }) => {
      const remarks = String(input.remarks ?? "").trim();
      if (!remarks || remarks.length < 3) {
        throw new Error("A mandatory reason (at least 3 characters) is required for manual attendance changes.");
      }
      return {
        userId: String(input.userId).trim(),
        dayDate: String(input.dayDate).trim(),
        status: input.status,
        remarks,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Unauthorized: Only administrators can modify attendance manually.");

    const { error } = await supabase
      .from("attendance")
      .upsert(
        {
          user_id: data.userId,
          day_date: data.dayDate,
          status: data.status,
          method: "manual",
          marked_by: userId,
          remarks: data.remarks,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,day_date" },
      );

    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      action: "attendance_manual_marked",
      target_user: data.userId,
      details: { day: data.dayDate, status: data.status, remarks: data.remarks } as never,
    });

    return { ok: true, message: `Attendance updated to ${data.status.toUpperCase()}.` };
  });

/** Staff only: Approve or reject participant registration verification */
export const verifyParticipantRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string; status: "verified" | "rejected"; reason?: string }) => {
    const status = input.status;
    const reason = input.reason ? String(input.reason).trim() : "";
    if (status === "rejected" && (!reason || reason.length < 3)) {
      throw new Error("A brief reason (at least 3 characters) is required when rejecting a participant.");
    }
    return {
      userId: String(input.userId).trim(),
      status,
      reason: reason || undefined,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Unauthorized: Only administrators can verify participant registrations.");

    const { error } = await supabase
      .from("profiles")
      .update({ verification_status: data.status })
      .eq("id", data.userId);

    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      action: data.status === "verified" ? "participant_approved" : "participant_rejected",
      target_user: data.userId,
      details: {
        status: data.status,
        reason: data.reason ?? null,
        verified_by: userId,
        timestamp: new Date().toISOString(),
      } as never,
    });

    return {
      ok: true,
      message: data.status === "verified" ? "Participant approved successfully." : "Participant rejected.",
    };
  });

/** Staff only: Review pending attendance selfie (Approve / Reject) */
export const reviewSelfieAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { attendanceId: string; approved: boolean; remarks: string }) => {
    const remarks = String(input.remarks ?? "").trim();
    if (!remarks) throw new Error("A review note is required.");
    return {
      attendanceId: String(input.attendanceId).trim(),
      approved: Boolean(input.approved),
      remarks,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Unauthorized: Only administrators can review selfies.");

    const newStatus: AttStatus = data.approved ? "present" : "rejected";
    const { data: att, error } = await supabase
      .from("attendance")
      .update({
        status: newStatus,
        marked_by: userId,
        remarks: data.remarks,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.attendanceId)
      .select("user_id, day_date")
      .single();

    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      action: data.approved ? "selfie_approved" : "selfie_rejected",
      target_user: att.user_id,
      details: { day: att.day_date, status: newStatus, remarks: data.remarks } as never,
    });

    return { ok: true, message: `Selfie verification ${data.approved ? "approved" : "rejected"}.` };
  });

/** Super Admin only: Update workshop configuration */
export const updateWorkshopSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      name: string;
      startDate: string;
      durationDays: number;
      qrValidityMinutes: number;
      requireSelfie: boolean;
      lowAttendanceThreshold: number;
    }) => {
      const name = String(input.name ?? "").trim();
      if (!name) throw new Error("Workshop name is required.");
      return {
        name,
        startDate: String(input.startDate).trim(),
        durationDays: Math.min(120, Math.max(1, Number(input.durationDays))),
        qrValidityMinutes: Math.min(1440, Math.max(1, Number(input.qrValidityMinutes))),
        requireSelfie: Boolean(input.requireSelfie),
        lowAttendanceThreshold: Math.min(100, Math.max(10, Number(input.lowAttendanceThreshold))),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
    if (!isSuper) throw new Error("Unauthorized: Only super administrators can modify workshop settings.");

    const { error } = await supabase
      .from("workshop_settings")
      .update({
        name: data.name,
        start_date: data.startDate,
        duration_days: data.durationDays,
        qr_validity_minutes: data.qrValidityMinutes,
        require_selfie: data.requireSelfie,
        low_attendance_threshold: data.lowAttendanceThreshold,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      action: "workshop_settings_updated",
      details: data as never,
    });

    return { ok: true, message: "Workshop settings updated successfully." };
  });

/** Staff only: Revoke currently active QR session */
export const revokeQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { sessionId: string }) => ({ sessionId: String(input.sessionId).trim() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Unauthorized: Only administrators can revoke QR codes.");

    const { error } = await supabase
      .from("qr_sessions")
      .update({ revoked: true })
      .eq("id", data.sessionId);

    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      action: "qr_revoked",
      details: { sessionId: data.sessionId } as never,
    });

    return { ok: true, message: "QR session revoked successfully." };
  });

/** Super Admin only: Toggle Staff Role (attendance_admin) for a participant */
export const toggleStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { targetUserId: string; makeStaff: boolean }) => ({
    targetUserId: String(input.targetUserId).trim(),
    makeStaff: Boolean(input.makeStaff),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
    if (!isSuper) throw new Error("Unauthorized: Only super administrators can manage roles.");

    if (data.makeStaff) {
      await supabase
        .from("user_roles")
        .upsert({ user_id: data.targetUserId, role: "attendance_admin" }, { onConflict: "user_id,role" });
    } else {
      await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", data.targetUserId)
        .eq("role", "attendance_admin");
    }

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      action: data.makeStaff ? "granted_attendance_admin" : "revoked_attendance_admin",
      target_user: data.targetUserId,
      details: { makeStaff: data.makeStaff } as never,
    });

    return { ok: true, message: `Staff role ${data.makeStaff ? "granted" : "removed"}.` };
  });

