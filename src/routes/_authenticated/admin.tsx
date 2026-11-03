import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import QRCode from "qrcode";
import {
  useMe,
  useSettings,
  useAdminData,
  signedUrls,
} from "@/lib/use-me";
import { todayLocal, workshopDays, formatIstTimestamp, formatIstDate, extractExitTimestamp } from "@/lib/attendance";
import {
  generate30DayWorkbook,
  generateDailyReportWorkbook,
  generateDailyAttendanceExcel,
  generateDateRangeAttendanceExcel,
  downloadExcelFile,
  type ParticipantRow,
} from "@/lib/excel";
import {
  generateQr,
} from "@/lib/checkin.functions";
import {
  markAttendanceManual,
  verifyParticipantRegistration,
  reviewSelfieAttendance,
  updateWorkshopSettings,
  revokeQr,
} from "@/lib/admin.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ClickableAvatar, ProfilePhotoLightbox } from "@/components/ui/profile-photo-lightbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/app/status";
import {
  Users,
  User,
  QrCode,
  ShieldCheck,
  FileSpreadsheet,
  Settings as SettingsIcon,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RotateCw,
  TrendingUp,
  BarChart3,
  Calendar,
  Eye,
  Edit,
  History,
  ShieldAlert,
  UserPlus,
  Camera,
  KeyRound,
  Trash2,
  ScanFace,
  IdCard,
  CalendarCheck,
  FileDown,
  Maximize2,
  Copy,
  Download,
  FileText,
} from "lucide-react";
import { AdminQrScannerTab } from "@/components/admin/AdminQrScannerTab";
import { AdminAttendanceManagementTab } from "@/components/admin/AdminAttendanceManagementTab";

// Code-split heavy admin action dialogs to shrink critical admin route bundle
const RegisterParticipantDialog = lazy(() =>
  import("@/components/admin/RegisterParticipantDialog").then((m) => ({
    default: m.RegisterParticipantDialog,
  }))
);
const BulkParticipantRegistrationDialog = lazy(() =>
  import("@/components/admin/BulkParticipantRegistrationDialog").then((m) => ({
    default: m.BulkParticipantRegistrationDialog,
  }))
);
const AdminQrScannerDialog = lazy(() =>
  import("@/components/admin/AdminQrScannerDialog").then((m) => ({
    default: m.AdminQrScannerDialog,
  }))
);
const AdminFaceRecognitionDialog = lazy(() =>
  import("@/components/admin/AdminFaceRecognitionDialog").then((m) => ({
    default: m.AdminFaceRecognitionDialog,
  }))
);
const ChangeParticipantPasswordDialog = lazy(() =>
  import("@/components/admin/ChangeParticipantPasswordDialog").then((m) => ({
    default: m.ChangeParticipantPasswordDialog,
  }))
);
const DeleteParticipantDialog = lazy(() =>
  import("@/components/admin/DeleteParticipantDialog").then((m) => ({
    default: m.DeleteParticipantDialog,
  }))
);
const AdminDigitalIdDialog = lazy(() =>
  import("@/components/id-card/AdminDigitalIdDialog").then((m) => ({
    default: m.AdminDigitalIdDialog,
  }))
);
const EditParticipantDialog = lazy(() =>
  import("@/components/admin/EditParticipantDialog").then((m) => ({
    default: m.EditParticipantDialog,
  }))
);
import type { ParticipantEditableData } from "@/components/admin/EditParticipantDialog";
import { PhotoCaptureInput } from "@/components/auth/PhotoCaptureInput";
import { fileToBase64 } from "@/lib/image-validation";
import { uploadRegistrationPhoto } from "@/lib/lookup.functions";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AdminOverviewCharts } from "@/components/admin/AdminOverviewCharts";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Event Management Portal" }],
  }),
  component: AdminPage,
});

function AdminPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useMe();
  const { data: settings } = useSettings();
  const { data: adminData, isLoading: dataLoading, refetch } = useAdminData();

  // Active Tab & Verification Console Mode (Default to Attendance Management so camera never auto-starts and primary workflow is immediately accessible)
  const [activeTab, setActiveTab] = useState("attendance_management");
  const [verificationMode, setVerificationMode] = useState<"qr" | "face">("qr");
  const [cameraTrigger, setCameraTrigger] = useState(0);
  const [qrScannerDialogOpen, setQrScannerDialogOpen] = useState(false);
  const [faceRecognitionDialogOpen, setFaceRecognitionDialogOpen] = useState(false);

  // QR Display State
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrDestinationUrl, setQrDestinationUrl] = useState<string>("");
  const [fullscreenQrOpen, setFullscreenQrOpen] = useState(false);
  const [timeLeftSec, setTimeLeftSec] = useState<number>(0);
  const [generatingQr, setGeneratingQr] = useState(false);

  // Attendance Reports & Exports State
  const [reportSingleDate, setReportSingleDate] = useState(todayLocal());
  const [reportStartDate, setReportStartDate] = useState(todayLocal());
  const [reportEndDate, setReportEndDate] = useState(todayLocal());
  const [reportSearch, setReportSearch] = useState("");
  const [reportDateScope, setReportDateScope] = useState<"today" | "specific" | "range" | "all">("today");
  const [reportEntryFilter, setReportEntryFilter] = useState<"all" | "present" | "missing">("all");
  const [reportExitFilter, setReportExitFilter] = useState<"all" | "present" | "missing">("all");
  const [reportMethodFilter, setReportMethodFilter] = useState<"all" | "face" | "qr" | "manual">("all");

  // Participant Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [lowAttendanceOnly, setLowAttendanceOnly] = useState(false);

  // Modals State
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<ParticipantRow | null>(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualTargetUser, setManualTargetUser] = useState<ParticipantRow | null>(null);
  const [manualDate, setManualDate] = useState(todayLocal());
  const [manualStatus, setManualStatus] = useState<"present" | "absent" | "excused">("present");
  const [manualRemarks, setManualRemarks] = useState("");
  const [manualBusy, setManualBusy] = useState(false);

  // Settings Form State
  const [settingsForm, setSettingsForm] = useState({
    name: "",
    startDate: "",
    durationDays: 30,
    qrValidityMinutes: 15,
    requireSelfie: false,
    lowAttendanceThreshold: 75,
  });
  const [settingsBusy, setSettingsBusy] = useState(false);

  // Signed photos cache
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  // Daily Attendance Management View State (Requirement 7)
  const [dailyDate, setDailyDate] = useState<string>(todayLocal());
  const [dailySearch, setDailySearch] = useState<string>("");
  const [dailyStatusFilter, setDailyStatusFilter] = useState<string>("all");
  const [viewingRecord, setViewingRecord] = useState<{
    profile: { id: string; full_name: string; participant_code: string; email: string; phone: string; photo_path: string | null };
    attendance?: { id: string; status: string; checked_in_at: string; method: string; marked_by: string | null; remarks?: string | null };
  } | null>(null);

  // Participant Management Action Dialogs (Change Password & Delete Participant)
  const [passwordTargetUser, setPasswordTargetUser] = useState<{
    id: string;
    full_name: string;
    participant_code: string;
    email?: string;
    phone?: string;
    verification_status?: string;
    photo_url?: string | null;
  } | null>(null);
  const [deleteTargetUser, setDeleteTargetUser] = useState<{ id: string; full_name: string; participant_code: string; email?: string; phone?: string; photoUrl?: string | null } | null>(null);
  const [digitalIdTarget, setDigitalIdTarget] = useState<ParticipantRow | null>(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);
  const [downloadingBulkPdf, setDownloadingBulkPdf] = useState(false);
  const [esdpBulkDialogOpen, setEsdpBulkDialogOpen] = useState(false);
  const [editTargetUser, setEditTargetUser] = useState<ParticipantEditableData | null>(null);

  const handleDownloadParticipantPdf = async (p: {
    id: string;
    full_name: string;
    participant_code: string;
    email: string;
    phone: string;
    verification_status: string;
  }) => {
    setDownloadingPdfId(p.id);
    try {
      const { downloadParticipantCredentialsPdf } = await import("@/lib/credential-pdf");
      const photoPath = adminData?.profiles.find((x) => x.id === p.id)?.photo_path ?? "";
      const photoUrl = p.id ? photoUrls[photoPath] : undefined;
      await downloadParticipantCredentialsPdf({
        fullName: p.full_name,
        participantCode: p.participant_code,
        email: p.email,
        phone: p.phone,
        verificationStatus: p.verification_status,
        photoUrl: photoUrl,
        portalUrl: typeof window !== "undefined" ? `${window.location.origin}/auth` : "/auth",
        workshopName: "Event Management Portal",
      });
      toast.success(`Credentials PDF pass for ${p.full_name} downloaded successfully!`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to generate PDF pass.");
    } finally {
      setDownloadingPdfId(null);
    }
  };
  const [adminPhotoModalOpen, setAdminPhotoModalOpen] = useState(false);
  const [adminPhotoTargetUser, setAdminPhotoTargetUser] = useState<{ id: string; full_name: string } | null>(null);
  const [adminSelectedPhoto, setAdminSelectedPhoto] = useState<File | null>(null);
  const [adminUploadingPhoto, setAdminUploadingPhoto] = useState(false);

  const handleAdminSavePhoto = async () => {
    if (!adminSelectedPhoto || !adminPhotoTargetUser?.id) return;
    setAdminUploadingPhoto(true);
    try {
      const base64 = await fileToBase64(adminSelectedPhoto);
      await uploadRegistrationPhoto({
        data: {
          userId: adminPhotoTargetUser.id,
          photoBase64: base64,
        },
      });
      await refetch();
      toast.success(`Profile photograph for ${adminPhotoTargetUser.full_name} updated successfully!`);
      setAdminPhotoModalOpen(false);
      setAdminSelectedPhoto(null);
      setAdminPhotoTargetUser(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to upload photo.");
    } finally {
      setAdminUploadingPhoto(false);
    }
  };

  // Sync settings into form
  useEffect(() => {
    if (settings) {
      setSettingsForm({
        name: settings.name,
        startDate: settings.start_date,
        durationDays: settings.duration_days,
        qrValidityMinutes: settings.qr_validity_minutes,
        requireSelfie: settings.require_selfie,
        lowAttendanceThreshold: settings.low_attendance_threshold,
      });
    }
  }, [settings]);

  // Load photos for participants with path-signature memoization to prevent polling thrash
  const photoPathsKey = useMemo(() => {
    return (adminData?.profiles ?? [])
      .map((p) => p.photo_path)
      .filter(Boolean)
      .sort()
      .join(",");
  }, [adminData?.profiles]);

  useEffect(() => {
    if (photoPathsKey) {
      const paths = photoPathsKey.split(",");
      void signedUrls("photos", paths).then(setPhotoUrls);
    }
  }, [photoPathsKey]);

  // Handle QR code generation for visual display (encodes full destination URL for standard camera scanning)
  useEffect(() => {
    const active = adminData?.activeQr;
    if (active) {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const destinationUrl = `${origin}/dashboard?token=${encodeURIComponent(active.token)}&code=${encodeURIComponent(active.short_code)}`;
      setQrDestinationUrl(destinationUrl);

      void QRCode.toDataURL(destinationUrl, {
        width: 420,
        margin: 2,
        color: { dark: "#0f172a", light: "#ffffff" },
      }).then(setQrDataUrl);

      const exp = new Date(active.expires_at).getTime();
      const diff = Math.max(0, Math.floor((exp - Date.now()) / 1000));
      setTimeLeftSec(diff);

      const interval = window.setInterval(() => {
        const remaining = Math.max(0, Math.floor((exp - Date.now()) / 1000));
        setTimeLeftSec(remaining);
        if (remaining <= 0) clearInterval(interval);
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setQrDataUrl(null);
      setQrDestinationUrl("");
      setTimeLeftSec(0);
    }
  }, [adminData?.activeQr]);

  const today = todayLocal();
  const allDays = useMemo(() => {
    return settings ? workshopDays(settings) : [];
  }, [settings]);

  // KPI Calculations
  const totalRegistered = adminData?.profiles.length ?? 0;
  const verifiedCount = adminData?.profiles.filter((p) => p.verification_status === "verified").length ?? 0;
  const todayAttendance = adminData?.attendance.filter((a) => a.day_date === today) ?? [];
  const todayEntryCount = todayAttendance.filter((a) => a.morning_status === "present" || (a.status === "present" && !a.morning_status)).length;
  const todayExitCount = todayAttendance.filter((a) => a.afternoon_status === "present").length;
  const todayCompleteCount = todayAttendance.filter((a) => (a.morning_status === "present" || a.status === "present") && a.afternoon_status === "present").length;
  const missingEntryCount = Math.max(0, totalRegistered - todayEntryCount);
  const missingExitCount = Math.max(0, totalRegistered - todayExitCount);
  const presentToday = todayAttendance.filter((a) => a.status === "present").length;
  const absentToday = totalRegistered - todayAttendance.length;
  const attendanceRateToday = totalRegistered ? Math.round((presentToday / totalRegistered) * 100) : 0;
  const avgAttendance = totalRegistered
    ? Math.round(
        ((adminData?.participantRows ?? []).reduce((acc, p) => acc + p.summary.currentPct, 0) /
          totalRegistered) *
          100,
      ) / 100
    : 0;
  const pendingRegistrations = adminData?.profiles.filter((p) => p.verification_status === "pending").length ?? 0;
  const pendingSelfies = adminData?.attendance.filter((a) => a.status === "pending").length ?? 0;

  // Chart Data: Daily Trend
  const dailyTrendData = useMemo(() => {
    if (!adminData || !settings) return [];
    const attByDay = new Map<string, { present: number; absent: number; pending: number }>();
    allDays.forEach((day) => attByDay.set(day, { present: 0, absent: 0, pending: 0 }));

    adminData.attendance.forEach((a) => {
      const stats = attByDay.get(a.day_date);
      if (stats) {
        if (a.status === "present") stats.present++;
        else if (a.status === "pending") stats.pending++;
        else if (a.status === "absent" || a.status === "rejected") stats.absent++;
      }
    });

    return allDays.map((day, idx) => {
      const stats = attByDay.get(day)!;
      const isPastOrToday = day <= today;
      return {
        day: `Day ${idx + 1}`,
        date: day,
        present: stats.present,
        absent: isPastOrToday ? Math.max(0, totalRegistered - stats.present - stats.pending) : 0,
        pending: stats.pending,
      };
    });
  }, [adminData, settings, allDays, today, totalRegistered]);

  // Chart Data: Attendance Distribution
  const distributionData = useMemo(() => {
    if (!adminData) return [];
    let high = 0; // 90-100%
    let medium = 0; // 75-89%
    let low = 0; // 50-74%
    let critical = 0; // <50%

    adminData.participantRows.forEach((p) => {
      const pct = p.summary.currentPct;
      if (pct >= 90) high++;
      else if (pct >= 75) medium++;
      else if (pct >= 50) low++;
      else critical++;
    });

    return [
      { range: "90-100%", count: high, fill: "#16a34a" },
      { range: "75-89%", count: medium, fill: "#2563eb" },
      { range: "50-74%", count: low, fill: "#eab308" },
      { range: "<50%", count: critical, fill: "#dc2626" },
    ];
  }, [adminData]);

  // Filtered Participants Table
  const filteredParticipants = useMemo(() => {
    if (!adminData?.participantRows) return [];
    return adminData.participantRows.filter((p) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        p.full_name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.phone.includes(q) ||
        p.participant_code.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === "all" || p.verification_status === statusFilter;

      const matchesLowAtt =
        !lowAttendanceOnly ||
        (settings && p.summary.currentPct < settings.low_attendance_threshold);

      return matchesSearch && matchesStatus && matchesLowAtt;
    });
  }, [adminData?.participantRows, searchQuery, statusFilter, lowAttendanceOnly, settings]);

  // Daily Attendance Filtered Rows for Selected Date (Requirement 7)
  const dailyAttendanceStats = useMemo(() => {
    if (!adminData) return { presentCount: 0, notMarkedCount: 0, totalApproved: 0, qrCount: 0, faceCount: 0, manualCount: 0, rate: 0, rows: [] };

    const approvedProfiles = adminData.profiles.filter((p) => p.verification_status === "verified");
    const attOnDate = adminData.attendance.filter((a) => a.day_date === dailyDate);
    const attByUserId = new Map(attOnDate.map((a) => [a.user_id, a]));

    const presentCount = attOnDate.filter((a) => a.status === "present").length;
    const qrCount = attOnDate.filter((a) => a.status === "present" && (a.method === "qr" || a.method === "qr_scan")).length;
    const faceCount = attOnDate.filter((a) => a.status === "present" && (a.method === "qr_selfie" || a.method === "face" || a.method === "face_verification")).length;
    const manualCount = attOnDate.filter((a) => a.status === "present" && a.method === "manual").length;

    const totalApproved = approvedProfiles.length;
    const notMarkedCount = Math.max(0, totalApproved - presentCount);
    const rate = totalApproved ? Math.round((presentCount / totalApproved) * 100) : 0;

    const rows = approvedProfiles
      .map((prof) => {
        const att = attByUserId.get(prof.id);
        return {
          profile: prof,
          attendance: att,
          status: att?.status ?? "not_marked",
        };
      })
      .filter((r) => {
        const q = dailySearch.toLowerCase().trim();
        const matchesSearch =
          !q ||
          r.profile.full_name.toLowerCase().includes(q) ||
          r.profile.email.toLowerCase().includes(q) ||
          r.profile.phone.includes(q) ||
          r.profile.participant_code.toLowerCase().includes(q);

        const isQr = r.attendance?.status === "present" && (r.attendance?.method === "qr" || r.attendance?.method === "qr_scan");
        const isFace = r.attendance?.status === "present" && (r.attendance?.method === "qr_selfie" || r.attendance?.method === "face" || r.attendance?.method === "face_verification");
        const isManual = r.attendance?.status === "present" && r.attendance?.method === "manual";

        const matchesStatus =
          dailyStatusFilter === "all" ||
          (dailyStatusFilter === "present" && r.status === "present") ||
          (dailyStatusFilter === "qr" && isQr) ||
          (dailyStatusFilter === "face" && isFace) ||
          (dailyStatusFilter === "manual" && isManual) ||
          (dailyStatusFilter === "not_marked" && r.status === "not_marked") ||
          (dailyStatusFilter === "pending" && r.status === "pending");

        return matchesSearch && matchesStatus;
      });

    return {
      presentCount,
      notMarkedCount,
      totalApproved,
      qrCount,
      faceCount,
      manualCount,
      rate,
      rows,
    };
  }, [adminData, dailyDate, dailySearch, dailyStatusFilter]);

  // Attendance Reports Filtered Data for Interactive Reports Tab
  const reportAttendanceRecords = useMemo(() => {
    if (!adminData) return [];
    const profilesMap = new Map(adminData.profiles.map((p) => [p.id, p]));

    return adminData.attendance
      .filter((a) => {
        // Date scope filter
        if (reportDateScope === "today" && a.day_date !== today) return false;
        if (reportDateScope === "specific" && a.day_date !== reportSingleDate) return false;
        if (reportDateScope === "range" && (a.day_date < reportStartDate || a.day_date > reportEndDate)) return false;

        const profile = profilesMap.get(a.user_id);
        const name = profile?.full_name?.toLowerCase() ?? "";
        const code = profile?.participant_code?.toLowerCase() ?? "";

        // Text search filter
        if (reportSearch.trim()) {
          const q = reportSearch.trim().toLowerCase();
          if (!name.includes(q) && !code.includes(q)) return false;
        }

        const isEntryPresent = a.morning_status === "present" || (a.status === "present" && !a.morning_status);
        const isExitPresent = a.afternoon_status === "present";

        // Entry status filter
        if (reportEntryFilter === "present" && !isEntryPresent) return false;
        if (reportEntryFilter === "missing" && isEntryPresent) return false;

        // Exit status filter
        if (reportExitFilter === "present" && !isExitPresent) return false;
        if (reportExitFilter === "missing" && isExitPresent) return false;

        // Method filter
        if (reportMethodFilter === "face" && a.method !== "qr_selfie" && a.method !== "face") return false;
        if (reportMethodFilter === "qr" && a.method !== "qr" && a.method !== "qr_scan") return false;
        if (reportMethodFilter === "manual" && a.method !== "manual") return false;

        return true;
      })
      .map((a) => {
        const profile = profilesMap.get(a.user_id);
        const isEntry = a.morning_status === "present" || (a.status === "present" && !a.morning_status);
        const isExit = a.afternoon_status === "present";
        const entryTime = a.checked_in_at ? formatIstTimestamp(a.checked_in_at) : "—";
        const exitTime = extractExitTimestamp(a) || "—";
        const overall = isEntry && isExit ? "Complete" : isEntry ? "Entry Only" : isExit ? "Exit Only" : "Absent";

        return {
          id: a.id,
          date: a.day_date,
          userId: a.user_id,
          participantCode: profile?.participant_code || "—",
          fullName: profile?.full_name || "Unknown",
          isEntry,
          entryTime,
          isExit,
          exitTime,
          method:
            a.method === "qr_selfie" || a.method === "face"
              ? "Face Verified"
              : a.method === "qr" || a.method === "qr_scan"
              ? "QR Scan"
              : a.method === "manual"
              ? "Manual Override"
              : a.method || "—",
          overall,
        };
      });
  }, [
    adminData,
    today,
    reportDateScope,
    reportSingleDate,
    reportStartDate,
    reportEndDate,
    reportSearch,
    reportEntryFilter,
    reportExitFilter,
    reportMethodFilter,
  ]);

  // Loading & Access Checks (placed strictly AFTER all hooks to adhere to React Rules of Hooks)
  if (meLoading || dataLoading) {
    return (
      <div className="container mx-auto flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RotateCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">Loading administrator portal…</p>
        </div>
      </div>
    );
  }

  if (!me?.isStaff) {
    return (
      <div className="container mx-auto max-w-lg px-4 py-20 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="mt-4 font-display text-2xl font-bold">Unauthorized Access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You must have administrator privileges to view this portal.
        </p>
        <Button className="mt-6" onClick={() => navigate({ to: "/dashboard" })}>
          Return to Participant Dashboard
        </Button>
      </div>
    );
  }

  // Handlers
  const handleGenerateQr = async () => {
    setGeneratingQr(true);
    try {
      await generateQr();
      await refetch();
      toast.success("Fresh rotating QR generated for today's session.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to generate QR code.");
    } finally {
      setGeneratingQr(false);
    }
  };

  const handleRevokeQr = async (sessionId: string) => {
    try {
      await revokeQr({ data: { sessionId } });
      await refetch();
      toast.info("Active QR code revoked.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke QR.");
    }
  };

  const handleCopyQrUrl = async () => {
    if (!qrDestinationUrl) {
      toast.error("No active QR code destination URL to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(qrDestinationUrl);
      toast.success("Projector QR destination URL copied to clipboard!");
    } catch {
      toast.error("Failed to copy URL to clipboard.");
    }
  };

  const handleDownloadQrPng = () => {
    if (!qrDataUrl) {
      toast.error("No active QR image to download.");
      return;
    }
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `ESDP_Projector_QR_${today}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("Projector QR image downloaded.");
  };

  const handleManualSubmit = async () => {
    if (!manualTargetUser) return;
    setManualBusy(true);
    try {
      await markAttendanceManual({
        data: {
          userId: manualTargetUser.id,
          dayDate: manualDate,
          status: manualStatus,
          remarks: manualRemarks,
        },
      });
      toast.success(`Marked ${manualTargetUser.full_name} as ${manualStatus.toUpperCase()}`);
      await refetch();
      setManualModalOpen(false);
      setManualRemarks("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to mark attendance.");
    } finally {
      setManualBusy(false);
    }
  };

  const handleVerifyRegistration = async (userId: string, status: "verified" | "rejected") => {
    let reason: string | undefined = undefined;
    if (status === "rejected") {
      const inputReason = window.prompt("Mandatory reason for rejecting this participant:");
      if (inputReason === null) return;
      if (inputReason.trim().length < 3) {
        toast.error("A reason of at least 3 characters is required to reject a participant.");
        return;
      }
      reason = inputReason.trim();
    }
    try {
      await verifyParticipantRegistration({ data: { userId, status, reason } });
      toast.success(status === "verified" ? "Participant approved successfully!" : "Participant rejected.");
      await refetch();
      if (selectedParticipant && selectedParticipant.id === userId) {
        setSelectedParticipant({
          ...selectedParticipant,
          verification_status: status,
        });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update verification.");
    }
  };

  const handleReviewSelfie = async (attendanceId: string, approved: boolean) => {
    const reason = window.prompt(
      approved ? "Optional approval note:" : "Reason for rejection (required):",
      approved ? "Identity verified visually against registration photo." : "Face did not match registration photo.",
    );
    if (reason === null) return;
    try {
      await reviewSelfieAttendance({
        data: {
          attendanceId,
          approved,
          remarks: reason || (approved ? "Approved" : "Rejected"),
        },
      });
      toast.success(approved ? "Selfie approved (marked present)." : "Selfie rejected.");
      await refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to review selfie.");
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsBusy(true);
    try {
      await updateWorkshopSettings({ data: settingsForm });
      toast.success("Workshop settings updated successfully.");
      await qc.invalidateQueries({ queryKey: ["settings"] });
      await refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update settings.");
    } finally {
      setSettingsBusy(false);
    }
  };

  const handleExport30Day = async () => {
    if (!settings || !adminData?.participantRows) return;
    try {
      const bytes = await generate30DayWorkbook(settings, adminData.participantRows);
      downloadExcelFile(bytes, `${settings.name.replace(/\s+/g, "_")}_30_Day_Master_Attendance.xlsx`);
      toast.success("30-Day Master Attendance workbook downloaded.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to export Excel.");
    }
  };

  const handleExportDaily = async () => {
    if (!adminData) return;
    try {
      const dayRecords = adminData.attendance
        .filter((a) => a.day_date === today)
        .map((a) => {
          const profile = adminData.profiles.find((p) => p.id === a.user_id);
          return {
            participant_code: profile?.participant_code ?? "Unknown",
            full_name: profile?.full_name ?? "Unknown",
            phone: profile?.phone ?? "",
            status: a.status,
            checked_in_at: a.checked_in_at,
            method: a.method,
            verified_by: a.marked_by ? "Staff" : "QR Token",
            remarks: a.remarks,
          };
        });

      const bytes = await generateDailyReportWorkbook(today, dayRecords);
      downloadExcelFile(bytes, `Daily_Attendance_${today}.xlsx`);
      toast.success(`Daily report for ${today} downloaded.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to export daily report.");
    }
  };

  const handleDownloadSingleDayAttendanceExcel = async (targetDate: string = reportSingleDate) => {
    try {
      const dayRecords = (adminData?.attendance ?? []).filter((a) => a.day_date === targetDate);
      const participants = (adminData?.profiles ?? []).map((p) => ({
        id: p.id,
        participant_code: p.participant_code,
        full_name: p.full_name,
        phone: p.phone,
        email: p.email,
      }));

      const bytes = await generateDailyAttendanceExcel({
        date: targetDate,
        participants,
        attendanceRecords: dayRecords,
        settings,
      });

      downloadExcelFile(bytes, `ESDP_Attendance_${targetDate}.xlsx`);
      toast.success(`Exported ESDP_Attendance_${targetDate}.xlsx`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to export daily attendance Excel.");
    }
  };

  const handleDownloadDateRangeAttendanceExcel = async () => {
    try {
      const records = (adminData?.attendance ?? []).filter(
        (a) => a.day_date >= reportStartDate && a.day_date <= reportEndDate,
      );
      const participants = (adminData?.profiles ?? []).map((p) => ({
        id: p.id,
        participant_code: p.participant_code,
        full_name: p.full_name,
        phone: p.phone,
        email: p.email,
      }));

      const bytes = await generateDateRangeAttendanceExcel({
        startDate: reportStartDate,
        endDate: reportEndDate,
        participants,
        attendanceRecords: records,
        settings,
        sessionType: "all",
      });

      downloadExcelFile(bytes, `ESDP_Attendance_${reportStartDate}_to_${reportEndDate}.xlsx`);
      toast.success(`Exported ESDP_Attendance_${reportStartDate}_to_${reportEndDate}.xlsx`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to export date range Excel.");
    }
  };

  const handleDownloadCompleteHistoryExcel = async () => {
    try {
      const allWorkshopDays = settings ? workshopDays(settings) : [];
      const startDate = allWorkshopDays[0] || "2026-11-01";
      const endDate = allWorkshopDays[allWorkshopDays.length - 1] || today;
      const records = adminData?.attendance ?? [];
      const participants = (adminData?.profiles ?? []).map((p) => ({
        id: p.id,
        participant_code: p.participant_code,
        full_name: p.full_name,
        phone: p.phone,
        email: p.email,
      }));

      const bytes = await generateDateRangeAttendanceExcel({
        startDate,
        endDate,
        participants,
        attendanceRecords: records,
        settings,
        sessionType: "all",
      });

      downloadExcelFile(bytes, "ESDP_Complete_Attendance_Report.xlsx");
      toast.success("Exported ESDP_Complete_Attendance_Report.xlsx");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to export complete attendance report.");
    }
  };

  const handleDownloadEntryAttendanceExcel = async () => {
    try {
      const allWorkshopDays = settings ? workshopDays(settings) : [];
      const startDate = allWorkshopDays[0] || "2026-11-01";
      const endDate = allWorkshopDays[allWorkshopDays.length - 1] || today;
      const records = adminData?.attendance ?? [];
      const participants = (adminData?.profiles ?? []).map((p) => ({
        id: p.id,
        participant_code: p.participant_code,
        full_name: p.full_name,
        phone: p.phone,
        email: p.email,
      }));

      const bytes = await generateDateRangeAttendanceExcel({
        startDate,
        endDate,
        participants,
        attendanceRecords: records,
        settings,
        sessionType: "entry",
      });

      downloadExcelFile(bytes, "ESDP_Entry_Attendance.xlsx");
      toast.success("Exported ESDP_Entry_Attendance.xlsx");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to export entry attendance.");
    }
  };

  const handleDownloadExitAttendanceExcel = async () => {
    try {
      const allWorkshopDays = settings ? workshopDays(settings) : [];
      const startDate = allWorkshopDays[0] || "2026-11-01";
      const endDate = allWorkshopDays[allWorkshopDays.length - 1] || today;
      const records = adminData?.attendance ?? [];
      const participants = (adminData?.profiles ?? []).map((p) => ({
        id: p.id,
        participant_code: p.participant_code,
        full_name: p.full_name,
        phone: p.phone,
        email: p.email,
      }));

      const bytes = await generateDateRangeAttendanceExcel({
        startDate,
        endDate,
        participants,
        attendanceRecords: records,
        settings,
        sessionType: "exit",
      });

      downloadExcelFile(bytes, "ESDP_Exit_Attendance.xlsx");
      toast.success("Exported ESDP_Exit_Attendance.xlsx");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to export exit attendance.");
    }
  };

  const handleExportFiltered = async () => {
    if (!settings) return;
    try {
      const bytes = await generate30DayWorkbook(settings, filteredParticipants);
      downloadExcelFile(bytes, `Filtered_Attendance_Export_${today}.xlsx`);
      toast.success(`Exported ${filteredParticipants.length} filtered participant records.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to export filtered report.");
    }
  };

  const handleDownloadBulkPdf = async () => {
    if (!filteredParticipants.length) {
      toast.error("No participants available to download.");
      return;
    }
    setDownloadingBulkPdf(true);
    try {
      const { downloadBulkParticipantCredentialsPdf } = await import("@/lib/credential-pdf");
      const list = filteredParticipants.map((p) => {
        const photoPath = adminData?.profiles.find((x) => x.id === p.id)?.photo_path ?? "";
        const photoUrl = p.id ? photoUrls[photoPath] : undefined;
        return {
          fullName: p.full_name,
          participantCode: p.participant_code,
          email: p.email,
          phone: p.phone,
          verificationStatus: p.verification_status,
          photoUrl,
          portalUrl: typeof window !== "undefined" ? `${window.location.origin}/auth` : "/auth",
          workshopName: settings?.name || "Event Management Portal",
        };
      });

      await downloadBulkParticipantCredentialsPdf(
        list,
        `bulk_student_credentials_${today}.pdf`
      );
      toast.success(`Downloaded credentials PDF pass for ${list.length} participants!`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to generate bulk credentials PDF.");
    } finally {
      setDownloadingBulkPdf(false);
    }
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-8">
      {/* Portal Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Attendance Administration
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {settings?.name || "Workshop Attendance"} • Management & Verification Console
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => setRegisterDialogOpen(true)}
            className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs sm:text-sm shadow-xs"
          >
            <UserPlus className="h-4 w-4 shrink-0" />
            <span>Register Participant</span>
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setQrScannerDialogOpen(true);
            }}
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs sm:text-sm shadow-xs transition-all cursor-pointer"
          >
            <QrCode className="h-4 w-4 shrink-0" />
            <span>QR Code Verification</span>
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setFaceRecognitionDialogOpen(true);
            }}
            className="gap-2 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs sm:text-sm shadow-xs transition-all cursor-pointer"
          >
            <ScanFace className="h-4 w-4 shrink-0" />
            <span>Face Recognition</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => void refetch()}
            title="Refresh Data"
            className="h-9 w-9 text-muted-foreground hover:text-foreground shrink-0"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        {/* Mobile Quick Tab Dropdown */}
        <div className="sm:hidden">
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full h-11 bg-card border font-semibold text-sm shadow-xs">
              <SelectValue placeholder="Select section" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="scanner">🛡️ Attendance Verification Console</SelectItem>
              <SelectItem value="attendance_management">📋 Attendance Management</SelectItem>
              <SelectItem value="overview">📊 Overview & Analytics</SelectItem>
              <SelectItem value="daily">📅 Daily Attendance</SelectItem>
              <SelectItem value="qr">📺 Projector QR</SelectItem>
              <SelectItem value="participants">👥 Participants ({totalRegistered})</SelectItem>
              <SelectItem value="selfies">🛡️ Verifications {pendingSelfies > 0 ? `(${pendingSelfies})` : ""}</SelectItem>
              <SelectItem value="exports">📄 Reports & Exports</SelectItem>
              {me?.isSuper && <SelectItem value="settings">⚙️ Settings</SelectItem>}
            </SelectContent>
          </Select>
        </div>

        {/* Tab Pills Bar (Always starts from left, smoothly scrollable on mobile, grid on tablet/desktop) */}
        <TabsList className="flex w-full overflow-x-auto justify-start items-center sm:grid sm:grid-cols-4 lg:grid-cols-8 h-auto p-1.5 bg-muted/60 gap-1 rounded-xl border">
          <TabsTrigger value="scanner" className="shrink-0 whitespace-nowrap gap-1.5 py-2 px-3 text-xs font-bold text-primary">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Verification Console
          </TabsTrigger>
          <TabsTrigger value="attendance_management" className="shrink-0 whitespace-nowrap gap-1.5 py-2 px-3 text-xs font-bold text-emerald-700 dark:text-emerald-400">
            <CalendarCheck className="h-3.5 w-3.5 text-emerald-600" /> Attendance Management
          </TabsTrigger>
          <TabsTrigger value="overview" className="shrink-0 whitespace-nowrap gap-1.5 py-2 px-3 text-xs font-semibold">
            <BarChart3 className="h-3.5 w-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="daily" className="shrink-0 whitespace-nowrap gap-1.5 py-2 px-3 text-xs font-semibold">
            <Calendar className="h-3.5 w-3.5" /> Daily Attendance
          </TabsTrigger>
          <TabsTrigger value="qr" className="shrink-0 whitespace-nowrap gap-1.5 py-2 px-3 text-xs font-semibold">
            <QrCode className="h-3.5 w-3.5" /> Projector QR
          </TabsTrigger>
          <TabsTrigger value="participants" className="shrink-0 whitespace-nowrap gap-1.5 py-2 px-3 text-xs font-semibold">
            <Users className="h-3.5 w-3.5" /> Participants ({totalRegistered})
          </TabsTrigger>
          <TabsTrigger value="selfies" className="shrink-0 whitespace-nowrap gap-1.5 py-2 px-3 text-xs font-semibold">
            <ShieldCheck className="h-3.5 w-3.5" /> Verifications {pendingSelfies > 0 && `(${pendingSelfies})`}
          </TabsTrigger>
          <TabsTrigger value="exports" className="shrink-0 whitespace-nowrap gap-1.5 py-2 px-3 text-xs font-semibold">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Reports
          </TabsTrigger>
          {me?.isSuper && (
            <TabsTrigger value="settings" className="shrink-0 whitespace-nowrap gap-1.5 py-2 px-3 text-xs font-semibold">
              <SettingsIcon className="h-3.5 w-3.5" /> Settings
            </TabsTrigger>
          )}
        </TabsList>

        {/* TAB 1: ATTENDANCE VERIFICATION CONSOLE (QR & Face Recognition) */}
        <TabsContent value="scanner" className="space-y-6">
          <AdminQrScannerTab
            workshopName={settings?.name}
            onAttendanceConfirmed={() => void refetch()}
            approvedParticipants={adminData?.profiles?.filter((p) => p.verification_status === "verified")}
            activeMode={verificationMode}
            onModeChange={setVerificationMode}
            isTabActive={!qrScannerDialogOpen && !faceRecognitionDialogOpen && activeTab === "scanner"}
            cameraTrigger={cameraTrigger}
          />
        </TabsContent>

        {/* TAB: ATTENDANCE MANAGEMENT (Manual Session Override, Bulk Management, Calendar Integration & Reset) */}
        <TabsContent value="attendance_management" className="space-y-6">
          <AdminAttendanceManagementTab
            settings={settings}
            participantRows={adminData?.participantRows}
            photoUrls={photoUrls}
            configuredDays={adminData?.configuredWorkshopDays}
            onAttendanceUpdated={() => void refetch()}
            onSettingsUpdated={() => {
              void qc.invalidateQueries({ queryKey: ["settings"] });
              void refetch();
            }}
            initialDate={dailyDate}
          />
        </TabsContent>

        {/* TAB 2: OVERVIEW & ANALYTICS */}
        <TabsContent value="overview" className="space-y-6">
          {/* Quick Navigation Action Bar */}
          <Card className="shadow-sm border bg-card">
            <CardContent className="p-3.5 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-primary" /> Quick Navigation
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8 font-semibold cursor-pointer" onClick={() => setActiveTab("daily")}>
                  <Calendar className="h-3.5 w-3.5 text-primary" /> Daily Attendance
                </Button>
                <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8 font-semibold cursor-pointer" onClick={() => setActiveTab("attendance_management")}>
                  <CalendarCheck className="h-3.5 w-3.5 text-emerald-600" /> Attendance Calendar
                </Button>
                <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8 font-semibold cursor-pointer" onClick={() => setActiveTab("exports")}>
                  <FileText className="h-3.5 w-3.5 text-purple-600" /> Attendance Reports
                </Button>
                <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8 font-semibold cursor-pointer" onClick={() => setActiveTab("exports")}>
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Excel Export
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Today's Entry & Exit Attendance KPI Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <Card className="shadow-sm border">
              <CardHeader className="flex flex-row items-center justify-between pb-1.5 p-4">
                <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Total Registered</CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold font-display">{totalRegistered}</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{verifiedCount} Identity Verified</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm border bg-amber-500/5 border-amber-500/20">
              <CardHeader className="flex flex-row items-center justify-between pb-1.5 p-4">
                <CardTitle className="text-xs font-semibold uppercase text-amber-800 dark:text-amber-400">Today's Entry</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-amber-600" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold font-display text-amber-700 dark:text-amber-300">{todayEntryCount}</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Recorded arrival</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm border bg-orange-500/5 border-orange-500/20">
              <CardHeader className="flex flex-row items-center justify-between pb-1.5 p-4">
                <CardTitle className="text-xs font-semibold uppercase text-orange-800 dark:text-orange-400">Today's Exit</CardTitle>
                <Clock className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold font-display text-orange-700 dark:text-orange-300">{todayExitCount}</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Recorded departure</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm border bg-rose-500/5 border-rose-500/20">
              <CardHeader className="flex flex-row items-center justify-between pb-1.5 p-4">
                <CardTitle className="text-xs font-semibold uppercase text-rose-800 dark:text-rose-400">Missing Entry</CardTitle>
                <AlertTriangle className="h-4 w-4 text-rose-600" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold font-display text-rose-700 dark:text-rose-300">{missingEntryCount}</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Awaiting check-in</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm border bg-destructive/5 border-destructive/20">
              <CardHeader className="flex flex-row items-center justify-between pb-1.5 p-4">
                <CardTitle className="text-xs font-semibold uppercase text-destructive">Missing Exit</CardTitle>
                <XCircle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold font-display text-destructive">{missingExitCount}</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Awaiting check-out</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm border bg-emerald-500/5 border-emerald-500/20">
              <CardHeader className="flex flex-row items-center justify-between pb-1.5 p-4">
                <CardTitle className="text-xs font-semibold uppercase text-emerald-800 dark:text-emerald-400">Complete Attendance</CardTitle>
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold font-display text-emerald-700 dark:text-emerald-300">{todayCompleteCount}</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Both Entry & Exit present</p>
              </CardContent>
            </Card>
          </div>

          {/* Analytics Charts (Robust native SVG charts, immune to React 19 hook mismatch) */}
          <AdminOverviewCharts
            dailyTrendData={dailyTrendData}
            distributionData={distributionData}
            totalRegistered={totalRegistered}
          />
        </TabsContent>


        {/* TAB: DAILY ATTENDANCE MANAGEMENT (Requirement 7) */}
        <TabsContent value="daily" className="space-y-6">
          {/* Top Controls: Session Date Picker, Search & Status Filters */}
          <Card className="shadow-sm border">
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="font-display text-xl flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" /> Daily Attendance Management
                  </CardTitle>
                  <CardDescription>
                    Track real-time session presence, verify attendee portraits, and review check-in methods.
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Select value={dailyDate} onValueChange={setDailyDate}>
                    <SelectTrigger className="w-[180px] font-mono text-xs">
                      <SelectValue placeholder="Select Session Date" />
                    </SelectTrigger>
                    <SelectContent>
                      {allDays.map((d, idx) => (
                        <SelectItem key={d} value={d} className="font-mono text-xs">
                          Day {idx + 1} ({d}) {d === today ? "— Today" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs font-semibold"
                    onClick={() => {
                      setManualTargetUser(adminData?.participantRows[0] ?? null);
                      setManualDate(dailyDate);
                      setManualModalOpen(true);
                    }}
                  >
                    <Edit className="h-3.5 w-3.5" /> Manual Correction
                  </Button>
                </div>
              </div>

              {/* Filters Bar */}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search attendee by name, code, phone, or email…"
                    value={dailySearch}
                    onChange={(e) => setDailySearch(e.target.value)}
                    className="pl-9 text-xs"
                  />
                </div>
                <Select value={dailyStatusFilter} onValueChange={setDailyStatusFilter}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Attendance Status & Method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Eligible Attendees ({dailyAttendanceStats.totalApproved})</SelectItem>
                    <SelectItem value="present">All Present ({dailyAttendanceStats.presentCount})</SelectItem>
                    <SelectItem value="qr">📷 QR Verified ({dailyAttendanceStats.qrCount})</SelectItem>
                    <SelectItem value="face">👤 Face Verified ({dailyAttendanceStats.faceCount})</SelectItem>
                    <SelectItem value="manual">✍️ Manually Marked ({dailyAttendanceStats.manualCount})</SelectItem>
                    <SelectItem value="not_marked">⏳ Absent / Not Yet Marked ({dailyAttendanceStats.notMarkedCount})</SelectItem>
                    <SelectItem value="pending">⚠️ Pending Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
          </Card>

          {/* Daily Statistics Cards (Requirement 7) */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="shadow-sm border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Eligible Participants</CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display">{dailyAttendanceStats.totalApproved}</div>
                <p className="text-[11px] text-muted-foreground mt-1">Approved for session</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Total Present</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display text-emerald-600">{dailyAttendanceStats.presentCount}</div>
                <p className="text-[11px] text-muted-foreground mt-1">{dailyAttendanceStats.rate}% attendance rate</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Total Absent</CardTitle>
                <Clock className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display text-warning">{dailyAttendanceStats.notMarkedCount}</div>
                <p className="text-[11px] text-muted-foreground mt-1">Not checked in</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Attendance Percentage</CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display">{dailyAttendanceStats.rate}%</div>
                <p className="text-[11px] text-muted-foreground mt-1">Of approved attendees</p>
              </CardContent>
            </Card>
          </div>

          {/* Verification Method Breakdown Chips (Requirement 7) */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="shadow-xs border border-primary/20 bg-primary/5">
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                    <Camera className="h-3.5 w-3.5 text-primary" /> QR-Based Attendance
                  </span>
                  <p className="text-xl font-bold font-display text-primary mt-1">{dailyAttendanceStats.qrCount}</p>
                </div>
                <Badge variant="outline" className="text-[11px] font-mono border-primary/30">
                  {dailyAttendanceStats.presentCount ? Math.round((dailyAttendanceStats.qrCount / dailyAttendanceStats.presentCount) * 100) : 0}% of present
                </Badge>
              </CardContent>
            </Card>

            <Card className="shadow-xs border border-purple-500/20 bg-purple-500/5">
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                    <ScanFace className="h-3.5 w-3.5 text-purple-600" /> Face-Based Attendance
                  </span>
                  <p className="text-xl font-bold font-display text-purple-700 mt-1">{dailyAttendanceStats.faceCount}</p>
                </div>
                <Badge variant="outline" className="text-[11px] font-mono border-purple-300 text-purple-700">
                  {dailyAttendanceStats.presentCount ? Math.round((dailyAttendanceStats.faceCount / dailyAttendanceStats.presentCount) * 100) : 0}% of present
                </Badge>
              </CardContent>
            </Card>

            <Card className="shadow-xs border border-amber-500/20 bg-amber-500/5">
              <CardContent className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                    <Edit className="h-3.5 w-3.5 text-amber-600" /> Manually Marked
                  </span>
                  <p className="text-xl font-bold font-display text-amber-700 mt-1">{dailyAttendanceStats.manualCount}</p>
                </div>
                <Badge variant="outline" className="text-[11px] font-mono border-amber-300 text-amber-700">
                  {dailyAttendanceStats.presentCount ? Math.round((dailyAttendanceStats.manualCount / dailyAttendanceStats.presentCount) * 100) : 0}% of present
                </Badge>
              </CardContent>
            </Card>
          </div>

          {/* Daily Attendees Table */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-lg">Attendee Records for {dailyDate}</CardTitle>
              <CardDescription>
                Detailed list of approved participants and their verified attendance record.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
                    <tr>
                      <th className="py-3 px-4">Attendee</th>
                      <th className="py-3 px-4">Contact</th>
                      <th className="py-3 px-4">Session Status</th>
                      <th className="py-3 px-4">Check-In Time</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {!dailyAttendanceStats.rows.length ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-muted-foreground">
                          No attendee records match the search and filter criteria.
                        </td>
                      </tr>
                    ) : (
                      dailyAttendanceStats.rows.map((r) => {
                        const prof = r.profile;
                        const att = r.attendance;
                        const photoUrl = prof.photo_path ? photoUrls[prof.photo_path] : undefined;

                        return (
                          <tr key={prof.id} className="hover:bg-muted/20">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <ClickableAvatar
                                  src={photoUrl}
                                  alt={prof.full_name}
                                  fullName={prof.full_name}
                                  participantCode={prof.participant_code}
                                  verificationStatus={r.status}
                                  fallback={prof.full_name.slice(0, 2).toUpperCase()}
                                  className="h-14 w-14 rounded-2xl border shadow-xs"
                                  fallbackClassName="text-sm"
                                />
                                <div>
                                  <p className="font-semibold text-foreground">{prof.full_name}</p>
                                  <p className="text-xs text-muted-foreground font-mono">{prof.participant_code}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-xs font-mono">
                              <p className="text-foreground">{prof.phone}</p>
                              <p className="text-muted-foreground truncate max-w-[160px]">{prof.email}</p>
                            </td>
                            <td className="py-3 px-4">
                              <StatusPill state={r.status === "present" ? "Present" : r.status === "pending" ? "Pending" : "Absent"} />
                            </td>
                            <td className="py-3 px-4 text-xs text-muted-foreground font-mono">
                              {att?.checked_in_at ? new Date(att.checked_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                            </td>
                            <td className="py-3 px-4">
                              {att?.method ? (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] uppercase font-mono ${
                                    att.method === "qr_selfie" || att.method === "face"
                                      ? "bg-purple-500/10 text-purple-700 border-purple-200"
                                      : att.method === "qr" || att.method === "qr_scan"
                                      ? "bg-emerald-500/10 text-emerald-700 border-emerald-200"
                                      : "bg-amber-500/10 text-amber-700 border-amber-200"
                                  }`}
                                >
                                  {att.method === "qr_selfie" || att.method === "face"
                                    ? "👤 Face Verified"
                                    : att.method === "qr" || att.method === "qr_scan"
                                    ? "📷 QR Scan"
                                    : att.method === "manual"
                                    ? "✍️ Manual"
                                    : att.method}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs font-semibold gap-1 text-primary hover:text-primary"
                                onClick={() => setViewingRecord({ profile: prof, attendance: att })}
                              >
                                <Eye className="h-3.5 w-3.5" /> Details
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: DAILY QR CODE SESSION */}
        <TabsContent value="qr" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Live QR Code Display */}
            <Card className="shadow-sm border-2 border-primary/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="font-display text-xl flex items-center gap-2">
                    <QrCode className="h-5 w-5 text-primary" /> Live Daily Rotating QR Code
                  </CardTitle>
                  {adminData?.activeQr && (
                    <Badge variant="outline" className="font-mono text-xs text-success border-success">
                      EXPIRING IN {Math.floor(timeLeftSec / 60)}m {timeLeftSec % 60}s
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  Project this screen to the audience. Attendees scan this with their device camera.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center p-6 space-y-4">
                {qrDataUrl && adminData?.activeQr ? (
                  <div className="flex flex-col items-center space-y-3">
                    <div className="rounded-2xl border-4 border-slate-900 bg-white p-4 shadow-xl">
                      <img src={qrDataUrl} alt="Workshop QR Code" className="h-64 w-64 md:h-72 md:w-72" />
                    </div>
                    <div className="text-center">
                      <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">
                        Alternative Short Code:
                      </span>
                      <div className="font-mono text-4xl font-extrabold tracking-widest text-primary mt-1">
                        {adminData.activeQr.short_code}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-16 text-center space-y-3">
                    <QrCode className="mx-auto h-16 w-16 text-muted-foreground opacity-40" />
                    <p className="text-sm text-muted-foreground">
                      No active QR code for today ({today}). Click below to generate one.
                    </p>
                  </div>
                )}

                {/* Admin Controls Grid */}
                <div className="flex flex-col gap-2.5 pt-4 w-full">
                  <div className="flex flex-wrap items-center gap-2 w-full">
                    <Button
                      onClick={handleGenerateQr}
                      disabled={generatingQr}
                      className="flex-1 min-w-[170px] gap-2 font-bold cursor-pointer"
                    >
                      <RotateCw className={`h-4 w-4 ${generatingQr ? "animate-spin" : ""}`} />
                      {adminData?.activeQr ? "Refresh / Rotate QR" : "Generate Today's QR"}
                    </Button>

                    {adminData?.activeQr && (
                      <>
                        <Button
                          variant="secondary"
                          onClick={() => setFullscreenQrOpen(true)}
                          className="gap-1.5 font-semibold text-xs cursor-pointer"
                        >
                          <Maximize2 className="h-3.5 w-3.5" /> Fullscreen Projector
                        </Button>

                        <Button
                          variant="outline"
                          onClick={handleCopyQrUrl}
                          className="gap-1.5 font-semibold text-xs cursor-pointer"
                        >
                          <Copy className="h-3.5 w-3.5" /> Copy Destination URL
                        </Button>

                        <Button
                          variant="outline"
                          onClick={handleDownloadQrPng}
                          className="gap-1.5 font-semibold text-xs cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" /> Download PNG
                        </Button>

                        <Button
                          variant="destructive"
                          onClick={() => handleRevokeQr(adminData.activeQr!.id)}
                          className="gap-1.5 text-xs font-semibold cursor-pointer"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Revoke
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Today's Live Attendance Feed */}
            <Card className="shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="font-display text-xl">Today's Check-ins ({today})</CardTitle>
                    <CardDescription>{todayAttendance.length} attendee records recorded today</CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs"
                    onClick={() => {
                      setManualTargetUser(adminData?.participantRows[0] ?? null);
                      setManualDate(today);
                      setManualModalOpen(true);
                    }}
                  >
                    <Edit className="h-3.5 w-3.5" /> Manual Check-In
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="max-h-[460px] overflow-y-auto space-y-2">
                {!todayAttendance.length ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    No participants checked in yet today.
                  </div>
                ) : (
                  todayAttendance.map((a) => {
                    const prof = adminData?.profiles.find((p) => p.id === a.user_id);
                    return (
                      <div
                        key={a.id}
                        className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm shadow-xs hover:bg-muted/30"
                      >
                        <div className="flex items-center gap-3">
                          <ClickableAvatar
                            src={prof?.photo_path ? photoUrls[prof.photo_path] : undefined}
                            alt={prof?.full_name}
                            fullName={prof?.full_name}
                            participantCode={prof?.participant_code}
                            fallback={prof?.full_name?.slice(0, 2).toUpperCase()}
                            className="h-12 w-12 rounded-xl border shadow-xs"
                          />
                          <div>
                            <p className="font-semibold text-foreground">{prof?.full_name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{prof?.participant_code}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusPill state={a.status === "present" ? "Present" : a.status === "pending" ? "Pending" : "Absent"} />
                          <span className="text-xs text-muted-foreground">
                            {new Date(a.checked_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 3: PARTICIPANTS TABLE */}
        <TabsContent value="participants" className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="font-display text-xl">Participant Directory</CardTitle>
                  <CardDescription>
                    Review registration status, attendance percentages, and manage participant records.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => setEsdpBulkDialogOpen(true)}
                    className="gap-2 font-bold bg-teal-700 hover:bg-teal-800 text-white shadow-xs"
                    title="Import participant list from Word (.docx), auto-generate passwords, and bulk register"
                  >
                    <Users className="h-4 w-4" /> ESDP Bulk Registration
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setRegisterDialogOpen(true)}
                    className="gap-2 font-bold shadow-xs"
                  >
                    <UserPlus className="h-4 w-4" /> Register New Participant
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDownloadBulkPdf}
                    disabled={downloadingBulkPdf || filteredParticipants.length === 0}
                    className="gap-2 text-teal-700 dark:text-teal-400 border-teal-300 dark:border-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40"
                    title="Download multi-page credentials PDF pass for all filtered participants"
                  >
                    {downloadingBulkPdf ? (
                      <RotateCw className="h-4 w-4 animate-spin text-teal-600" />
                    ) : (
                      <FileDown className="h-4 w-4 text-teal-600" />
                    )}
                    <span>Bulk Credentials PDF</span>
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleExportFiltered} className="gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Export Filtered (.xlsx)
                  </Button>
                </div>
              </div>

              {/* Search & Filters */}
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search name, code, phone, email…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Verification Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Participants</SelectItem>
                    <SelectItem value="pending">Pending Verification ({pendingRegistrations})</SelectItem>
                    <SelectItem value="verified">Approved Participants</SelectItem>
                    <SelectItem value="rejected">Rejected Participants</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant={lowAttendanceOnly ? "default" : "outline"}
                  onClick={() => setLowAttendanceOnly(!lowAttendanceOnly)}
                  className="gap-2"
                >
                  <AlertTriangle className="h-4 w-4" />
                  {lowAttendanceOnly ? "Showing Low Attendance" : `Filter < ${settings?.low_attendance_threshold}% Attendance`}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
                    <tr>
                      <th className="py-3 px-4">Participant</th>
                      <th className="py-3 px-4">Contact</th>
                      <th className="py-3 px-4">Identity Status</th>
                      <th className="py-3 px-4">Present</th>
                      <th className="py-3 px-4">Absent</th>
                      <th className="py-3 px-4">Attendance %</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {!filteredParticipants.length ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-muted-foreground">
                          No participants match the specified filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredParticipants.map((p) => {
                        const isStaff = adminData?.rolesByUser.get(p.id)?.includes("attendance_admin");
                        const isSuper = adminData?.rolesByUser.get(p.id)?.includes("super_admin");
                        const isLow = settings && p.summary.currentPct < settings.low_attendance_threshold;

                        return (
                          <tr key={p.id} className="hover:bg-muted/20">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <ClickableAvatar
                                  src={p.id ? photoUrls[adminData.profiles.find((x) => x.id === p.id)?.photo_path ?? ""] : undefined}
                                  alt={p.full_name}
                                  fullName={p.full_name}
                                  participantCode={p.participant_code}
                                  verificationStatus={p.verification_status}
                                  fallback={p.full_name.slice(0, 2).toUpperCase()}
                                  className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl border shadow-xs"
                                  fallbackClassName="text-sm font-bold"
                                />
                                <div>
                                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                                    {p.full_name}
                                    {isSuper && <Badge variant="secondary" className="text-[10px]">SUPER</Badge>}
                                    {isStaff && !isSuper && <Badge variant="outline" className="text-[10px]">STAFF</Badge>}
                                  </p>
                                  <p className="font-mono text-xs text-muted-foreground">{p.participant_code}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-xs">
                              <p className="text-foreground">{p.email}</p>
                              <p className="text-muted-foreground">{p.phone}</p>
                            </td>
                            <td className="py-3 px-4">
                              <Badge
                                className={
                                  p.verification_status === "verified"
                                    ? "bg-success text-success-foreground"
                                    : p.verification_status === "rejected"
                                    ? "bg-destructive text-destructive-foreground"
                                    : "bg-warning text-warning-foreground"
                                }
                              >
                                {p.verification_status.toUpperCase()}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 font-semibold text-success">{p.summary.present}</td>
                            <td className="py-3 px-4 font-semibold text-destructive">{p.summary.absent}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`font-bold font-mono ${
                                  isLow ? "text-destructive" : "text-foreground"
                                }`}
                              >
                                {p.summary.currentPct}%
                              </span>
                              <span className="text-[11px] text-muted-foreground block">
                                Final: {p.summary.finalPct}%
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  title="View Details"
                                  onClick={() => setSelectedParticipant(p)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-primary hover:text-primary hover:bg-primary/10"
                                  title="Edit Participant Details"
                                  onClick={() => {
                                    const photoPath = adminData?.profiles.find((x) => x.id === p.id)?.photo_path ?? "";
                                    const photoUrl = p.id ? photoUrls[photoPath] : undefined;
                                    setEditTargetUser({
                                      id: p.id,
                                      full_name: p.full_name,
                                      participant_code: p.participant_code,
                                      email: p.email,
                                      phone: p.phone,
                                      verification_status: p.verification_status,
                                      remarks: undefined,
                                      photo_url: photoUrl,
                                    });
                                  }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                  title="Digital Participant ID Card"
                                  onClick={() => setDigitalIdTarget(p)}
                                >
                                  <IdCard className="h-4 w-4" />
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40"
                                  title="Download Credentials PDF Pass"
                                  disabled={downloadingPdfId === p.id}
                                  onClick={() => handleDownloadParticipantPdf(p)}
                                >
                                  {downloadingPdfId === p.id ? (
                                    <RotateCw className="h-4 w-4 animate-spin text-teal-600" />
                                  ) : (
                                    <FileDown className="h-4 w-4" />
                                  )}
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                                  title="Change Password"
                                  onClick={() =>
                                    setPasswordTargetUser({
                                      id: p.id,
                                      full_name: p.full_name,
                                      participant_code: p.participant_code,
                                      email: p.email,
                                      phone: p.phone,
                                      verification_status: p.verification_status,
                                      photo_url: p.id ? photoUrls[adminData?.profiles.find((x) => x.id === p.id)?.photo_path ?? ""] : undefined,
                                    })
                                  }
                                >
                                  <KeyRound className="h-4 w-4" />
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  title="Delete Participant"
                                  onClick={() =>
                                    setDeleteTargetUser({
                                      id: p.id,
                                      full_name: p.full_name,
                                      participant_code: p.participant_code,
                                      email: p.email,
                                      phone: p.phone,
                                      photoUrl: p.id ? photoUrls[adminData.profiles.find((x) => x.id === p.id)?.photo_path ?? ""] : undefined,
                                    })
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  title="Mark Attendance Manually"
                                  onClick={() => {
                                    setManualTargetUser(p);
                                    setManualDate(today);
                                    setManualModalOpen(true);
                                  }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {p.verification_status === "pending" && (
                                  <>
                                    <Button
                                      size="sm"
                                      className="bg-success hover:bg-success/90 text-white font-bold text-xs h-7 px-2"
                                      title="Approve Registration"
                                      onClick={() => handleVerifyRegistration(p.id, "verified")}
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      className="font-bold text-xs h-7 px-2"
                                      title="Reject Registration"
                                      onClick={() => handleVerifyRegistration(p.id, "rejected")}
                                    >
                                      Reject
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: SELFIE & FACE VERIFICATION QUEUE */}
        <TabsContent value="selfies" className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="font-display text-xl">Attendance Verification Queue</CardTitle>
              <CardDescription>
                Compare the attendee's live check-in selfie against their registration reference photograph.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {adminData?.attendance.filter((a) => a.status === "pending" || a.selfie_path).length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground space-y-2">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
                  <p>All attendance check-ins are verified! No pending selfie submissions.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {adminData?.attendance
                    .filter((a) => a.status === "pending" || a.selfie_path)
                    .map((att) => {
                      const prof = adminData.profiles.find((p) => p.id === att.user_id);
                      return (
                        <Card key={att.id} className="overflow-hidden border shadow-sm">
                          <CardHeader className="bg-muted/30 pb-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-bold text-foreground">{prof?.full_name}</p>
                                <p className="font-mono text-xs text-muted-foreground">{prof?.participant_code}</p>
                              </div>
                              <StatusPill state={att.status === "present" ? "Present" : "Pending"} />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Session Date: {att.day_date} • {new Date(att.checked_in_at).toLocaleTimeString()}
                            </p>
                          </CardHeader>
                          <CardContent className="p-4 space-y-3">
                            <div className="grid grid-cols-2 gap-2 text-center">
                              <div>
                                <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                                  Reference Photo
                                </span>
                                <div className="mt-1 aspect-square rounded-lg border bg-muted/40 overflow-hidden flex items-center justify-center">
                                  {prof?.photo_path && photoUrls[prof.photo_path] ? (
                                    <ClickableAvatar
                                      src={photoUrls[prof.photo_path]}
                                      alt="Reference Photo"
                                      fullName={prof.full_name}
                                      participantCode={prof.participant_code}
                                      className="w-full h-full rounded-none"
                                    />
                                  ) : (
                                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                                      No Photo
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div>
                                <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                                  Check-in Selfie
                                </span>
                                <div className="mt-1 aspect-square rounded-lg border bg-muted/40 overflow-hidden flex items-center justify-center">
                                  {att.selfie_path && photoUrls[att.selfie_path] ? (
                                    <ClickableAvatar
                                      src={photoUrls[att.selfie_path]}
                                      alt="Check-in Selfie"
                                      fullName={`${prof?.full_name ?? "Participant"} (Check-in Selfie)`}
                                      participantCode={prof?.participant_code}
                                      className="w-full h-full rounded-none"
                                    />
                                  ) : (
                                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                                      Selfie Uploaded
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {att.remarks && (
                              <p className="text-[11px] text-muted-foreground bg-muted/40 p-2 rounded-md">
                                <span className="font-semibold text-foreground">Score/Notes: </span>
                                {att.remarks}
                              </p>
                            )}

                            {att.status === "pending" && (
                              <div className="flex gap-2 pt-2">
                                <Button
                                  size="sm"
                                  className="flex-1 bg-success hover:bg-success/90 text-white font-semibold"
                                  onClick={() => handleReviewSelfie(att.id, true)}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="flex-1 font-semibold"
                                  onClick={() => handleReviewSelfie(att.id, false)}
                                >
                                  Reject
                                </Button>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 5: ATTENDANCE REPORTS & EXCEL EXPORTS */}
        <TabsContent value="exports" className="space-y-6">
          {/* Top Section: Export Cards */}
          <div className="grid gap-6 md:grid-cols-3">
            {/* 1. Single-Day Attendance Excel Export */}
            <Card className="shadow-sm border-2 border-primary/20 bg-card">
              <CardHeader>
                <CardTitle className="font-display text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" /> Single-Day Attendance Excel
                </CardTitle>
                <CardDescription>
                  Download complete attendance for all participants (including absentees) with exact IST timestamps.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Selected Date</label>
                  <Input
                    type="date"
                    value={reportSingleDate}
                    onChange={(e) => setReportSingleDate(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
                <Button
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold gap-2 cursor-pointer"
                  onClick={() => handleDownloadSingleDayAttendanceExcel(reportSingleDate)}
                >
                  <FileSpreadsheet className="h-4 w-4" /> Download Daily Attendance Excel
                </Button>
                <p className="text-[11px] text-muted-foreground font-mono text-center">
                  Filename: ESDP_Attendance_{reportSingleDate}.xlsx
                </p>
              </CardContent>
            </Card>

            {/* 2. Bulk Excel Attendance Downloads */}
            <Card className="shadow-sm border-2 border-primary/20 bg-card">
              <CardHeader>
                <CardTitle className="font-display text-lg flex items-center gap-2">
                  <Layers className="h-5 w-5 text-emerald-600" /> Bulk Excel Attendance
                </CardTitle>
                <CardDescription>
                  Download records for custom date ranges, complete workshop history, or Entry/Exit separately.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase">From</label>
                    <Input
                      type="date"
                      value={reportStartDate}
                      onChange={(e) => setReportStartDate(e.target.value)}
                      className="font-mono text-[11px] h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase">To</label>
                    <Input
                      type="date"
                      value={reportEndDate}
                      onChange={(e) => setReportEndDate(e.target.value)}
                      className="font-mono text-[11px] h-8"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs font-bold gap-1 cursor-pointer"
                    onClick={handleDownloadDateRangeAttendanceExcel}
                  >
                    <FileDown className="h-3.5 w-3.5" /> Date Range (.xlsx)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs font-bold gap-1 cursor-pointer bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                    onClick={handleDownloadCompleteHistoryExcel}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" /> Complete History
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs font-semibold gap-1 cursor-pointer"
                    onClick={handleDownloadEntryAttendanceExcel}
                  >
                    <Sun className="h-3.5 w-3.5 text-amber-600" /> Entry Only
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs font-semibold gap-1 cursor-pointer"
                    onClick={handleDownloadExitAttendanceExcel}
                  >
                    <Sunset className="h-3.5 w-3.5 text-orange-600" /> Exit Only
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 3. Full Master 30-Day Matrix & Filtered View */}
            <Card className="shadow-sm border bg-card">
              <CardHeader>
                <CardTitle className="font-display text-lg flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-purple-600" /> Master Matrix Sheets
                </CardTitle>
                <CardDescription>
                  Export the 30-day matrix table with full per-day columns, eligibility rates, and summary formulas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <Button
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold gap-2 cursor-pointer"
                  onClick={handleExport30Day}
                >
                  <FileSpreadsheet className="h-4 w-4" /> Download 30-Day Master (.xlsx)
                </Button>
                <Button
                  variant="outline"
                  className="w-full font-semibold text-xs gap-2 cursor-pointer"
                  onClick={handleExportFiltered}
                >
                  <FilterIcon className="h-3.5 w-3.5" /> Export Filtered View ({filteredParticipants.length})
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Dedicated Section: Interactive Attendance Reports & Filter View */}
          <Card className="shadow-sm border">
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <CardTitle className="font-display text-xl flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" /> Attendance Reports & Live Records
                  </CardTitle>
                  <CardDescription>
                    Browse attendance records with exact Entry and Exit timestamps in Indian Standard Time (IST).
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Date Scope Pills */}
                  <div className="inline-flex p-0.5 bg-muted rounded-lg border text-xs">
                    <button
                      type="button"
                      onClick={() => setReportDateScope("today")}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                        reportDateScope === "today" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground"
                      }`}
                    >
                      Today ({today})
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportDateScope("specific")}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                        reportDateScope === "specific" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground"
                      }`}
                    >
                      Specific Date
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportDateScope("range")}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                        reportDateScope === "range" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground"
                      }`}
                    >
                      Date Range
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportDateScope("all")}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                        reportDateScope === "all" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground"
                      }`}
                    >
                      All Records
                    </button>
                  </div>
                </div>
              </div>

              {/* Filters Bar */}
              <div className="grid gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search name or ID…"
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    className="pl-8 text-xs font-mono h-8"
                  />
                </div>

                {reportDateScope === "specific" && (
                  <Input
                    type="date"
                    value={reportSingleDate}
                    onChange={(e) => setReportSingleDate(e.target.value)}
                    className="text-xs font-mono h-8"
                  />
                )}

                {reportDateScope === "range" && (
                  <div className="flex items-center gap-1">
                    <Input
                      type="date"
                      value={reportStartDate}
                      onChange={(e) => setReportStartDate(e.target.value)}
                      className="text-xs font-mono h-8"
                    />
                    <span className="text-xs text-muted-foreground">—</span>
                    <Input
                      type="date"
                      value={reportEndDate}
                      onChange={(e) => setReportEndDate(e.target.value)}
                      className="text-xs font-mono h-8"
                    />
                  </div>
                )}

                <Select value={reportEntryFilter} onValueChange={(v) => setReportEntryFilter(v as any)}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue placeholder="Entry Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Entry: All</SelectItem>
                    <SelectItem value="present">Entry: Present</SelectItem>
                    <SelectItem value="missing">Entry: Missing</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={reportExitFilter} onValueChange={(v) => setReportExitFilter(v as any)}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue placeholder="Exit Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Exit: All</SelectItem>
                    <SelectItem value="present">Exit: Present</SelectItem>
                    <SelectItem value="missing">Exit: Missing</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={reportMethodFilter} onValueChange={(v) => setReportMethodFilter(v as any)}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue placeholder="Method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Method: All</SelectItem>
                    <SelectItem value="face">Face Verified</SelectItem>
                    <SelectItem value="qr">QR Scan</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="border-b bg-muted/40 uppercase font-semibold text-muted-foreground sticky top-0 bg-background z-10">
                    <tr>
                      <th className="py-2.5 px-3">Sl. No.</th>
                      <th className="py-2.5 px-3">Participant</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Entry Status</th>
                      <th className="py-2.5 px-3">Entry Time (IST)</th>
                      <th className="py-2.5 px-3">Exit Status</th>
                      <th className="py-2.5 px-3">Exit Time (IST)</th>
                      <th className="py-2.5 px-3">Verification Method</th>
                      <th className="py-2.5 px-3">Overall Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {!reportAttendanceRecords.length ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-muted-foreground font-sans">
                          No attendance records match the selected date scope and filters.
                        </td>
                      </tr>
                    ) : (
                      reportAttendanceRecords.map((r, idx) => (
                        <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 px-3 text-muted-foreground">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-sans">
                            <span className="font-bold text-foreground">{r.fullName}</span>
                            <span className="block text-[11px] font-mono text-muted-foreground">{r.participantCode}</span>
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground">{r.date}</td>
                          <td className="py-2.5 px-3">
                            <Badge variant={r.isEntry ? "default" : "secondary"} className={r.isEntry ? "bg-emerald-600 text-[10px]" : "text-[10px]"}>
                              {r.isEntry ? "Present" : "Missing"}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-foreground font-semibold">{r.entryTime}</td>
                          <td className="py-2.5 px-3">
                            <Badge variant={r.isExit ? "default" : "secondary"} className={r.isExit ? "bg-emerald-600 text-[10px]" : "text-[10px]"}>
                              {r.isExit ? "Present" : "Missing"}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-foreground font-semibold">{r.exitTime}</td>
                          <td className="py-2.5 px-3 text-muted-foreground">{r.method}</td>
                          <td className="py-2.5 px-3">
                            <Badge
                              className={`text-[10px] ${
                                r.overall === "Complete"
                                  ? "bg-emerald-700 text-white"
                                  : r.overall === "Entry Only"
                                  ? "bg-amber-600 text-white"
                                  : r.overall === "Exit Only"
                                  ? "bg-orange-600 text-white"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {r.overall}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Audit Logs Table */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="font-display text-xl flex items-center gap-2">
                <History className="h-5 w-5 text-primary" /> Security & Administrative Audit Trail
              </CardTitle>
              <CardDescription>
                Tamper-evident logs recording manual changes, QR code creations, verification updates, and settings changes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="border-b bg-muted/40 uppercase font-semibold text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 px-3">Actor ID</th>
                      <th className="py-2.5 px-3">Target</th>
                      <th className="py-2.5 px-3">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {!adminData?.auditLogs.length ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-muted-foreground">
                          No audit entries recorded yet.
                        </td>
                      </tr>
                    ) : (
                      adminData.auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-muted/30">
                          <td className="py-2.5 px-3 text-muted-foreground">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-foreground">{log.action}</td>
                          <td className="py-2.5 px-3 text-muted-foreground">{log.actor_id?.slice(0, 8)}…</td>
                          <td className="py-2.5 px-3 text-muted-foreground">{log.target_user?.slice(0, 8) ?? "-"}</td>
                          <td className="py-2.5 px-3 text-muted-foreground truncate max-w-xs">
                            {JSON.stringify(log.details)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 6: SETTINGS (SUPER ADMIN) */}
        {me?.isSuper && (
          <TabsContent value="settings" className="space-y-6">
            <Card className="max-w-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="font-display text-xl">Workshop Configuration</CardTitle>
                <CardDescription>Configure workshop parameters, dates, duration, and verification rules.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">Workshop Name</label>
                    <Input
                      value={settingsForm.name}
                      onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold">Workshop Start Date</label>
                      <Input
                        type="date"
                        value={settingsForm.startDate}
                        onChange={(e) => setSettingsForm({ ...settingsForm, startDate: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold">Duration (Days)</label>
                      <Input
                        type="number"
                        min={1}
                        max={120}
                        value={settingsForm.durationDays}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, durationDays: Number(e.target.value) })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold">QR Code Validity (Minutes)</label>
                      <Input
                        type="number"
                        min={1}
                        max={1440}
                        value={settingsForm.qrValidityMinutes}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, qrValidityMinutes: Number(e.target.value) })
                        }
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold">Low Attendance Threshold (%)</label>
                      <Input
                        type="number"
                        min={10}
                        max={100}
                        value={settingsForm.lowAttendanceThreshold}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            lowAttendanceThreshold: Number(e.target.value),
                          })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <input
                      type="checkbox"
                      id="require_selfie"
                      checked={settingsForm.requireSelfie}
                      onChange={(e) => setSettingsForm({ ...settingsForm, requireSelfie: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-primary"
                    />
                    <label htmlFor="require_selfie" className="text-sm font-semibold cursor-pointer">
                      Require Live Selfie Identity Verification for Attendance Check-in
                    </label>
                  </div>

                  <Button type="submit" disabled={settingsBusy} className="mt-4 font-bold">
                    {settingsBusy ? "Saving settings…" : "Save Configuration"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* MODAL: Manual Attendance Marking */}
      <Dialog open={manualModalOpen} onOpenChange={setManualModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Mark Attendance Manually</DialogTitle>
            <DialogDescription>
              Marking attendance manually overrides QR checks. A mandatory reason must be recorded for audit trail compliance.
            </DialogDescription>
          </DialogHeader>

          {manualTargetUser && (
            <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1">
              <p className="font-bold text-foreground">{manualTargetUser.full_name}</p>
              <p className="text-muted-foreground font-mono">{manualTargetUser.participant_code}</p>
            </div>
          )}

          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Workshop Session Date</label>
              <Input
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold">Attendance Status</label>
              <Select value={manualStatus} onValueChange={(v) => setManualStatus(v as "present" | "absent" | "excused")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="excused">Excused (Leaves Denominator)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold">Mandatory Reason / Remarks</label>
              <Input
                placeholder="e.g. Device camera issue during morning session, verified in person"
                value={manualRemarks}
                onChange={(e) => setManualRemarks(e.target.value)}
                required
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setManualModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleManualSubmit} disabled={manualBusy || !manualRemarks.trim()}>
              {manualBusy ? "Recording…" : "Save Attendance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Participant Profile Details */}
      {selectedParticipant && (
        <Dialog open={!!selectedParticipant} onOpenChange={() => setSelectedParticipant(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-display text-xl flex items-center gap-2">
                <User className="h-5 w-5 text-primary" /> Participant Details
              </DialogTitle>
            </DialogHeader>

            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 border-b pb-6">
              <div className="relative shrink-0">
                <ClickableAvatar
                  src={photoUrls[adminData?.profiles.find((p) => p.id === selectedParticipant.id)?.photo_path ?? ""]}
                  alt={selectedParticipant.full_name}
                  fullName={selectedParticipant.full_name}
                  participantCode={selectedParticipant.participant_code}
                  verificationStatus={selectedParticipant.verification_status}
                  fallback={selectedParticipant.full_name.slice(0, 2).toUpperCase()}
                  className="h-36 w-36 sm:h-40 sm:w-40 rounded-2xl border-2 border-primary/20 shadow-md"
                  fallbackClassName="text-3xl font-display"
                />
                <button
                  type="button"
                  onClick={() => {
                    setAdminPhotoTargetUser({
                      id: selectedParticipant.id,
                      full_name: selectedParticipant.full_name,
                    });
                    setAdminPhotoModalOpen(true);
                  }}
                  className="absolute -bottom-1 -right-1 h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-primary z-10"
                  title="Upload or change participant photograph"
                >
                  <Camera className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-base sm:text-lg font-bold truncate">{selectedParticipant.full_name}</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] gap-1 font-semibold text-primary border-primary/30 hover:bg-primary/10 shrink-0"
                    onClick={() => {
                      setAdminPhotoTargetUser({
                        id: selectedParticipant.id,
                        full_name: selectedParticipant.full_name,
                      });
                      setAdminPhotoModalOpen(true);
                    }}
                  >
                    <Camera className="h-2.5 w-2.5" />
                    {adminData?.profiles.find((p) => p.id === selectedParticipant.id)?.photo_path ? "Change Photo" : "Add Photo"}
                  </Button>
                </div>
                <p className="font-mono text-xs text-muted-foreground">{selectedParticipant.participant_code}</p>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2">
                  <Badge variant="outline" className="text-[11px] truncate max-w-[200px]">{selectedParticipant.email}</Badge>
                  <Badge variant="outline" className="text-[11px]">{selectedParticipant.phone}</Badge>
                  <Badge
                    className={
                      selectedParticipant.verification_status === "verified"
                        ? "bg-success text-success-foreground text-[10px]"
                        : selectedParticipant.verification_status === "rejected"
                        ? "bg-destructive text-destructive-foreground text-[10px]"
                        : "bg-warning text-warning-foreground text-[10px]"
                    }
                  >
                    {selectedParticipant.verification_status.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>

            {selectedParticipant.verification_status === "pending" && (
              <div className="flex flex-col sm:flex-row gap-3 p-3 bg-warning/10 rounded-xl border border-warning/30 items-start sm:items-center justify-between">
                <div>
                  <p className="font-bold text-xs text-warning-foreground">Verification Pending</p>
                  <p className="text-[11px] text-muted-foreground">Review registration details and approve or reject.</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto justify-end">
                  <Button
                    size="sm"
                    className="flex-1 sm:flex-none bg-success hover:bg-success/90 text-white font-bold"
                    onClick={() => handleVerifyRegistration(selectedParticipant.id, "verified")}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1 sm:flex-none font-bold"
                    onClick={() => handleVerifyRegistration(selectedParticipant.id, "rejected")}
                  >
                    <XCircle className="h-4 w-4 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="rounded-lg border p-2 bg-muted/20">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Present</span>
                  <p className="text-lg font-bold text-success">{selectedParticipant.summary.present}</p>
                </div>
                <div className="rounded-lg border p-2 bg-muted/20">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Absent</span>
                  <p className="text-lg font-bold text-destructive">{selectedParticipant.summary.absent}</p>
                </div>
                <div className="rounded-lg border p-2 bg-muted/20">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Current %</span>
                  <p className="text-lg font-bold font-mono">{selectedParticipant.summary.currentPct}%</p>
                </div>
                <div className="rounded-lg border p-2 bg-muted/20">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Final %</span>
                  <p className="text-lg font-bold font-mono">{selectedParticipant.summary.finalPct}%</p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                  Workshop Attendance Grid
                </h4>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                  {selectedParticipant.summary.states.map((st, idx) => (
                    <div
                      key={st.day}
                      className={`flex flex-col items-center justify-center p-1.5 rounded text-[10px] font-mono font-bold ${
                        st.state === "Present"
                          ? "bg-success text-success-foreground"
                          : st.state === "Absent"
                          ? "bg-destructive text-destructive-foreground"
                          : st.state === "Pending"
                          ? "bg-warning text-warning-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                      title={`${st.day}: ${st.state}`}
                    >
                      <span>D{idx + 1}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Account Management Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t pt-4">
                <span className="text-xs font-semibold text-muted-foreground">Account Actions:</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 sm:flex-none gap-1.5 text-xs text-primary hover:text-primary border-primary/30 hover:bg-primary/10 font-bold"
                    onClick={() => {
                      const photoPath = adminData?.profiles.find((x) => x.id === selectedParticipant.id)?.photo_path ?? "";
                      const photoUrl = selectedParticipant.id ? photoUrls[photoPath] : undefined;
                      setEditTargetUser({
                        id: selectedParticipant.id,
                        full_name: selectedParticipant.full_name,
                        participant_code: selectedParticipant.participant_code,
                        email: selectedParticipant.email,
                        phone: selectedParticipant.phone,
                        verification_status: selectedParticipant.verification_status,
                        remarks: undefined,
                        photo_url: photoUrl,
                      });
                    }}
                  >
                    <Edit className="h-3.5 w-3.5" /> Edit Details
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 sm:flex-none gap-1.5 text-xs text-emerald-700 hover:text-emerald-800 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-bold"
                    onClick={() => setDigitalIdTarget(selectedParticipant)}
                  >
                    <IdCard className="h-3.5 w-3.5 text-emerald-600" /> View Digital ID Card
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={downloadingPdfId === selectedParticipant.id}
                    className="flex-1 sm:flex-none gap-1.5 text-xs text-teal-700 hover:text-teal-800 border-teal-300 dark:border-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40 font-semibold"
                    onClick={() => handleDownloadParticipantPdf(selectedParticipant)}
                  >
                    {downloadingPdfId === selectedParticipant.id ? (
                      <RotateCw className="h-3.5 w-3.5 animate-spin text-teal-600" />
                    ) : (
                      <FileDown className="h-3.5 w-3.5 text-teal-600" />
                    )}
                    Download Pass PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 sm:flex-none gap-1.5 text-xs text-amber-700 hover:text-amber-800 border-amber-300"
                    onClick={() => {
                      setPasswordTargetUser({
                        id: selectedParticipant.id,
                        full_name: selectedParticipant.full_name,
                        participant_code: selectedParticipant.participant_code,
                        email: selectedParticipant.email,
                        phone: selectedParticipant.phone,
                        verification_status: selectedParticipant.verification_status,
                        photo_url: selectedParticipant.id
                          ? photoUrls[adminData?.profiles.find((x) => x.id === selectedParticipant.id)?.photo_path ?? ""]
                          : undefined,
                      });
                    }}
                  >
                    <KeyRound className="h-3.5 w-3.5" /> Change Password
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 sm:flex-none gap-1.5 text-xs text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => {
                      setDeleteTargetUser({
                        id: selectedParticipant.id,
                        full_name: selectedParticipant.full_name,
                        participant_code: selectedParticipant.participant_code,
                        email: selectedParticipant.email,
                        phone: selectedParticipant.phone,
                        photoUrl: selectedParticipant.id
                          ? photoUrls[adminData?.profiles.find((x) => x.id === selectedParticipant.id)?.photo_path ?? ""]
                          : undefined,
                      });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete Account
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Change Participant Password Dialog */}
      {passwordTargetUser && (
        <Suspense fallback={null}>
          <ChangeParticipantPasswordDialog
            open={!!passwordTargetUser}
            onOpenChange={(open) => !open && setPasswordTargetUser(null)}
            participant={passwordTargetUser}
            onSuccess={() => {
              void qc.invalidateQueries({ queryKey: ["admin_data"] });
              void refetch();
            }}
          />
        </Suspense>
      )}

      {/* Delete Participant Dialog */}
      {deleteTargetUser && (
        <Suspense fallback={null}>
          <DeleteParticipantDialog
            open={!!deleteTargetUser}
            onOpenChange={(open) => !open && setDeleteTargetUser(null)}
            participant={deleteTargetUser}
            onSuccess={() => {
              if (selectedParticipant?.id === deleteTargetUser?.id) {
                setSelectedParticipant(null);
              }
              void refetch();
            }}
          />
        </Suspense>
      )}

      {/* Digital Participant ID Card Preview & Export Dialog */}
      {digitalIdTarget && (
        <Suspense fallback={null}>
          <AdminDigitalIdDialog
            open={!!digitalIdTarget}
            onOpenChange={(open) => !open && setDigitalIdTarget(null)}
            participant={digitalIdTarget}
            settings={settings}
            photoUrl={
              digitalIdTarget?.id
                ? photoUrls[adminData?.profiles.find((x) => x.id === digitalIdTarget.id)?.photo_path ?? ""]
                : undefined
            }
          />
        </Suspense>
      )}

      {/* Admin Participant Photo Upload Dialog */}
      <Dialog open={adminPhotoModalOpen} onOpenChange={setAdminPhotoModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              {adminPhotoTargetUser?.full_name ? `Photograph for ${adminPhotoTargetUser.full_name}` : "Upload Photograph"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Upload or take a front-facing selfie photograph for this participant.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <PhotoCaptureInput
              value={adminSelectedPhoto}
              onChange={setAdminSelectedPhoto}
              disabled={adminUploadingPhoto}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setAdminPhotoModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!adminSelectedPhoto || adminUploadingPhoto}
              onClick={handleAdminSavePhoto}
              className="gap-2 font-bold"
            >
              {adminUploadingPhoto ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save Photograph"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attendee Details & Photograph Modal (Requirement 7) */}
      <Dialog open={!!viewingRecord} onOpenChange={(open) => !open && setViewingRecord(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Attendee Details & Verification</DialogTitle>
            <DialogDescription>
              Verified registration portrait and session attendance information.
            </DialogDescription>
          </DialogHeader>

          {viewingRecord && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-4 p-4 rounded-xl border bg-muted/20">
                <ClickableAvatar
                  src={viewingRecord.profile.photo_path ? photoUrls[viewingRecord.profile.photo_path] : undefined}
                  alt={viewingRecord.profile.full_name}
                  fullName={viewingRecord.profile.full_name}
                  participantCode={viewingRecord.profile.participant_code}
                  verificationStatus={viewingRecord.attendance?.status}
                  fallback={viewingRecord.profile.full_name.slice(0, 2).toUpperCase()}
                  className="h-28 w-28 sm:h-32 sm:w-32 rounded-2xl border-2 border-primary/20 shadow-sm shrink-0"
                  fallbackClassName="text-2xl font-bold"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <h4 className="font-display font-bold text-base text-foreground truncate">
                    {viewingRecord.profile.full_name}
                  </h4>
                  <p className="text-xs font-mono font-semibold text-primary">
                    {viewingRecord.profile.participant_code}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">{viewingRecord.profile.phone}</p>
                  <p className="text-xs text-muted-foreground truncate">{viewingRecord.profile.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg border bg-card space-y-1">
                  <span className="text-muted-foreground">Session Date:</span>
                  <p className="font-bold font-mono">{dailyDate}</p>
                </div>
                <div className="p-2.5 rounded-lg border bg-card space-y-1">
                  <span className="text-muted-foreground">Status:</span>
                  <p className="font-bold">
                    {viewingRecord.attendance?.status ? viewingRecord.attendance.status.toUpperCase() : "NOT MARKED"}
                  </p>
                </div>
                <div className="p-2.5 rounded-lg border bg-card space-y-1">
                  <span className="text-muted-foreground">Check-in Time:</span>
                  <p className="font-semibold">
                    {viewingRecord.attendance?.checked_in_at
                      ? new Date(viewingRecord.attendance.checked_in_at).toLocaleTimeString()
                      : "Not checked in"}
                  </p>
                </div>
                <div className="p-2.5 rounded-lg border bg-card space-y-1">
                  <span className="text-muted-foreground">Method:</span>
                  <p className="font-semibold">
                    {viewingRecord.attendance?.method === "qr_selfie" || viewingRecord.attendance?.method === "face"
                      ? "👤 Face Recognition (Biometric Verified)"
                      : viewingRecord.attendance?.method === "qr" || viewingRecord.attendance?.method === "qr_scan"
                      ? "📷 QR Scan"
                      : viewingRecord.attendance?.method === "manual"
                      ? "✍️ Authorized Manual Override"
                      : viewingRecord.attendance?.method || "—"}
                  </p>
                </div>
              </div>

              {viewingRecord.attendance?.remarks && (
                <div className="p-3 rounded-lg border bg-muted/40 text-xs">
                  <span className="text-muted-foreground font-semibold">Remarks: </span>
                  <span>{viewingRecord.attendance.remarks}</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setViewingRecord(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Register New Participant Dialog */}
      {registerDialogOpen && (
        <Suspense fallback={null}>
          <RegisterParticipantDialog
            open={registerDialogOpen}
            onOpenChange={setRegisterDialogOpen}
            onSuccess={() => {
              refetch();
            }}
            canApprove={me?.isStaff ?? false}
          />
        </Suspense>
      )}

      {/* ESDP Bulk Participant Registration Dialog */}
      {esdpBulkDialogOpen && (
        <Suspense fallback={null}>
          <BulkParticipantRegistrationDialog
            open={esdpBulkDialogOpen}
            onOpenChange={setEsdpBulkDialogOpen}
            onSuccess={() => {
              refetch();
            }}
          />
        </Suspense>
      )}

      {/* Edit Participant Details Dialog */}
      {editTargetUser && (
        <Suspense fallback={null}>
          <EditParticipantDialog
            open={!!editTargetUser}
            onOpenChange={(isOpen) => {
              if (!isOpen) setEditTargetUser(null);
            }}
            participant={editTargetUser}
            onSuccess={() => {
              void qc.invalidateQueries({ queryKey: ["admin_data"] });
              void refetch().then((res) => {
                if (selectedParticipant && editTargetUser && selectedParticipant.id === editTargetUser.id) {
                  const updated = res.data?.participantRows.find((x) => x.id === editTargetUser.id);
                  if (updated) setSelectedParticipant(updated);
                }
              });
            }}
          />
        </Suspense>
      )}

      {/* Live QR Attendance Scanner Popup Dialog (Direct camera scanning only) */}
      {qrScannerDialogOpen && (
        <Suspense fallback={null}>
          <AdminQrScannerDialog
            open={qrScannerDialogOpen}
            onOpenChange={setQrScannerDialogOpen}
            onAttendanceConfirmed={() => void refetch()}
            workshopName={settings?.name}
          />
        </Suspense>
      )}

      {/* Live Face Recognition Verification Popup Dialog (Direct face camera only) */}
      {faceRecognitionDialogOpen && (
        <Suspense fallback={null}>
          <AdminFaceRecognitionDialog
            open={faceRecognitionDialogOpen}
            onOpenChange={setFaceRecognitionDialogOpen}
            onAttendanceConfirmed={() => void refetch()}
            workshopName={settings?.name}
            approvedParticipants={adminData?.profiles?.filter((p) => p.verification_status === "verified")}
          />
        </Suspense>
      )}

      {/* Projector Fullscreen QR Display Modal */}
      <Dialog open={fullscreenQrOpen} onOpenChange={setFullscreenQrOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl h-[90vh] flex flex-col justify-between p-6 sm:p-10 bg-slate-950 text-white border-slate-800">
          <DialogHeader className="border-b border-slate-800 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-2xl font-black font-display tracking-tight text-white">
                  {settings?.name || "Workshop Attendance"}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400 font-mono mt-0.5">
                  Session Date: {today} • Scan with native camera to record attendance
                </DialogDescription>
              </div>
              {adminData?.activeQr && (
                <Badge variant="outline" className="font-mono text-xs px-3 py-1 bg-emerald-950/60 text-emerald-400 border-emerald-500/50 animate-pulse">
                  EXPIRING IN {Math.floor(timeLeftSec / 60)}m {timeLeftSec % 60}s
                </Badge>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 flex flex-col items-center justify-center py-6 space-y-6">
            {qrDataUrl && adminData?.activeQr ? (
              <>
                <div className="rounded-3xl border-8 border-slate-900 bg-white p-6 shadow-2xl">
                  <img src={qrDataUrl} alt="Projector QR Code" className="h-64 w-64 sm:h-80 sm:w-80 md:h-[360px] md:w-[360px]" />
                </div>
                <div className="text-center space-y-1">
                  <span className="text-xs uppercase font-mono tracking-widest text-slate-400 font-semibold">
                    Alternative 6-Digit Code
                  </span>
                  <div className="font-mono text-5xl sm:text-6xl font-extrabold tracking-widest text-emerald-400">
                    {adminData.activeQr.short_code}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-slate-400">No active QR code session.</div>
            )}
          </div>

          <DialogFooter className="flex-row items-center justify-between border-t border-slate-800 pt-4">
            <span className="text-xs text-slate-500 font-mono">
              Press ESC or Close to return
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleCopyQrUrl} className="text-xs bg-slate-900 border-slate-700 text-white cursor-pointer">
                <Copy className="h-3.5 w-3.5 mr-1" /> Copy URL
              </Button>
              <Button size="sm" variant="outline" onClick={handleDownloadQrPng} className="text-xs bg-slate-900 border-slate-700 text-white cursor-pointer">
                <Download className="h-3.5 w-3.5 mr-1" /> Download PNG
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setFullscreenQrOpen(false)} className="text-xs cursor-pointer">
                Close Projector View
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}
