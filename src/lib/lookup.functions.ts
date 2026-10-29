import { createServerFn } from "@tanstack/react-start";
import { normalizePhone, INDIAN_PHONE } from "./attendance";

export interface LookupProfileResult {
  found: boolean;
  message?: string;
  profile?: {
    id: string;
    fullName: string;
    participantCode: string;
    phone: string;
    email: string;
    verificationStatus: "pending" | "verified" | "rejected";
    createdAt: string;
    photoUrl?: string | null;
    photoPath?: string | null;
    role: "super_admin" | "attendance_admin" | "participant";
  };
}

/**
 * Server Function: Lookup profile details by phone number
 * Allows participants or admins to view their registration details by entering their phone number.
 */
export const lookupProfileByPhone = createServerFn({ method: "POST" })
  .validator((input: { phone: string }) => {
    const raw = String(input.phone ?? "").trim();
    const phone = normalizePhone(raw);
    return { phone };
  })
  .handler(async ({ data }): Promise<LookupProfileResult> => {
    const { phone } = data;
    if (!phone || !INDIAN_PHONE.test(phone)) {
      return { found: false, message: "Enter a valid 10-digit mobile number." };
    }

    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: rpcData, error: rpcErr } = await supabase.rpc("lookup_profile_by_phone", {
        _phone: phone,
      });
      if (!rpcErr && rpcData) {
        return rpcData as unknown as LookupProfileResult;
      }
    } catch {
      // Fallback to server admin client if RPC is not available
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Query profile by phone
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, participant_code, full_name, phone, email, photo_path, verification_status, created_at")
      .eq("phone", phone)
      .maybeSingle();

    if (error || !profile) {
      return { found: false, message: "No registration found for this mobile number." };
    }

    // Query user roles
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.id);

    const isSuper = (roles ?? []).some((r) => r.role === "super_admin");
    const isStaff = (roles ?? []).some((r) => r.role === "attendance_admin");
    const role = isSuper ? "super_admin" : isStaff ? "attendance_admin" : "participant";

    // Generate signed photo URL if photo exists
    let photoUrl: string | null = null;
    if (profile.photo_path) {
      const { data: signedData } = await supabaseAdmin.storage
        .from("photos")
        .createSignedUrl(profile.photo_path, 3600);
      if (signedData?.signedUrl) {
        photoUrl = signedData.signedUrl;
      }
    }

    return {
      found: true,
      profile: {
        id: profile.id,
        fullName: profile.full_name,
        participantCode: profile.participant_code,
        phone: profile.phone,
        email: profile.email,
        verificationStatus: profile.verification_status,
        createdAt: profile.created_at,
        photoUrl,
        photoPath: profile.photo_path,
        role,
      },
    };
  });

/**
 * Server Function: Upload participant registration photograph safely via service role
 * Solves RLS 403 AccessDenied errors when newly created participants upload their selfie.
 */
export const uploadRegistrationPhoto = createServerFn({ method: "POST" })
  .validator((input: { userId: string; photoBase64: string }) => {
    const userId = String(input.userId ?? "").trim();
    let photoBase64 = String(input.photoBase64 ?? "").trim();
    if (photoBase64.includes(",")) photoBase64 = photoBase64.split(",")[1]!;
    if (!userId) throw new Error("User ID is required.");
    if (!photoBase64) throw new Error("Photograph data is required.");
    return { userId, photoBase64 };
  })
  .handler(async ({ data }) => {
    const { userId, photoBase64 } = data;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { validateImageMagicBytes } = await import("./image-validation");

    const buffer = Buffer.from(photoBase64, "base64");
    const { ext, mime } = validateImageMagicBytes(buffer);

    const photoPath = `${userId}/profile_${Date.now()}.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("photos")
      .upload(photoPath, buffer, {
        contentType: mime,
        upsert: true,
      });

    if (upErr) {
      console.error("Storage upload failed:", upErr);
      throw new Error(`Failed to store photograph: ${upErr.message}`);
    }

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({ photo_path: photoPath })
      .eq("id", userId);

    if (profErr) {
      console.error("Profile update failed:", profErr);
      throw new Error(`Failed to link photo to profile: ${profErr.message}`);
    }

    return { ok: true, photoPath };
  });

/**
 * Server Function: Public participant registration
 * Uses Supabase Auth Admin API with email_confirm: true so that self-registered participants
 * can immediately sign in without getting locked out by unconfirmed dummy emails.
 */
export const publicRegisterParticipant = createServerFn({ method: "POST" })
  .validator(
    (input: {
      fullName: string;
      phone: string;
      email: string;
      password: string;
      photoBase64: string;
    }) => {
      const fullName = String(input.fullName ?? "").trim();
      const rawPhone = String(input.phone ?? "").trim();
      const phone = normalizePhone(rawPhone);
      const email = String(input.email ?? "").trim().toLowerCase();
      const password = String(input.password ?? "").trim();
      const photoBase64 = String(input.photoBase64 ?? "").trim();

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

      return { fullName, phone, email, password, photoBase64 };
    },
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { normalizeAppPassword, phoneToAuthEmail } = await import("./auth-helpers");
    const { validateImageMagicBytes } = await import("./image-validation");

    // 1. Check uniqueness
    const { data: duplicatePhone } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", data.phone)
      .maybeSingle();

    if (duplicatePhone) {
      throw new Error(`Mobile number ${data.phone} is already registered.`);
    }

    const { data: duplicateEmail } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", data.email)
      .maybeSingle();

    if (duplicateEmail) {
      throw new Error(`Email address ${data.email} is already registered.`);
    }

    // 2. Validate photo bytes
    let cleanBase64 = data.photoBase64;
    if (cleanBase64.includes(",")) cleanBase64 = cleanBase64.split(",")[1]!;
    const photoBuffer = Buffer.from(cleanBase64, "base64");
    if (photoBuffer.length > 5 * 1024 * 1024) {
      throw new Error("Photograph exceeds the 5 MB file size limit.");
    }
    const { ext, mime } = validateImageMagicBytes(photoBuffer);

    // 3. Create auth user with email_confirm: true
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
      },
    });

    if (authError || !authUser?.user) {
      throw new Error(`Registration failed: ${authError?.message || "Unknown auth error"}`);
    }

    const newUserId = authUser.user.id;
    let photoPath = "";

    try {
      // 4. Upload photo to photos bucket
      photoPath = `${newUserId}/profile_${Date.now()}.${ext}`;
      const { error: upErr } = await supabaseAdmin.storage
        .from("photos")
        .upload(photoPath, photoBuffer, {
          contentType: mime,
          upsert: true,
        });

      if (upErr) throw new Error(`Failed to store photograph: ${upErr.message}`);

      // 5. Update profile
      const { data: updatedProfile, error: profErr } = await supabaseAdmin
        .from("profiles")
        .update({
          photo_path: photoPath,
          verification_status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", newUserId)
        .select("id, participant_code, full_name, phone, email, verification_status")
        .single();

      if (profErr || !updatedProfile) {
        throw new Error(`Failed to finalize profile: ${profErr?.message || "Profile not found"}`);
      }

      // 6. Assign participant role
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: newUserId, role: "participant" }, { onConflict: "user_id,role" });

      // 7. Explicit consent log
      await supabaseAdmin.from("consent_records").insert({
        user_id: newUserId,
        consent_type: "privacy_policy_and_biometric_face_verification",
        agreed: true,
      });

      // 8. Audit log
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: newUserId,
        action: "participant_registered",
        target_user: newUserId,
        details: {
          full_name: data.fullName,
          phone: data.phone,
          email: data.email,
          participant_code: updatedProfile.participant_code,
          timestamp: new Date().toISOString(),
        } as never,
      });

      return {
        ok: true,
        user: {
          id: newUserId,
          participantCode: updatedProfile.participant_code,
          fullName: updatedProfile.full_name,
          phone: updatedProfile.phone,
          email: updatedProfile.email,
        },
      };
    } catch (err) {
      if (photoPath) {
        try {
          await supabaseAdmin.storage.from("photos").remove([photoPath]);
        } catch {}
      }
      try {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
      } catch {}
      throw err instanceof Error ? err : new Error(String(err));
    }
  });

