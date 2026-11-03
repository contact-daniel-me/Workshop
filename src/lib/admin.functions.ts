import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizePhone, INDIAN_PHONE, type AttStatus } from "./attendance";
import { normalizeAppPassword, phoneToAuthEmail, generateDefaultStudentPassword } from "./auth-helpers";
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

    const isPresent = data.status === "present";
    const { error } = await supabase
      .from("attendance")
      .upsert(
        {
          user_id: data.userId,
          day_date: data.dayDate,
          status: data.status,
          morning_status: isPresent ? "present" : null,
          afternoon_status: isPresent ? "present" : null,
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
        morning_status: data.approved ? "present" : null,
        afternoon_status: data.approved ? "present" : null,
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
      fullName?: string;
      phone?: string;
      email?: string;
      password?: string;
      verificationStatus?: "verified" | "pending";
      photoBase64?: string;
      remarks?: string;
    }) => {
      const rawName = String(input.fullName ?? "").trim();
      const fullName = rawName || "Participant";
      const rawPhone = String(input.phone ?? "").trim();
      const cleanPhone = rawPhone ? normalizePhone(rawPhone) : "";
      // If no phone provided, generate a dedicated unique mobile identifier
      const phone = cleanPhone || `99${Date.now().toString().slice(-8)}`;

      const rawEmail = String(input.email ?? "").trim().toLowerCase();
      const email = rawEmail || phoneToAuthEmail(phone);

      const rawPassword = String(input.password ?? "").trim();
      const password = rawPassword || generateDefaultStudentPassword(fullName, phone);

      // Participants registered by an administrator are auto-approved immediately
      const verificationStatus: "verified" = "verified";
      const photoBase64 = String(input.photoBase64 ?? "").trim();
      const remarks = input.remarks ? String(input.remarks).trim().slice(0, 500) : "";

      return {
        fullName,
        phone,
        email,
        password: password.length >= 6 ? password : `${password}1234`,
        verificationStatus,
        photoBase64: photoBase64 || undefined,
        remarks: remarks || undefined,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Unauthorized: Only administrators can register participants.");

    // 1. Uniqueness check against existing accounts (only check if provided by user)
    if (data.phone && !data.phone.startsWith("unset-")) {
      const { data: duplicatePhone } = await supabase
        .from("profiles")
        .select("id")
        .eq("phone", data.phone)
        .maybeSingle();

      if (duplicatePhone) {
        throw new Error(`An account with mobile number ${data.phone} is already registered.`);
      }
    }

    if (data.email && !data.email.endsWith("@workshop.internal")) {
      const { data: duplicateEmail } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", data.email)
        .maybeSingle();

      if (duplicateEmail) {
        throw new Error(`An account with email address ${data.email} is already registered.`);
      }
    }

    // 2. Validate photograph content & magic bytes (if photo is provided)
    let photoBuffer: Buffer | null = null;
    let photoExt = "";
    let photoMime = "";

    if (data.photoBase64) {
      let cleanBase64 = data.photoBase64;
      if (cleanBase64.includes(",")) {
        cleanBase64 = cleanBase64.split(",")[1]!;
      }
      photoBuffer = Buffer.from(cleanBase64, "base64");
      if (photoBuffer.length > 5 * 1024 * 1024) {
        throw new Error("Photograph exceeds the 5 MB file size limit.");
      }
      const magic = validateImageMagicBytes(photoBuffer);
      photoExt = magic.ext;
      photoMime = magic.mime;
    }

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
    let photoPath: string | null = null;

    try {
      if (photoBuffer) {
        // 4. Upload photo to private 'photos' storage bucket in user-specific path
        photoPath = `${newUserId}/profile_${Date.now()}.${photoExt}`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from("photos")
          .upload(photoPath, photoBuffer, {
            contentType: photoMime,
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Failed to store photograph: ${uploadError.message}`);
        }
      }

      // 5. Update profile with administrator-selected verification status and optional photo_path
      const updatePayload: Record<string, unknown> = {
        verification_status: data.verificationStatus,
      };
      if (photoPath) {
        updatePayload.photo_path = photoPath;
      }

      const { data: updatedProfile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .update(updatePayload)
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
          has_photo: Boolean(photoPath),
          registered_by: userId,
          timestamp: new Date().toISOString(),
        } as never,
      });

      // 8. Generate signed URL for immediate preview (if photo uploaded)
      let signedUrl: string | null = null;
      if (photoPath) {
        const { data: signed } = await supabaseAdmin.storage
          .from("photos")
          .createSignedUrl(photoPath, 3600);
        signedUrl = signed?.signedUrl ?? null;
      }

      return {
        ok: true,
        participant: {
          id: newUserId,
          fullName: updatedProfile.full_name,
          participantCode: updatedProfile.participant_code,
          phone: updatedProfile.phone,
          email: updatedProfile.email,
          verificationStatus: updatedProfile.verification_status,
          photoUrl: signedUrl,
          rawPassword: data.password,
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

export interface BulkParticipantInput {
  serialNo: number;
  fullName: string;
  phone: string;
  email: string;
  age?: string;
  category?: string;
  password?: string;
}

export interface BulkRegistrationResultItem {
  serialNo: number;
  fullName: string;
  phone: string;
  email: string;
  participantCode: string;
  status: "created" | "duplicate" | "error";
  password: string;
  error?: string;
}

/** Staff only: Bulk register ESDP participants with auto-generated default passwords and auto-approval */
export const bulkRegisterParticipantsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { participants: BulkParticipantInput[] }) => {
    if (!Array.isArray(input.participants) || input.participants.length === 0) {
      throw new Error("No participant records provided for registration.");
    }
    if (input.participants.length > 200) {
      throw new Error("Bulk registration batch size exceeds 200 participants limit.");
    }
    return {
      participants: input.participants.map((p, idx) => ({
        serialNo: Number(p.serialNo) || idx + 1,
        fullName: String(p.fullName ?? "").trim(),
        phone: String(p.phone ?? "").trim(),
        email: String(p.email ?? "").trim().toLowerCase(),
        age: p.age ? String(p.age).trim() : undefined,
        category: p.category ? String(p.category).trim() : undefined,
        password: p.password ? String(p.password).trim() : undefined,
      })),
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Unauthorized: Only administrators can bulk register participants.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch existing profiles to detect duplicate phone numbers or email addresses
    const { data: existingProfiles, error: fetchErr } = await supabaseAdmin
      .from("profiles")
      .select("id, phone, email, participant_code");

    if (fetchErr) {
      throw new Error(`Failed to check existing participants: ${fetchErr.message}`);
    }

    const existingPhoneMap = new Map<string, { id: string; code: string }>();
    const existingEmailMap = new Map<string, { id: string; code: string }>();

    for (const p of existingProfiles || []) {
      if (p.phone) {
        existingPhoneMap.set(normalizePhone(p.phone), { id: p.id, code: p.participant_code });
      }
      if (p.email) {
        existingEmailMap.set(p.email.toLowerCase(), { id: p.id, code: p.participant_code });
      }
    }

    const results: BulkRegistrationResultItem[] = [];
    let createdCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;

    for (const p of data.participants) {
      const cleanPhone = normalizePhone(p.phone);
      const cleanName = p.fullName;
      const cleanEmail = p.email;
      const computedPassword = p.password || generateDefaultStudentPassword(cleanName, cleanPhone);

      // 1. Validation checks
      if (!cleanName || cleanName.length < 2) {
        failedCount++;
        results.push({
          serialNo: p.serialNo,
          fullName: cleanName || "Unknown",
          phone: p.phone,
          email: cleanEmail,
          participantCode: "-",
          status: "error",
          password: computedPassword,
          error: "Full name must be at least 2 characters.",
        });
        continue;
      }

      if (!cleanPhone || !INDIAN_PHONE.test(cleanPhone)) {
        failedCount++;
        results.push({
          serialNo: p.serialNo,
          fullName: cleanName,
          phone: p.phone,
          email: cleanEmail,
          participantCode: "-",
          status: "error",
          password: computedPassword,
          error: "Invalid 10-digit mobile number.",
        });
        continue;
      }

      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        failedCount++;
        results.push({
          serialNo: p.serialNo,
          fullName: cleanName,
          phone: cleanPhone,
          email: cleanEmail,
          participantCode: "-",
          status: "error",
          password: computedPassword,
          error: "Invalid email address format.",
        });
        continue;
      }

      // 2. Duplicate detection
      const existingByPhone = existingPhoneMap.get(cleanPhone);
      if (existingByPhone) {
        duplicateCount++;
        results.push({
          serialNo: p.serialNo,
          fullName: cleanName,
          phone: cleanPhone,
          email: cleanEmail,
          participantCode: existingByPhone.code,
          status: "duplicate",
          password: computedPassword,
          error: `Mobile number ${cleanPhone} is already registered (${existingByPhone.code}).`,
        });
        continue;
      }

      const existingByEmail = existingEmailMap.get(cleanEmail);
      if (existingByEmail) {
        duplicateCount++;
        results.push({
          serialNo: p.serialNo,
          fullName: cleanName,
          phone: cleanPhone,
          email: cleanEmail,
          participantCode: existingByEmail.code,
          status: "duplicate",
          password: computedPassword,
          error: `Email ${cleanEmail} is already registered (${existingByEmail.code}).`,
        });
        continue;
      }

      // 3. Create user in Supabase Auth
      try {
        const authEmail = phoneToAuthEmail(cleanPhone);
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: authEmail,
          password: normalizeAppPassword(computedPassword),
          email_confirm: true,
          user_metadata: {
            full_name: cleanName,
            phone: cleanPhone,
            email: cleanEmail,
            consent: "true",
            role: "participant",
            registered_by_admin: userId,
            batch: "ESDP",
            age: p.age ?? null,
            category: p.category ?? null,
          },
        });

        if (authError || !authUser?.user) {
          const msg = authError?.message || "Failed to create user";
          if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already exists")) {
            duplicateCount++;
            results.push({
              serialNo: p.serialNo,
              fullName: cleanName,
              phone: cleanPhone,
              email: cleanEmail,
              participantCode: "EXISTING",
              status: "duplicate",
              password: computedPassword,
              error: `Account already exists: ${msg}`,
            });
          } else {
            failedCount++;
            results.push({
              serialNo: p.serialNo,
              fullName: cleanName,
              phone: cleanPhone,
              email: cleanEmail,
              participantCode: "-",
              status: "error",
              password: computedPassword,
              error: msg,
            });
          }
          continue;
        }

        const newUserId = authUser.user.id;

        // 4. Update profile to auto-approved (verified) and add ESDP remarks
        const remarkParts = ["ESDP Participant"];
        if (p.age) remarkParts.push(`Age: ${p.age}`);
        if (p.category) remarkParts.push(`Category: ${p.category}`);

        const { data: updatedProfile } = await supabaseAdmin
          .from("profiles")
          .update({
            verification_status: "verified",
          })
          .eq("id", newUserId)
          .select("participant_code")
          .single();

        const assignedCode = updatedProfile?.participant_code || "SA-2026";

        // 5. Ensure participant role is set
        await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: newUserId, role: "participant" }, { onConflict: "user_id,role" });

        // Update in-memory map to catch intra-batch duplicate numbers
        existingPhoneMap.set(cleanPhone, { id: newUserId, code: assignedCode });
        existingEmailMap.set(cleanEmail, { id: newUserId, code: assignedCode });

        createdCount++;
        results.push({
          serialNo: p.serialNo,
          fullName: cleanName,
          phone: cleanPhone,
          email: cleanEmail,
          participantCode: assignedCode,
          status: "created",
          password: computedPassword,
        });
      } catch (itemErr: unknown) {
        failedCount++;
        results.push({
          serialNo: p.serialNo,
          fullName: cleanName,
          phone: cleanPhone,
          email: cleanEmail,
          participantCode: "-",
          status: "error",
          password: computedPassword,
          error: itemErr instanceof Error ? itemErr.message : String(itemErr),
        });
      }
    }

    // 6. Write audit log entry for the bulk import
    try {
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: userId,
        action: "admin_bulk_register_esdp",
        details: {
          total: data.participants.length,
          created: createdCount,
          duplicates: duplicateCount,
          failed: failedCount,
          timestamp: new Date().toISOString(),
        } as never,
      });
    } catch {
      // audit log failure should not break response
    }

    return {
      ok: true,
      summary: {
        total: data.participants.length,
        created: createdCount,
        duplicates: duplicateCount,
        failed: failedCount,
      },
      results,
    };
  });

/** Staff only: Change a participant's password securely */
export const adminChangeParticipantPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { targetUserId: string; newPassword: string }) => {
    const targetUserId = String(input.targetUserId ?? "").trim();
    const newPassword = String(input.newPassword ?? "");
    if (!targetUserId) throw new Error("Participant ID is required.");
    if (!newPassword || newPassword.length < 6) {
      throw new Error("Password must be at least 6 characters long.");
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
      .select("id, full_name, phone, participant_code")
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
    const authUpdatePayload: Record<string, unknown> = {
      password: saltedPassword,
      email_confirm: true,
    };
    if (profile.phone && normalizePhone(profile.phone).length === 10) {
      authUpdatePayload.email = phoneToAuthEmail(profile.phone);
    }

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(data.targetUserId, authUpdatePayload);

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

/** Staff only: Update a participant's details (name, phone, email, status, remarks, photo, password) */
export const adminUpdateParticipantDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      targetUserId: string;
      fullName: string;
      phone?: string | undefined;
      email?: string | undefined;
      verificationStatus?: "verified" | "pending" | "rejected" | undefined;
      remarks?: string | undefined;
      newPassword?: string | undefined;
      photoBase64?: string | undefined;
      removePhoto?: boolean | undefined;
    }) => {
      const targetUserId = String(input.targetUserId ?? "").trim();
      if (!targetUserId) throw new Error("Participant ID is required.");

      const fullName = String(input.fullName ?? "").trim();
      if (!fullName || fullName.length < 2) {
        throw new Error("Full name must be at least 2 characters.");
      }

      const rawPhone = String(input.phone ?? "").trim();
      const phone = rawPhone ? normalizePhone(rawPhone) : undefined;
      if (phone && !INDIAN_PHONE.test(phone)) {
        throw new Error("A valid 10-digit mobile number is required.");
      }

      const rawEmail = String(input.email ?? "").trim().toLowerCase();
      const email = rawEmail || undefined;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("A valid email address is required.");
      }

      const verificationStatus = input.verificationStatus;
      const remarks = input.remarks !== undefined ? String(input.remarks).trim().slice(0, 500) : undefined;
      const newPassword = input.newPassword ? String(input.newPassword).trim() : undefined;
      if (newPassword && newPassword.length < 6) {
        throw new Error("New password must be at least 6 characters.");
      }

      const photoBase64 = input.photoBase64 ? String(input.photoBase64).trim() : undefined;
      const removePhoto = Boolean(input.removePhoto);

      return {
        targetUserId,
        fullName,
        phone,
        email,
        verificationStatus,
        remarks,
        newPassword,
        photoBase64,
        removePhoto,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Authorize caller
    const { data: isStaff } = await supabaseAdmin.rpc("is_staff", { _user_id: userId });
    if (!isStaff) throw new Error("Unauthorized: Only administrators can edit participant details.");

    // 2. Fetch existing profile
    const { data: currentProfile, error: fetchErr } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", data.targetUserId)
      .maybeSingle();

    if (fetchErr || !currentProfile) {
      throw new Error("Participant profile not found.");
    }

    // 3. Uniqueness check against other accounts
    if (data.phone && data.phone !== currentProfile.phone) {
      const { data: duplicatePhone } = await supabaseAdmin
        .from("profiles")
        .select("id, participant_code")
        .eq("phone", data.phone)
        .neq("id", data.targetUserId)
        .maybeSingle();

      if (duplicatePhone) {
        throw new Error(`Mobile number ${data.phone} is already registered by another participant (${duplicatePhone.participant_code}).`);
      }
    }

    if (data.email && data.email !== currentProfile.email) {
      const { data: duplicateEmail } = await supabaseAdmin
        .from("profiles")
        .select("id, participant_code")
        .ilike("email", data.email)
        .neq("id", data.targetUserId)
        .maybeSingle();

      if (duplicateEmail) {
        throw new Error(`Email address ${data.email} is already registered by another participant (${duplicateEmail.participant_code}).`);
      }
    }

    // 4. Handle photo update or removal if requested
    let updatedPhotoPath = currentProfile.photo_path;

    if (data.removePhoto) {
      if (currentProfile.photo_path) {
        try {
          await supabaseAdmin.storage.from("photos").remove([currentProfile.photo_path]);
        } catch {
          // ignore cleanup error
        }
      }
      updatedPhotoPath = null;
    } else if (data.photoBase64) {
      let cleanBase64 = data.photoBase64;
      if (cleanBase64.includes(",")) {
        cleanBase64 = cleanBase64.split(",")[1]!;
      }
      const photoBuffer = Buffer.from(cleanBase64, "base64");
      if (photoBuffer.length > 5 * 1024 * 1024) {
        throw new Error("Photograph exceeds the 5 MB file size limit.");
      }
      const { ext, mime } = validateImageMagicBytes(photoBuffer);

      const newPhotoPath = `${data.targetUserId}/profile_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabaseAdmin.storage
        .from("photos")
        .upload(newPhotoPath, photoBuffer, {
          contentType: mime,
          upsert: true,
        });

      if (uploadErr) {
        throw new Error(`Failed to store photograph: ${uploadErr.message}`);
      }

      // Remove previous photo if it had one
      if (currentProfile.photo_path && currentProfile.photo_path !== newPhotoPath) {
        try {
          await supabaseAdmin.storage.from("photos").remove([currentProfile.photo_path]);
        } catch {
          // ignore cleanup error
        }
      }

      updatedPhotoPath = newPhotoPath;
    }

    // 5. Update profiles record in database (only updating columns present on public.profiles)
    const finalPhone = data.phone || currentProfile.phone;
    const finalEmail = data.email || currentProfile.email;
    const finalStatus = data.verificationStatus || currentProfile.verification_status;

    const { data: updatedProfile, error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.fullName,
        phone: finalPhone,
        email: finalEmail,
        verification_status: finalStatus,
        photo_path: updatedPhotoPath,
      })
      .eq("id", data.targetUserId)
      .select("id, participant_code, full_name, phone, email, photo_path, verification_status")
      .single();

    if (updateErr || !updatedProfile) {
      throw new Error(`Failed to update profile: ${updateErr?.message || "Unknown error"}`);
    }

    // 6. Synchronize Auth user metadata, confirmed email, and password if provided
    const authUpdatePayload: Record<string, unknown> = {
      email_confirm: true,
      user_metadata: {
        full_name: data.fullName,
        phone: finalPhone,
        email: finalEmail,
        ...(data.remarks ? { remarks: data.remarks } : {}),
      },
    };

    if (finalPhone && normalizePhone(finalPhone).length === 10) {
      authUpdatePayload.email = phoneToAuthEmail(finalPhone);
    } else if (finalEmail && finalEmail.includes("@")) {
      authUpdatePayload.email = finalEmail.toLowerCase();
    }

    if (data.newPassword) {
      authUpdatePayload.password = normalizeAppPassword(data.newPassword);
    }

    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(
      data.targetUserId,
      authUpdatePayload,
    );

    if (authErr) {
      console.error("Auth updateUserById error:", authErr);
      throw new Error(`Failed to update login credentials: ${authErr.message}`);
    }

    // 7. Write audit log entry
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "admin_update_participant_details",
      target_user: data.targetUserId,
      details: {
        participant_code: updatedProfile.participant_code,
        changes: {
          full_name: { old: currentProfile.full_name, new: data.fullName },
          phone: { old: currentProfile.phone, new: finalPhone },
          email: { old: currentProfile.email, new: finalEmail },
          verification_status: { old: currentProfile.verification_status, new: finalStatus },
          remarks: data.remarks ?? null,
          photo_changed: updatedPhotoPath !== currentProfile.photo_path,
          password_updated: Boolean(data.newPassword),
        },
        updated_by: userId,
        timestamp: new Date().toISOString(),
      } as never,
    });

    // 8. Generate signed URL for updated photo if exists
    let photoUrl: string | null = null;
    if (updatedPhotoPath) {
      const { data: signed } = await supabaseAdmin.storage
        .from("photos")
        .createSignedUrl(updatedPhotoPath, 3600);
      photoUrl = signed?.signedUrl ?? null;
    }

    return {
      ok: true,
      participant: {
        id: updatedProfile.id,
        fullName: updatedProfile.full_name,
        participantCode: updatedProfile.participant_code,
        phone: updatedProfile.phone,
        email: updatedProfile.email,
        verificationStatus: updatedProfile.verification_status,
        remarks: data.remarks ?? null,
        photoPath: updatedPhotoPath,
        photoUrl,
        password: data.newPassword,
      },
      message: `Participant ${updatedProfile.participant_code} updated successfully.`,
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

export type ManualSessionAction =
  | "mark_morning"
  | "mark_afternoon"
  | "mark_both"
  | "clear_morning"
  | "clear_afternoon"
  | "reset_both";

export type BulkSessionAction =
  | "mark_all_morning"
  | "mark_all_afternoon"
  | "mark_all_both"
  | "clear_all_morning"
  | "clear_all_afternoon"
  | "reset_all_both";

/** Staff only: Manually manage individual participant session attendance (Morning / Afternoon / Both / Reset) */
export const adminManualAttendanceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      userId: string;
      dayDate: string;
      action: ManualSessionAction;
      reason?: string;
    }) => {
      const allowedActions: ManualSessionAction[] = [
        "mark_morning",
        "mark_afternoon",
        "mark_both",
        "clear_morning",
        "clear_afternoon",
        "reset_both",
      ];
      if (!allowedActions.includes(input.action)) {
        throw new Error(`Invalid manual attendance action: ${input.action}`);
      }
      return {
        userId: String(input.userId).trim(),
        dayDate: String(input.dayDate).trim(),
        action: input.action,
        reason: input.reason ? String(input.reason).trim() : undefined,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Unauthorized: Only administrators can modify attendance.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Enforce holiday restriction: cannot mark attendance on non-working days
    const { data: dayConfig } = await supabaseAdmin
      .from("workshop_days")
      .select("is_active, topic")
      .eq("day_date", data.dayDate)
      .maybeSingle();

    if (dayConfig && !dayConfig.is_active && data.action.startsWith("mark_")) {
      throw new Error(
        `Cannot mark attendance: ${data.dayDate} is configured as a holiday or non-working day (${dayConfig.topic || "Holiday"}).`
      );
    }

    // Fetch existing attendance record
    const { data: existing } = await supabaseAdmin
      .from("attendance")
      .select("*")
      .eq("user_id", data.userId)
      .eq("day_date", data.dayDate)
      .maybeSingle();

    const prevMorning = existing?.morning_status ?? (existing?.status === "present" ? "present" : null);
    const prevAfternoon = existing?.afternoon_status ?? (existing?.status === "present" ? "present" : null);
    const prevStatus = existing?.status ?? null;

    let newMorning: string | null = prevMorning;
    let newAfternoon: string | null = prevAfternoon;
    let shouldDelete = false;

    switch (data.action) {
      case "mark_morning":
        newMorning = "present";
        break;
      case "mark_afternoon":
        newAfternoon = "present";
        break;
      case "mark_both":
        newMorning = "present";
        newAfternoon = "present";
        break;
      case "clear_morning":
        newMorning = null;
        if (!newAfternoon) shouldDelete = true;
        break;
      case "clear_afternoon":
        newAfternoon = null;
        if (!newMorning) shouldDelete = true;
        break;
      case "reset_both":
        newMorning = null;
        newAfternoon = null;
        shouldDelete = true;
        break;
    }

    if (shouldDelete) {
      if (existing) {
        const { error: delErr } = await supabaseAdmin
          .from("attendance")
          .delete()
          .eq("user_id", data.userId)
          .eq("day_date", data.dayDate);
        if (delErr) throw new Error(`Failed to reset attendance: ${delErr.message}`);
      }
    } else {
      const nowIso = new Date().toISOString();
      const remarks = data.reason || `Admin manual override (${data.action})`;
      const { error: upsertErr } = await supabaseAdmin
        .from("attendance")
        .upsert(
          {
            user_id: data.userId,
            day_date: data.dayDate,
            status: "present",
            morning_status: newMorning,
            afternoon_status: newAfternoon,
            method: "manual",
            marked_by: userId,
            remarks,
            updated_at: nowIso,
          },
          { onConflict: "user_id,day_date" },
        );
      if (upsertErr) throw new Error(`Failed to update attendance: ${upsertErr.message}`);
    }

    // Record audit log
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "attendance_manual_action",
      target_user: data.userId,
      details: {
        dayDate: data.dayDate,
        action: data.action,
        previousStatus: prevStatus,
        previousMorning: prevMorning,
        previousAfternoon: prevAfternoon,
        newMorning,
        newAfternoon,
        reason: data.reason ?? null,
        timestamp: new Date().toISOString(),
      } as never,
    });

    return {
      ok: true,
      message: `Successfully executed ${data.action.replace("_", " ")} for participant.`,
    };
  });

/** Staff only: Manually manage bulk session attendance for all or selected participants */
export const adminBulkAttendanceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      dayDate: string;
      action: BulkSessionAction;
      targetUserIds?: string[];
      reason?: string;
    }) => {
      const allowedActions: BulkSessionAction[] = [
        "mark_all_morning",
        "mark_all_afternoon",
        "mark_all_both",
        "clear_all_morning",
        "clear_all_afternoon",
        "reset_all_both",
      ];
      if (!allowedActions.includes(input.action)) {
        throw new Error(`Invalid bulk attendance action: ${input.action}`);
      }
      return {
        dayDate: String(input.dayDate).trim(),
        action: input.action,
        targetUserIds: input.targetUserIds ? input.targetUserIds.map((id) => String(id).trim()) : undefined,
        reason: input.reason ? String(input.reason).trim() : undefined,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Unauthorized: Only administrators can execute bulk attendance changes.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Enforce holiday restriction: cannot mark bulk attendance on non-working days
    const { data: dayConfig } = await supabaseAdmin
      .from("workshop_days")
      .select("is_active, topic")
      .eq("day_date", data.dayDate)
      .maybeSingle();

    if (dayConfig && !dayConfig.is_active && data.action.startsWith("mark_")) {
      throw new Error(
        `Cannot mark bulk attendance: ${data.dayDate} is configured as a holiday or non-working day (${dayConfig.topic || "Holiday"}).`
      );
    }

    // Fetch target profiles (verified participants)
    let query = supabaseAdmin
      .from("profiles")
      .select("id, participant_code, full_name")
      .eq("verification_status", "verified");

    if (data.targetUserIds && data.targetUserIds.length > 0) {
      query = query.in("id", data.targetUserIds);
    }

    const { data: profiles, error: profErr } = await query;
    if (profErr) throw new Error(`Failed to load target participants: ${profErr.message}`);
    if (!profiles || profiles.length === 0) {
      return { ok: true, count: 0, message: "No eligible participants found for this operation." };
    }

    const targetIds = profiles.map((p) => p.id);

    // Fetch existing attendance records for target participants on this date
    const { data: existingList, error: fetchAttErr } = await supabaseAdmin
      .from("attendance")
      .select("*")
      .in("user_id", targetIds)
      .eq("day_date", data.dayDate);

    if (fetchAttErr) throw new Error(`Failed to fetch current attendance records: ${fetchAttErr.message}`);

    const existingByUserId = new Map<string, any>();
    (existingList ?? []).forEach((r) => existingByUserId.set(r.user_id, r));

    const upsertRows: any[] = [];
    const deleteUserIds: string[] = [];
    const nowIso = new Date().toISOString();
    const defaultReason = data.reason || `Admin bulk override (${data.action})`;

    for (const p of profiles) {
      const existing = existingByUserId.get(p.id);
      const prevMorning = existing?.morning_status ?? (existing?.status === "present" ? "present" : null);
      const prevAfternoon = existing?.afternoon_status ?? (existing?.status === "present" ? "present" : null);

      let newMorning: string | null = prevMorning;
      let newAfternoon: string | null = prevAfternoon;
      let shouldDelete = false;

      switch (data.action) {
        case "mark_all_morning":
          newMorning = "present";
          break;
        case "mark_all_afternoon":
          newAfternoon = "present";
          break;
        case "mark_all_both":
          newMorning = "present";
          newAfternoon = "present";
          break;
        case "clear_all_morning":
          newMorning = null;
          if (!newAfternoon) shouldDelete = true;
          break;
        case "clear_all_afternoon":
          newAfternoon = null;
          if (!newMorning) shouldDelete = true;
          break;
        case "reset_all_both":
          newMorning = null;
          newAfternoon = null;
          shouldDelete = true;
          break;
      }

      if (shouldDelete) {
        if (existing) {
          deleteUserIds.push(p.id);
        }
      } else {
        upsertRows.push({
          user_id: p.id,
          day_date: data.dayDate,
          status: "present",
          morning_status: newMorning,
          afternoon_status: newAfternoon,
          method: "manual",
          marked_by: userId,
          remarks: defaultReason,
          updated_at: nowIso,
        });
      }
    }

    // Execute bulk deletes if any
    if (deleteUserIds.length > 0) {
      const { error: delErr } = await supabaseAdmin
        .from("attendance")
        .delete()
        .in("user_id", deleteUserIds)
        .eq("day_date", data.dayDate);
      if (delErr) throw new Error(`Bulk reset failed: ${delErr.message}`);
    }

    // Execute bulk upserts if any
    if (upsertRows.length > 0) {
      const { error: upsertErr } = await supabaseAdmin
        .from("attendance")
        .upsert(upsertRows, { onConflict: "user_id,day_date" });
      if (upsertErr) throw new Error(`Bulk attendance update failed: ${upsertErr.message}`);
    }

    const affectedCount = targetIds.length;

    // Operation-level audit record
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "attendance_bulk_action",
      details: {
        dayDate: data.dayDate,
        action: data.action,
        affectedCount,
        targetUserIdsCount: targetIds.length,
        isSelective: Boolean(data.targetUserIds && data.targetUserIds.length > 0),
        reason: data.reason ?? null,
        timestamp: nowIso,
      } as never,
    });

    return {
      ok: true,
      count: affectedCount,
      message: `Bulk operation '${data.action.replace(/_/g, " ")}' successfully completed for ${affectedCount} participants on ${data.dayDate}.`,
    };
  });

/** Staff only: Retrieve attendance audit history logs */
export const getAttendanceAuditHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { dayDate?: string; limit?: number }) => ({
    dayDate: input.dayDate ? String(input.dayDate).trim() : undefined,
    limit: input.limit ? Math.min(200, Math.max(1, Number(input.limit))) : 50,
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Unauthorized: Only administrators can view audit history.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: logs, error } = await supabaseAdmin
      .from("audit_logs")
      .select("id, actor_id, action, target_user, details, created_at")
      .in("action", [
        "attendance_manual_action",
        "attendance_bulk_action",
        "attendance_manual_marked",
        "attendance_confirmed_qr_scan",
        "attendance_confirmed_face_verification",
        "workshop_day_configured",
        "workshop_bulk_holidays_applied",
        "workshop_day_restored",
        "workshop_timeline_reset_only",
        "workshop_timeline_and_attendance_reset",
      ])
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (error) throw new Error(error.message);

    return {
      logs: logs ?? [],
    };
  });

/** Staff only: Retrieve workshop calendar configuration and overrides */
export const getWorkshopCalendarConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Unauthorized: Only administrators can view workshop calendar config.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: settings, error: sErr }, { data: days, error: dErr }] = await Promise.all([
      supabaseAdmin.from("workshop_settings").select("*").maybeSingle(),
      supabaseAdmin
        .from("workshop_days")
        .select("id, day_date, is_active, topic, day_number, created_at")
        .order("day_date", { ascending: true }),
    ]);

    if (sErr) throw new Error(sErr.message);
    if (dErr) throw new Error(dErr.message);

    return {
      settings,
      configuredDays: (days ?? []).map((d) => ({
        day_date: d.day_date,
        is_active: d.is_active,
        topic: d.topic,
        day_number: d.day_number,
      })),
    };
  });

/** Staff only: Configure a specific date as an active workshop day or holiday */
export const setWorkshopDayStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      dayDate: string;
      isActive: boolean;
      reason?: string;
      forceIfAttendanceExists?: boolean;
    }) => ({
      dayDate: String(input.dayDate).trim(),
      isActive: Boolean(input.isActive),
      reason: input.reason ? String(input.reason).trim() : undefined,
      forceIfAttendanceExists: Boolean(input.forceIfAttendanceExists),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Unauthorized: Only administrators can configure workshop days.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // If changing to holiday, check if attendance records already exist on this date
    if (!data.isActive) {
      const { count, error: countErr } = await supabaseAdmin
        .from("attendance")
        .select("id", { count: "exact", head: true })
        .eq("day_date", data.dayDate);

      if (countErr) throw new Error(countErr.message);

      if ((count ?? 0) > 0 && !data.forceIfAttendanceExists) {
        return {
          ok: false,
          hasExistingAttendance: true,
          attendanceCount: count ?? 0,
          message: `Warning: ${count} attendance record(s) exist on ${data.dayDate}. Converting this day to a holiday requires confirmation.`,
        };
      }
    }

    // Upsert into workshop_days
    const { error: upsertErr } = await supabaseAdmin.from("workshop_days").upsert(
      {
        day_date: data.dayDate,
        is_active: data.isActive,
        topic: data.isActive ? null : (data.reason || "Holiday / Non-Working Day"),
        day_number: 1, // Satisfies table check constraint (1-120)
      },
      { onConflict: "day_date" },
    );

    if (upsertErr) throw new Error(upsertErr.message);

    // Audit log
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "workshop_day_configured",
      details: {
        dayDate: data.dayDate,
        isActive: data.isActive,
        reason: data.reason ?? null,
        forced: data.forceIfAttendanceExists ?? false,
        timestamp: new Date().toISOString(),
      } as never,
    });

    return {
      ok: true,
      hasExistingAttendance: false,
      message: data.isActive
        ? `Restored ${data.dayDate} as an Active Workshop Day.`
        : `Marked ${data.dayDate} as a Holiday (${data.reason || "Non-Working Day"}).`,
    };
  });

/** Staff only: Configure weekend recurring holiday rules in bulk */
export const applyBulkWeekendHolidays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      weekendRule: "saturday" | "sunday" | "both";
      applyScope: "remaining" | "full" | "date_range";
      startDate?: string;
      endDate?: string;
      reason?: string;
      forceIfAttendanceExists?: boolean;
    }) => ({
      weekendRule: input.weekendRule,
      applyScope: input.applyScope,
      startDate: input.startDate ? String(input.startDate).trim() : undefined,
      endDate: input.endDate ? String(input.endDate).trim() : undefined,
      reason: input.reason ? String(input.reason).trim() : undefined,
      forceIfAttendanceExists: Boolean(input.forceIfAttendanceExists),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Unauthorized: Only administrators can configure weekend holidays.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { todayLocal, addDays } = await import("./attendance");
    const today = todayLocal();

    const { data: settings } = await supabaseAdmin.from("workshop_settings").select("*").maybeSingle();
    if (!settings) throw new Error("Workshop settings not found.");

    let start = settings.start_date;
    if (data.applyScope === "remaining") {
      start = today;
    } else if (data.applyScope === "date_range" && data.startDate) {
      start = data.startDate;
    }

    const end = data.endDate || addDays(settings.start_date, settings.duration_days * 2);

    const affectedDates: string[] = [];
    let cur = start;
    let limit = 0;
    while (cur <= end && limit < 365) {
      limit++;
      const dt = new Date(cur + "T00:00:00Z");
      const dayOfWeek = dt.getUTCDay(); // 0 = Sun, 6 = Sat
      const isSat = dayOfWeek === 6;
      const isSun = dayOfWeek === 0;

      if (
        (data.weekendRule === "saturday" && isSat) ||
        (data.weekendRule === "sunday" && isSun) ||
        (data.weekendRule === "both" && (isSat || isSun))
      ) {
        affectedDates.push(cur);
      }
      cur = addDays(cur, 1);
    }

    if (affectedDates.length === 0) {
      return { ok: true, count: 0, message: "No matching weekend dates found in the selected range." };
    }

    // Check existing attendance on affected dates
    if (!data.forceIfAttendanceExists) {
      const { data: attWithDates } = await supabaseAdmin
        .from("attendance")
        .select("day_date")
        .in("day_date", affectedDates);

      const datesWithAttendance = Array.from(new Set((attWithDates ?? []).map((a) => a.day_date)));
      if (datesWithAttendance.length > 0) {
        return {
          ok: false,
          hasExistingAttendance: true,
          datesWithAttendance,
          affectedDates,
          message: `Warning: ${datesWithAttendance.length} weekend date(s) already have recorded attendance: ${datesWithAttendance.join(", ")}. Please confirm to proceed.`,
        };
      }
    }

    const defaultReason =
      data.reason ||
      (data.weekendRule === "both"
        ? "Weekend Holiday (Sat/Sun)"
        : `${data.weekendRule === "saturday" ? "Saturday" : "Sunday"} Holiday`);

    const rows = affectedDates.map((d) => ({
      day_date: d,
      is_active: false,
      topic: defaultReason,
      day_number: 1,
    }));

    const { error: upsertErr } = await supabaseAdmin.from("workshop_days").upsert(rows, { onConflict: "day_date" });

    if (upsertErr) throw new Error(upsertErr.message);

    // Audit log
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "workshop_bulk_holidays_applied",
      details: {
        weekendRule: data.weekendRule,
        applyScope: data.applyScope,
        affectedCount: affectedDates.length,
        affectedDates,
        reason: defaultReason,
        timestamp: new Date().toISOString(),
      } as never,
    });

    return {
      ok: true,
      count: affectedDates.length,
      affectedDates,
      message: `Successfully marked ${affectedDates.length} weekend dates as holidays.`,
    };
  });

/** Staff only: Restore a holiday date back to an active workshop day */
export const restoreWorkshopDayActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { dayDate: string }) => ({
    dayDate: String(input.dayDate).trim(),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Unauthorized: Only administrators can restore workshop days.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("workshop_days")
      .update({ is_active: true, topic: null })
      .eq("day_date", data.dayDate);

    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "workshop_day_restored",
      details: { dayDate: data.dayDate, timestamp: new Date().toISOString() } as never,
    });

    return { ok: true, message: `Restored ${data.dayDate} as an Active Workshop Day.` };
  });

/** Staff only: Reset the workshop timeline starting from Day 1 */
export const resetWorkshopTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      newStartDate: string;
      clearAttendance: boolean;
      preserveHolidays?: boolean;
      reason?: string;
    }) => ({
      newStartDate: String(input.newStartDate).trim(),
      clearAttendance: Boolean(input.clearAttendance),
      preserveHolidays: input.preserveHolidays !== false,
      reason: input.reason ? String(input.reason).trim() : undefined,
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!staff) throw new Error("Unauthorized: Only administrators can reset the workshop timeline.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Update workshop_settings start_date
    const { error: setErr } = await supabaseAdmin
      .from("workshop_settings")
      .update({
        start_date: data.newStartDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (setErr) throw new Error(`Failed to update start date: ${setErr.message}`);

    // 2. If clearAttendance is true, clear attendance records
    let clearedCount = 0;
    if (data.clearAttendance) {
      const { count } = await supabaseAdmin.from("attendance").select("id", { count: "exact", head: true });
      clearedCount = count ?? 0;
      const { error: delAttErr } = await supabaseAdmin
        .from("attendance")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (delAttErr) throw new Error(`Failed to clear attendance: ${delAttErr.message}`);
    }

    // 3. If !preserveHolidays, clear workshop_days overrides
    if (!data.preserveHolidays) {
      await supabaseAdmin.from("workshop_days").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    }

    // 4. Audit Log
    const action = data.clearAttendance
      ? "workshop_timeline_and_attendance_reset"
      : "workshop_timeline_reset_only";

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action,
      details: {
        newStartDate: data.newStartDate,
        clearAttendance: data.clearAttendance,
        clearedAttendanceRecords: clearedCount,
        preserveHolidays: data.preserveHolidays,
        reason: data.reason || null,
        timestamp: new Date().toISOString(),
      } as never,
    });

    return {
      ok: true,
      clearedAttendance: data.clearAttendance,
      message: data.clearAttendance
        ? `Workshop timeline restarted at Day 1 (${data.newStartDate}) and ${clearedCount} attendance records cleared.`
        : `Workshop timeline restarted at Day 1 (${data.newStartDate}). All existing attendance records and holiday rules were preserved.`,
    };
  });



