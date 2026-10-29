import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type Settings, type AttStatus, summarize, todayLocal } from "./attendance";
import type { ParticipantRow } from "./excel";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
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
    queryFn: async () => {
      if (!me?.user?.id || !settings) return null;
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("user_id", me.user.id)
        .order("day_date", { ascending: false });

      if (error) throw error;
      const records = (data ?? []).map((r) => ({
        ...r,
        status: r.status as AttStatus,
      }));
      const summary = summarize(settings, records, todayLocal());
      return { records, summary };
    },
  });
}

export function useAdminData() {
  const { data: me } = useMe();
  const { data: settings } = useSettings();

  return useQuery({
    queryKey: ["admin_data"],
    enabled: !!me?.isStaff && !!settings,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!settings) return null;
      const today = todayLocal();

      const [profilesRes, attendanceRes, qrRes, rolesRes, auditRes] = await Promise.all([
        supabase.from("profiles").select("*").order("participant_code", { ascending: true }),
        supabase.from("attendance").select("*"),
        supabase.from("qr_sessions").select("*").eq("day_date", today).order("created_at", { ascending: false }),
        supabase.from("user_roles").select("*"),
        supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(60),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      const profiles = profilesRes.data ?? [];
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
        const summary = summarize(settings, userAtt, today);
        const rawAttendance: ParticipantRow["rawAttendance"] = {};
        userAtt.forEach((a) => {
          rawAttendance[a.day_date] = {
            status: a.status,
            checked_in_at: a.checked_in_at,
            method: a.method,
            remarks: a.remarks,
          };
        });
        return {
          id: p.id,
          participant_code: p.participant_code,
          full_name: p.full_name,
          phone: p.phone,
          email: p.email,
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
        attendance,
        qrSessions,
        activeQr,
        rolesByUser,
        auditLogs,
      };
    },
  });
}

export async function signedUrls(bucket: "photos" | "selfies", paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (!list.length) return {} as Record<string, string>;
  const { data } = await supabase.storage.from(bucket).createSignedUrls(list, 3600);
  const out: Record<string, string> = {};
  data?.forEach((d) => d.path && d.signedUrl && (out[d.path] = d.signedUrl));
  return out;
}
