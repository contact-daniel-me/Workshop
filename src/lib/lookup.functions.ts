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
        role,
      },
    };
  });

