import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type Settings, type AttStatus, summarize, todayLocal } from "./attendance";
import type { ParticipantRow } from "./excel";
import { generateDefaultStudentPassword } from "./auth-helpers";
import { getAdminParticipantPasswords } from "./admin.functions";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    staleTime: 60_000, // 1 minute fresh
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
      ]);
      const r = (roles ?? []).map((x) => x.role);
      return {
        user: u.user,
        profile,
        roles: r,
        isSuper: r.includes("super_admin"),
        isStaff: r.includes("super_admin") || r.includes("attendance_admin"),
      };
    },
  });
}

export const DEFAULT_WORKSHOP_SETTINGS: Settings & { id: number } = {
  id: 1,
  name: "Event Management Workshop",
  start_date: todayLocal(),
  duration_days: 30,
  qr_validity_minutes: 15,
  require_selfie: false,
  low_attendance_threshold: 75,
};

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    staleTime: 5 * 60_000, // 5 minutes cache
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("workshop_settings").select("*").maybeSingle();
      if (error || !data) {
        return DEFAULT_WORKSHOP_SETTINGS;
      }
      return data as Settings & { id: number };
    },
    placeholderData: DEFAULT_WORKSHOP_SETTINGS,
  });
}

export function useMyAttendance() {
  const { data: me } = useMe();
  const { data: settings } = useSettings();

  return useQuery({
    queryKey: ["my_attendance", me?.user?.id],
    enabled: !!me?.user?.id && !!settings,
    staleTime: 4_000,
    refetchInterval: (query) => {
      const today = todayLocal();
      const records = query.state.data?.records;
      const isPresentToday = records?.some((r) => r.day_date === today && r.status === "present");
      return isPresentToday ? 30_000 : 4_000;
    },
    gcTime: 5 * 60_000,
    queryFn: async () => {
      if (!me?.user?.id || !settings) return null;
      const [{ data, error }, { data: daysData }] = await Promise.all([
        supabase
          .from("attendance")
          .select("id, user_id, day_date, status, method, checked_in_at, remarks, morning_status, afternoon_status")
          .eq("user_id", me.user.id)
          .order("day_date", { ascending: false }),
        supabase
          .from("workshop_days")
          .select("id, day_date, is_active, topic, day_number"),
      ]);

      if (error) throw error;
      const records = (data ?? []).map((r) => ({
        ...r,
        status: r.status as AttStatus,
      }));
      const summary = summarize(settings, records, todayLocal(), daysData ?? []);
      return { records, summary, configuredDays: daysData ?? [] };
    },
  });
}

export function useAdminData() {
  const { data: me } = useMe();
  const { data: settings } = useSettings();

  return useQuery({
    queryKey: ["admin_data"],
    enabled: !!me?.isStaff && !!settings,
    staleTime: 30_000, // 30 seconds buffer
    gcTime: 5 * 60_000,
    refetchInterval: 30_000, // Poll every 30s instead of 15s to reduce load
    queryFn: async () => {
      if (!settings) return null;
      const today = todayLocal();

      const [profilesRes, attendanceRes, qrRes, rolesRes, auditRes, daysRes, passwordsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, participant_code, full_name, phone, email, photo_path, verification_status, created_at")
          .order("participant_code", { ascending: true }),
        supabase
          .from("attendance")
          .select("id, user_id, day_date, status, method, checked_in_at, remarks, morning_status, afternoon_status"),
        supabase
          .from("qr_sessions")
          .select("id, day_date, token, short_code, expires_at, revoked, created_at, participant_id")
          .eq("day_date", today)
          .order("created_at", { ascending: false }),
        supabase
          .from("user_roles")
          .select("user_id, role"),
        supabase
          .from("audit_logs")
          .select("id, actor_id, action, target_user, details, created_at")
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("workshop_days")
          .select("id, day_date, is_active, topic, day_number")
          .order("day_date", { ascending: true }),
        getAdminParticipantPasswords().catch((err) => {
          console.warn("Failed to load participant passwords from server function:", err);
          return {} as Record<string, string>;
        }),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      const profiles = profilesRes.data ?? [];
      const configuredWorkshopDays = daysRes?.data ?? [];
      const attendance = (attendanceRes.data ?? []).map((a) => ({
        ...a,
        status: a.status as AttStatus,
      }));
      const qrSessions = qrRes.data ?? [];
      const userRoles = rolesRes.data ?? [];
      const auditLogs = auditRes.data ?? [];

      // Map roles by user_id
      const rolesByUser = new Map<string, string[]>();
      userRoles.forEach((ur) => {
        const arr = rolesByUser.get(ur.user_id) || [];
        arr.push(ur.role);
        rolesByUser.set(ur.user_id, arr);
      });

      // Group attendance by user_id
      const attByUser = new Map<string, typeof attendance>();
      attendance.forEach((a) => {
        const list = attByUser.get(a.user_id) || [];
        list.push(a);
        attByUser.set(a.user_id, list);
      });

      // Assemble ParticipantRow with precomputed summaries
      const participantRows: ParticipantRow[] = profiles.map((p) => {
        const userAtt = attByUser.get(p.id) || [];
        const summary = summarize(settings, userAtt, today, configuredWorkshopDays);
        const rawAttendance: ParticipantRow["rawAttendance"] = {};
        userAtt.forEach((a) => {
          rawAttendance[a.day_date] = {
            status: a.status,
            checked_in_at: a.checked_in_at,
            method: a.method,
            remarks: a.remarks,
            morning_status: a.morning_status ?? null,
            afternoon_status: a.afternoon_status ?? null,
          };
        });
        const plainPassword =
          (passwordsRes && passwordsRes[p.id]) ||
          generateDefaultStudentPassword(p.full_name, p.phone);

        return {
          id: p.id,
          participant_code: p.participant_code,
          full_name: p.full_name,
          phone: p.phone,
          email: p.email,
          password: plainPassword,
          photo_path: p.photo_path,
          verification_status: p.verification_status,
          summary,
          rawAttendance,
        };
      });

      // Active QR for today
      const activeQr = qrSessions.find((s) => !s.revoked && new Date(s.expires_at).getTime() > Date.now());

      return {
        profiles,
        participantRows,
        passwords: passwordsRes,
        attendance,
        qrSessions,
        activeQr,
        rolesByUser,
        auditLogs,
        configuredWorkshopDays,
      };
    },
  });
}

/** Staff only hook to fetch or refresh participant passwords map */
export function useAdminParticipantPasswords() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["admin_participant_passwords"],
    enabled: Boolean(me?.isStaff),
    staleTime: 30_000,
    queryFn: () => getAdminParticipantPasswords(),
  });
}

// In-memory cache for signed URLs to eliminate duplicate network requests (valid for 50 mins)
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function signedUrls(bucket: "photos" | "selfies", paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (!list.length) return {} as Record<string, string>;

  const now = Date.now();
  const out: Record<string, string> = {};
  const pathsToFetch: string[] = [];

  list.forEach((path) => {
    const cacheKey = `${bucket}:${path}`;
    const cached = signedUrlCache.get(cacheKey);
    if (cached && cached.expiresAt > now + 60_000) {
      out[path] = cached.url;
    } else {
      pathsToFetch.push(path);
    }
  });

  if (!pathsToFetch.length) {
    return out;
  }

  const { data } = await supabase.storage.from(bucket).createSignedUrls(pathsToFetch, 3600);
  data?.forEach((d) => {
    if (d.path && d.signedUrl) {
      out[d.path] = d.signedUrl;
      signedUrlCache.set(`${bucket}:${d.path}`, {
        url: d.signedUrl,
        expiresAt: now + 50 * 60 * 1000,
      });
    }
  });

  return out;
}
