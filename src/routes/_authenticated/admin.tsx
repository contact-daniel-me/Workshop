import { useState, useEffect, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import QRCode from "qrcode";
import {
  useMe,
  useSettings,
  useAdminData,
  signedUrls,
} from "@/lib/use-me";
import { todayLocal, workshopDays } from "@/lib/attendance";
import {
  generate30DayWorkbook,
  generateDailyReportWorkbook,
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
  toggleStaffRole,
} from "@/lib/admin.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
} from "lucide-react";
import { RegisterParticipantDialog } from "@/components/admin/RegisterParticipantDialog";
import { AdminQrScannerTab } from "@/components/admin/AdminQrScannerTab";
import { ChangeParticipantPasswordDialog } from "@/components/admin/ChangeParticipantPasswordDialog";
import { DeleteParticipantDialog } from "@/components/admin/DeleteParticipantDialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  component: AdminPage,
});

function AdminPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useMe();
  const { data: settings } = useSettings();
  const { data: adminData, isLoading: dataLoading, refetch } = useAdminData();

  // Active Tab
  const [activeTab, setActiveTab] = useState("overview");

  // QR Display State
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [timeLeftSec, setTimeLeftSec] = useState<number>(0);
  const [generatingQr, setGeneratingQr] = useState(false);

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
  const [passwordTargetUser, setPasswordTargetUser] = useState<{ id: string; full_name: string; participant_code: string } | null>(null);
  const [deleteTargetUser, setDeleteTargetUser] = useState<{ id: string; full_name: string; participant_code: string; email?: string; phone?: string; photoUrl?: string | null } | null>(null);

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

  // Load photos for participants
  useEffect(() => {
    if (adminData?.profiles) {
      const paths = adminData.profiles.map((p) => p.photo_path).filter(Boolean);
      void signedUrls("photos", paths).then(setPhotoUrls);
    }
  }, [adminData?.profiles]);

  // Handle QR code generation for visual display
  useEffect(() => {
    const active = adminData?.activeQr;
    if (active) {
      void QRCode.toDataURL(active.token, {
        width: 380,
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
      setTimeLeftSec(0);
    }
  }, [adminData?.activeQr]);

  // Access check
  if (!meLoading && !me?.isStaff) {
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

  const today = todayLocal();
  const allDays = settings ? workshopDays(settings) : [];

  // KPI Calculations
  const totalRegistered = adminData?.profiles.length ?? 0;
  const verifiedCount = adminData?.profiles.filter((p) => p.verification_status === "verified").length ?? 0;
  const todayAttendance = adminData?.attendance.filter((a) => a.day_date === today) ?? [];
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
    if (!adminData) return { presentCount: 0, notMarkedCount: 0, totalApproved: 0, rate: 0, rows: [] };

    const approvedProfiles = adminData.profiles.filter((p) => p.verification_status === "verified");
    const attOnDate = adminData.attendance.filter((a) => a.day_date === dailyDate);
    const attByUserId = new Map(attOnDate.map((a) => [a.user_id, a]));

    const presentCount = attOnDate.filter((a) => a.status === "present").length;
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

        const matchesStatus =
          dailyStatusFilter === "all" ||
          (dailyStatusFilter === "present" && r.status === "present") ||
          (dailyStatusFilter === "not_marked" && r.status === "not_marked") ||
          (dailyStatusFilter === "pending" && r.status === "pending");

        return matchesSearch && matchesStatus;
      });

    return {
      presentCount,
      notMarkedCount,
      totalApproved,
      rate,
      rows,
    };
  }, [adminData, dailyDate, dailySearch, dailyStatusFilter]);

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

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-8">
      {/* Portal Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
              Attendance Administration
            </h1>
            <Badge className="bg-primary/20 text-primary font-mono text-xs">STAFF PORTAL</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {settings?.name || "Workshop Attendance"} • Management & Verification Console
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-2">
            <RotateCw className="h-4 w-4" /> Refresh Data
          </Button>
          <Button size="sm" onClick={handleExport30Day} className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white">
            <FileSpreadsheet className="h-4 w-4" /> Export All (.xlsx)
          </Button>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 h-auto p-1 bg-muted/60">
          <TabsTrigger value="overview" className="gap-1.5 py-2 text-xs">
            <BarChart3 className="h-3.5 w-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="scanner" className="gap-1.5 py-2 text-xs font-bold text-primary">
            <Camera className="h-3.5 w-3.5 text-primary" /> Scan QR
          </TabsTrigger>
          <TabsTrigger value="daily" className="gap-1.5 py-2 text-xs">
            <Calendar className="h-3.5 w-3.5" /> Daily Attendance
          </TabsTrigger>
          <TabsTrigger value="qr" className="gap-1.5 py-2 text-xs">
            <QrCode className="h-3.5 w-3.5" /> Projector QR
          </TabsTrigger>
          <TabsTrigger value="participants" className="gap-1.5 py-2 text-xs">
            <Users className="h-3.5 w-3.5" /> Participants ({totalRegistered})
          </TabsTrigger>
          <TabsTrigger value="selfies" className="gap-1.5 py-2 text-xs">
            <ShieldCheck className="h-3.5 w-3.5" /> Verifications {pendingSelfies > 0 && `(${pendingSelfies})`}
          </TabsTrigger>
          <TabsTrigger value="exports" className="gap-1.5 py-2 text-xs">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Reports
          </TabsTrigger>
          {me?.isSuper && (
            <TabsTrigger value="settings" className="gap-1.5 py-2 text-xs">
              <SettingsIcon className="h-3.5 w-3.5" /> Settings
            </TabsTrigger>
          )}
        </TabsList>

        {/* TAB 1: OVERVIEW & ANALYTICS */}
        <TabsContent value="overview" className="space-y-6">
          {/* 8 KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Registered</CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display">{totalRegistered}</div>
                <p className="text-[11px] text-muted-foreground mt-1">{verifiedCount} Identity Verified</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Present Today</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display text-success">{presentToday}</div>
                <p className="text-[11px] text-muted-foreground mt-1">{absentToday} Absent so far</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Today's Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display">{attendanceRateToday}%</div>
                <p className="text-[11px] text-muted-foreground mt-1">Of total registered</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Avg 30-Day Rate</CardTitle>
                <Calendar className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display">{avgAttendance}%</div>
                <p className="text-[11px] text-muted-foreground mt-1">Across all workshop days</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Pending Registration</CardTitle>
                <Clock className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display text-warning">{pendingRegistrations}</div>
                <p className="text-[11px] text-muted-foreground mt-1">Participants awaiting review</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Pending Selfies</CardTitle>
                <AlertTriangle className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display text-warning">{pendingSelfies}</div>
                <p className="text-[11px] text-muted-foreground mt-1">Attendance selfies to verify</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">QR Status</CardTitle>
                <QrCode className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold font-display flex items-center gap-1.5">
                  {adminData?.activeQr ? (
                    <span className="text-success flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-success animate-ping" /> Active ({timeLeftSec}s)
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No Active Code</span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Today: {today}</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Audit Trail</CardTitle>
                <History className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display">{adminData?.auditLogs.length ?? 0}</div>
                <p className="text-[11px] text-muted-foreground mt-1">Logged security events</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2 shadow-sm">
              <CardHeader>
                <CardTitle className="font-display text-lg">30-Day Attendance Trends</CardTitle>
                <CardDescription>Present vs Absent attendees per workshop day</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Bar dataKey="present" name="Present" fill="#16a34a" stackId="a" />
                    <Bar dataKey="pending" name="Pending" fill="#eab308" stackId="a" />
                    <Bar dataKey="absent" name="Absent" fill="#ef4444" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="font-display text-lg">Attendance Distribution</CardTitle>
                <CardDescription>Participant percentage brackets</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distributionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Participants" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB: SCAN QR ATTENDANCE (Camera & Manual Scanner) */}
        <TabsContent value="scanner" className="space-y-6">
          <AdminQrScannerTab
            workshopName={settings?.name}
            onAttendanceConfirmed={() => void refetch()}
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
                    <SelectValue placeholder="Attendance Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Attendees</SelectItem>
                    <SelectItem value="present">Present ({dailyAttendanceStats.presentCount})</SelectItem>
                    <SelectItem value="not_marked">Not Yet Marked ({dailyAttendanceStats.notMarkedCount})</SelectItem>
                    <SelectItem value="pending">Pending Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
          </Card>

          {/* 4 KPI Cards for the Selected Session Date */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Approved Participants</CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display">{dailyAttendanceStats.totalApproved}</div>
                <p className="text-[11px] text-muted-foreground mt-1">Eligible for attendance</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Present Count</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display text-success">{dailyAttendanceStats.presentCount}</div>
                <p className="text-[11px] text-muted-foreground mt-1">Recorded on {dailyDate}</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Not Yet Marked</CardTitle>
                <Clock className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display text-warning">{dailyAttendanceStats.notMarkedCount}</div>
                <p className="text-[11px] text-muted-foreground mt-1">Attendees still pending</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
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
                                <Avatar className="h-9 w-9 border">
                                  <AvatarImage src={photoUrl} alt={prof.full_name} className="object-cover" />
                                  <AvatarFallback className="font-bold text-xs bg-primary/10 text-primary">
                                    {prof.full_name.slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
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
                                <Badge variant="outline" className="text-[10px] uppercase font-mono bg-muted/30">
                                  {att.method === "qr" || att.method === "qr_scan" ? "QR Scan" : att.method === "manual" ? "Manual Override" : att.method}
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

                <div className="flex items-center gap-3 pt-4 w-full">
                  <Button
                    onClick={handleGenerateQr}
                    disabled={generatingQr}
                    className="flex-1 gap-2 font-bold"
                  >
                    <RotateCw className={`h-4 w-4 ${generatingQr ? "animate-spin" : ""}`} />
                    {adminData?.activeQr ? "Regenerate / Rotate QR" : "Generate Today's QR Code"}
                  </Button>
                  {adminData?.activeQr && (
                    <Button
                      variant="destructive"
                      onClick={() => handleRevokeQr(adminData.activeQr!.id)}
                      className="gap-2"
                    >
                      <XCircle className="h-4 w-4" /> Revoke
                    </Button>
                  )}
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
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={prof?.photo_path ? photoUrls[prof.photo_path] : undefined} />
                            <AvatarFallback>{prof?.full_name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
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
                    onClick={() => setRegisterDialogOpen(true)}
                    className="gap-2 font-bold shadow-xs"
                  >
                    <UserPlus className="h-4 w-4" /> Register New Participant
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
                                <Avatar className="h-9 w-9">
                                  <AvatarImage src={p.id ? photoUrls[adminData.profiles.find((x) => x.id === p.id)?.photo_path ?? ""] : undefined} />
                                  <AvatarFallback>{p.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                                </Avatar>
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
                                  className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                                  title="Change Password"
                                  onClick={() =>
                                    setPasswordTargetUser({
                                      id: p.id,
                                      full_name: p.full_name,
                                      participant_code: p.participant_code,
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
                                <div className="mt-1 aspect-square rounded-lg border bg-muted/40 overflow-hidden">
                                  {prof?.photo_path && photoUrls[prof.photo_path] ? (
                                    <img src={photoUrls[prof.photo_path]} alt="Reference" className="h-full w-full object-cover" />
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
                                <div className="mt-1 aspect-square rounded-lg border bg-muted/40 overflow-hidden">
                                  {att.selfie_path && photoUrls[att.selfie_path] ? (
                                    <img src={photoUrls[att.selfie_path]} alt="Selfie" className="h-full w-full object-cover" />
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

        {/* TAB 5: EXCEL EXPORTS & AUDIT */}
        <TabsContent value="exports" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="font-display text-lg flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600" /> Full Master Attendance Sheet
                </CardTitle>
                <CardDescription>
                  Full grid of all participants, Day 1 to Day 30 columns, total calculations, and summary statistics.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold" onClick={handleExport30Day}>
                  Download Master (.xlsx)
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="font-display text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" /> Daily Attendance Report
                </CardTitle>
                <CardDescription>
                  Detailed attendance report for today ({today}), check-in timestamps, methods, and verified flags.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full font-bold" onClick={handleExportDaily}>
                  Download Today's Report (.xlsx)
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="font-display text-lg flex items-center gap-2">
                  <FilterIcon className="h-5 w-5 text-primary" /> Filtered View Export
                </CardTitle>
                <CardDescription>
                  Exports only the {filteredParticipants.length} participants matching the current filters and search.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full font-bold" onClick={handleExportFiltered}>
                  Export Filtered View (.xlsx)
                </Button>
              </CardContent>
            </Card>
          </div>

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

            <div className="flex items-center gap-4 border-b pb-4">
              <Avatar className="h-16 w-16">
                <AvatarImage
                  src={photoUrls[adminData?.profiles.find((p) => p.id === selectedParticipant.id)?.photo_path ?? ""]}
                />
                <AvatarFallback>{selectedParticipant.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="font-display text-lg font-bold">{selectedParticipant.full_name}</h3>
                <p className="font-mono text-xs text-muted-foreground">{selectedParticipant.participant_code}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline">{selectedParticipant.email}</Badge>
                  <Badge variant="outline">{selectedParticipant.phone}</Badge>
                  <Badge
                    className={
                      selectedParticipant.verification_status === "verified"
                        ? "bg-success text-success-foreground"
                        : selectedParticipant.verification_status === "rejected"
                        ? "bg-destructive text-destructive-foreground"
                        : "bg-warning text-warning-foreground"
                    }
                  >
                    {selectedParticipant.verification_status.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>

            {selectedParticipant.verification_status === "pending" && (
              <div className="flex gap-3 p-3 bg-warning/10 rounded-xl border border-warning/30 items-center justify-between">
                <div>
                  <p className="font-bold text-xs text-warning-foreground">Verification Pending</p>
                  <p className="text-[11px] text-muted-foreground">Review registration details and approve or reject.</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-success hover:bg-success/90 text-white font-bold"
                    onClick={() => handleVerifyRegistration(selectedParticipant.id, "verified")}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="font-bold"
                    onClick={() => handleVerifyRegistration(selectedParticipant.id, "rejected")}
                  >
                    <XCircle className="h-4 w-4 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-4 gap-2 text-center">
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
                <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5">
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

              {me?.isSuper && (
                <div className="flex items-center justify-between border-t pt-4">
                  <span className="text-xs font-semibold text-muted-foreground">Admin Privileges:</span>
                  <Button
                    size="sm"
                    variant={adminData?.rolesByUser.get(selectedParticipant.id)?.includes("attendance_admin") ? "destructive" : "outline"}
                    onClick={async () => {
                      const hasAdmin = adminData?.rolesByUser.get(selectedParticipant.id)?.includes("attendance_admin");
                      await toggleStaffRole({
                        data: {
                          targetUserId: selectedParticipant.id,
                          makeStaff: !hasAdmin,
                        },
                      });
                      toast.success(hasAdmin ? "Staff role removed" : "Promoted to Attendance Admin");
                      await refetch();
                    }}
                  >
                    {adminData?.rolesByUser.get(selectedParticipant.id)?.includes("attendance_admin")
                      ? "Revoke Staff Role"
                      : "Promote to Attendance Admin"}
                  </Button>
                </div>
              )}

              {/* Account Management Actions */}
              <div className="flex items-center justify-between border-t pt-4">
                <span className="text-xs font-semibold text-muted-foreground">Account Actions:</span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs text-amber-700 hover:text-amber-800 border-amber-300"
                    onClick={() => {
                      setPasswordTargetUser({
                        id: selectedParticipant.id,
                        full_name: selectedParticipant.full_name,
                        participant_code: selectedParticipant.participant_code,
                      });
                    }}
                  >
                    <KeyRound className="h-3.5 w-3.5" /> Change Password
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
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
      <ChangeParticipantPasswordDialog
        open={!!passwordTargetUser}
        onOpenChange={(open) => !open && setPasswordTargetUser(null)}
        participant={passwordTargetUser}
        onSuccess={() => {
          void refetch();
        }}
      />

      {/* Delete Participant Dialog */}
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
                <Avatar className="h-20 w-20 rounded-xl border-2 border-primary/20 shadow-sm shrink-0">
                  <AvatarImage
                    src={viewingRecord.profile.photo_path ? photoUrls[viewingRecord.profile.photo_path] : undefined}
                    alt={viewingRecord.profile.full_name}
                    className="object-cover"
                  />
                  <AvatarFallback className="font-bold text-lg bg-primary/10 text-primary">
                    {viewingRecord.profile.full_name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
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
                    {viewingRecord.attendance?.method === "qr" || viewingRecord.attendance?.method === "qr_scan"
                      ? "QR Scan"
                      : viewingRecord.attendance?.method === "manual"
                      ? "Authorized Manual Override"
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
      <RegisterParticipantDialog
        open={registerDialogOpen}
        onOpenChange={setRegisterDialogOpen}
        onSuccess={() => {
          refetch();
        }}
        canApprove={me?.isStaff ?? false}
      />
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
