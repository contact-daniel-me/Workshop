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

