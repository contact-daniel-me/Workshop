import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizePhone, INDIAN_PHONE, type AttStatus } from "./attendance";
import { normalizeAppPassword, phoneToAuthEmail } from "./auth-helpers";
import { validateImageMagicBytes } from "./image-validation";

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

/** Staff only: Register a new participant directly from the Admin Dashboard */
export const registerParticipantByAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      fullName: string;
      phone: string;
      email: string;
      password: string;
      verificationStatus: "verified" | "pending";
      photoBase64: string;
      remarks?: string;
    }) => {
      const fullName = String(input.fullName ?? "").trim();
      const rawPhone = String(input.phone ?? "").trim();
      const phone = normalizePhone(rawPhone);
      const email = String(input.email ?? "").trim().toLowerCase();
      const password = String(input.password ?? "").trim();
      const verificationStatus = input.verificationStatus === "verified" ? "verified" : "pending";
      const photoBase64 = String(input.photoBase64 ?? "").trim();
      const remarks = input.remarks ? String(input.remarks).trim().slice(0, 500) : "";

      if (!fullName || fullName.length < 2 || fullName.length > 100) {
        throw new Error("Full name is required (2-100 characters).");
      }
      if (!phone || !INDIAN_PHONE.test(phone)) {
        throw new Error("A valid 10-digit mobile number is required.");
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("A valid email address is required.");
      }
      if (!password || password.length < 8) {
        throw new Error("Password must be at least 8 characters long.");
      }
      if (!photoBase64) {
        throw new Error("A clear profile photograph is required.");
      }

      return {
        fullName,
        phone,
        email,
        password,
        verificationStatus,
        photoBase64,
        remarks: remarks || undefined,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Unauthorized: Only administrators can register participants.");

    // 1. Uniqueness check against existing accounts
    const { data: duplicatePhone } = await supabase
      .from("profiles")
      .select("id")
      .eq("phone", data.phone)
      .maybeSingle();

    if (duplicatePhone) {
      throw new Error(`An account with mobile number ${data.phone} is already registered.`);
    }

    const { data: duplicateEmail } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", data.email)
      .maybeSingle();

    if (duplicateEmail) {
      throw new Error(`An account with email address ${data.email} is already registered.`);
    }

    // 2. Validate photograph content & magic bytes
    let cleanBase64 = data.photoBase64;
    if (cleanBase64.includes(",")) {
      cleanBase64 = cleanBase64.split(",")[1];
    }
    const photoBuffer = Buffer.from(cleanBase64, "base64");
    if (photoBuffer.length > 5 * 1024 * 1024) {
      throw new Error("Photograph exceeds the 5 MB file size limit.");
    }
    const { ext, mime } = validateImageMagicBytes(photoBuffer);

    // 3. Create authentication account using Supabase Auth Admin API
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const authEmail = phoneToAuthEmail(data.phone);

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: normalizeAppPassword(data.password),
      email_confirm: true,
      user_metadata: {
        full_name: data.fullName,
        phone: data.phone,
        email: data.email,
        consent: "true",
        role: "participant",
        registered_by_admin: userId,
      },
    });

    if (authError || !authUser?.user) {
      throw new Error(`Failed to create participant account: ${authError?.message || "Unknown auth error"}`);
    }

    const newUserId = authUser.user.id;
    let photoPath = "";

    try {
      // 4. Upload photo to private 'photos' storage bucket in user-specific path
      photoPath = `${newUserId}/profile_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from("photos")
        .upload(photoPath, photoBuffer, {
          contentType: mime,
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Failed to store photograph: ${uploadError.message}`);
      }

      // 5. Update profile with photo_path and administrator-selected verification status
      const { data: updatedProfile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          photo_path: photoPath,
          verification_status: data.verificationStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", newUserId)
        .select("id, participant_code, full_name, phone, email, photo_path, verification_status, created_at")
        .single();

      if (profileError || !updatedProfile) {
        throw new Error(`Failed to finalize profile: ${profileError?.message || "Profile not found"}`);
      }

      // 6. Enforce strictly 'participant' role
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: newUserId, role: "participant" }, { onConflict: "user_id,role" });

      // 7. Write audit log entry
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: userId,
        action: "admin_register_participant",
        target_user: newUserId,
        details: {
          full_name: data.fullName,
          phone: data.phone,
          email: data.email,
          participant_code: updatedProfile.participant_code,
          verification_status: data.verificationStatus,
          remarks: data.remarks ?? null,
          registered_by: userId,
          timestamp: new Date().toISOString(),
        } as never,
      });

      // 8. Generate signed URL for immediate preview
      const { data: signed } = await supabaseAdmin.storage
        .from("photos")
        .createSignedUrl(photoPath, 3600);

      return {
        ok: true,
        participant: {
          id: newUserId,
          fullName: updatedProfile.full_name,
          participantCode: updatedProfile.participant_code,
          phone: updatedProfile.phone,
          email: updatedProfile.email,
          verificationStatus: updatedProfile.verification_status,
          photoUrl: signed?.signedUrl ?? null,
        },
      };
    } catch (err: unknown) {
      // Compensating rollback cleanup: delete uploaded photo & auth user on failure
      if (photoPath) {
        try {
          await supabaseAdmin.storage.from("photos").remove([photoPath]);
        } catch {
          // ignore cleanup error
        }
      }
      try {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
      } catch {
        // ignore cleanup error
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  });

/** Staff only: Change a participant's password securely */
export const adminChangeParticipantPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { targetUserId: string; newPassword: string }) => {
    const targetUserId = String(input.targetUserId ?? "").trim();
    const newPassword = String(input.newPassword ?? "");
    if (!targetUserId) throw new Error("Participant ID is required.");
    if (!newPassword || newPassword.length < 8) {
      throw new Error("Password must be at least 8 characters long.");
    }
    return { targetUserId, newPassword };
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Authorize caller
    const { data: isStaff } = await supabaseAdmin.rpc("is_staff", { _user_id: userId });
    if (!isStaff) throw new Error("Unauthorized: Only administrators can change passwords.");

    // 2. Fetch target profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, participant_code")
      .eq("id", data.targetUserId)
      .maybeSingle();

    if (!profile) throw new Error("Participant profile not found.");

    // 3. Prevent modifying super_admin accounts unless caller is super_admin
    const { data: targetIsSuper } = await supabaseAdmin.rpc("has_role", {
      _user_id: data.targetUserId,
      _role: "super_admin",
    });
    if (targetIsSuper) {
      const { data: callerIsSuper } = await supabaseAdmin.rpc("has_role", {
        _user_id: userId,
        _role: "super_admin",
      });
      if (!callerIsSuper) {
        throw new Error("Unauthorized: Only super administrators can modify super administrator credentials.");
      }
    }

    // 4. Update password via Supabase Auth Admin API
    const saltedPassword = normalizeAppPassword(data.newPassword);
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(data.targetUserId, {
      password: saltedPassword,
      email_confirm: true,
    });

    if (updateErr) {
      // Record failure audit log
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: userId,
        target_user: data.targetUserId,
        action: "admin_password_change_failed",
        details: {
          error: updateErr.message,
          timestamp: new Date().toISOString(),
        } as never,
      });
      throw new Error(`Failed to update password: ${updateErr.message}`);
    }

    // 5. Record success audit log (NEVER store or log passwords)
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      target_user: data.targetUserId,
      action: "admin_password_changed",
      details: {
        participant_code: profile.participant_code,
        full_name: profile.full_name,
        changed_by: userId,
        timestamp: new Date().toISOString(),
      } as never,
    });

    return {
      ok: true,
      message: "Password updated successfully. The participant can now sign in using the new password.",
    };
  });

/** Staff only: Delete a participant account with attendance retention audit logging */
export const adminDeleteParticipant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { targetUserId: string }) => {
    const targetUserId = String(input.targetUserId ?? "").trim();
    if (!targetUserId) throw new Error("Participant ID is required.");
    return { targetUserId };
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Authorize caller
    const { data: isStaff } = await supabaseAdmin.rpc("is_staff", { _user_id: userId });
    if (!isStaff) throw new Error("Unauthorized: Only administrators can delete participant accounts.");

    // 2. Prevent self-deletion
    if (data.targetUserId === userId) {
      throw new Error("Administrators cannot delete their own active account.");
    }

    // 3. Fetch target profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, participant_code, photo_path, email, phone")
      .eq("id", data.targetUserId)
      .maybeSingle();

    if (!profile) throw new Error("Participant profile not found.");

    // 4. Prevent deleting staff or super_admin accounts unless caller is super_admin
    const { data: targetIsStaff } = await supabaseAdmin.rpc("is_staff", { _user_id: data.targetUserId });
    if (targetIsStaff) {
      const { data: callerIsSuper } = await supabaseAdmin.rpc("has_role", {
        _user_id: userId,
        _role: "super_admin",
      });
      if (!callerIsSuper) {
        throw new Error("Unauthorized: Only super administrators can remove staff accounts.");
      }
    }

    // 5. Gather attendance records for audit retention before deletion
    const { data: attendanceRecords } = await supabaseAdmin
      .from("attendance")
      .select("id, day_date, status, method, checked_in_at")
      .eq("user_id", data.targetUserId);

    const attendanceCount = attendanceRecords?.length ?? 0;

    // 6. Delete profile photo from photos bucket if exists
    if (profile.photo_path) {
      try {
        await supabaseAdmin.storage.from("photos").remove([profile.photo_path]);
      } catch (storageErr) {
        console.warn("Could not delete photo from storage:", storageErr);
      }
    }

    // 7. Delete auth user (cascades cleanly to profiles and associated tables)
    const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(data.targetUserId);

    if (deleteErr) {
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: userId,
        target_user: data.targetUserId,
        action: "admin_participant_delete_failed",
        details: {
          error: deleteErr.message,
          timestamp: new Date().toISOString(),
        } as never,
      });
      throw new Error(`Failed to delete participant account: ${deleteErr.message}`);
    }

    // 8. Write retention audit log preserving historical record summary
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "admin_participant_deleted",
      details: {
        deleted_user_id: data.targetUserId,
        full_name: profile.full_name,
        participant_code: profile.participant_code,
        email: profile.email,
        phone: profile.phone,
        retained_attendance_count: attendanceCount,
        archived_attendance: attendanceRecords ?? [],
        deleted_by: userId,
        timestamp: new Date().toISOString(),
      } as never,
    });

    return {
      ok: true,
      message: "Participant account deleted successfully.",
    };
  });


