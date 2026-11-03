import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSettings, useMyAttendance, signedUrls } from "@/lib/use-me";
import { todayLocal, workshopDays, addDays, formatIstTimestamp, extractExitTimestamp } from "@/lib/attendance";
import { generateIndividualReportWorkbook, downloadExcelFile } from "@/lib/excel";
import { StatusPill, DayCell } from "@/components/app/status";
import { QrCheckinDialog } from "@/components/app/qr-checkin-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ClickableAvatar } from "@/components/ui/profile-photo-lightbox";

// Lazy-load Digital Participant ID card to optimize critical page bundle
const DigitalParticipantIdCard = lazy(() =>
  import("@/components/id-card/DigitalParticipantIdCard").then((m) => ({
    default: m.DigitalParticipantIdCard,
  }))
);
import {
  CalendarDays,
  QrCode,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Clock,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Lock,
  Camera,
  RefreshCw,
  IdCard,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ParticipantAttendanceQrCard } from "@/components/dashboard/ParticipantAttendanceQrCard";
import { StudentChangePasswordDialog } from "@/components/dashboard/StudentChangePasswordDialog";
import { PhotoCaptureInput } from "@/components/auth/PhotoCaptureInput";
import { fileToBase64 } from "@/lib/image-validation";
import { uploadRegistrationPhoto } from "@/lib/lookup.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Event Management Portal" }],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: settings } = useSettings();
  const { data: attData } = useMyAttendance();

  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanSessionType, setScanSessionType] = useState<"entry" | "exit">("entry");
  const [idModalOpen, setIdModalOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  // Auto-detect QR token / code in URL when participant scans Projector QR with native camera
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const code = params.get("code");
    if (token || code) {
      setScanModalOpen(true);
    }
  }, []);

  // Load signed avatar photo
  useEffect(() => {
    if (me?.profile?.photo_path) {
      void signedUrls("photos", [me.profile.photo_path]).then((map) => {
        const url = map[me.profile!.photo_path!];
        if (url) setPhotoUrl(url);
      });
    } else {
      setPhotoUrl(null);
    }
  }, [me?.profile?.photo_path]);

  // Realtime subscription: instantaneously reflect attendance changes on participant dashboard
  useEffect(() => {
    if (!me?.user?.id) return;
    const channel = supabase
      .channel(`user-attendance-live-${me.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance",
          filter: `user_id=eq.${me.user.id}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["my_attendance"] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [me?.user?.id, qc]);

  const handleSavePhoto = async () => {
    if (!selectedPhoto || !me?.user?.id) return;
    setUploadingPhoto(true);
    try {
      const base64 = await fileToBase64(selectedPhoto);
      await uploadRegistrationPhoto({
        data: {
          userId: me.user.id,
          photoBase64: base64,
        },
      });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Profile photograph updated successfully!");
      setPhotoModalOpen(false);
      setSelectedPhoto(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to upload photo.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const today = todayLocal();
  const isWorkshopDay = settings ? workshopDays(settings).includes(today) : false;
  const todayRecord = attData?.records.find((r) => r.day_date === today);
  const summary = attData?.summary;
  const isApproved = me?.profile?.verification_status === "verified";
  const isPending = !me?.profile?.verification_status || me?.profile?.verification_status === "pending";
  const isRejected = me?.profile?.verification_status === "rejected";

  const entryPresent = Boolean(
    todayRecord &&
      (todayRecord.morning_status === "present" ||
        (todayRecord.status === "present" && !todayRecord.morning_status)),
  );
  const entryTime = todayRecord?.checked_in_at ? formatIstTimestamp(todayRecord.checked_in_at) : null;
  const exitPresent = Boolean(todayRecord && todayRecord.afternoon_status === "present");
  const exitTime = todayRecord ? extractExitTimestamp(todayRecord) : null;

  const digitalIdData = useMemo(() => {
    if (!me?.user || !me?.profile) return null;
    const startDate = settings?.start_date || "2026-11-01";
    const durationDays = settings?.duration_days || 30;
    const endDate = addDays(startDate, durationDays - 1);

    return {
      id: me.user.id,
      fullName: me.profile.full_name,
      participantCode: me.profile.participant_code,
      email: me.profile.email,
      phone: me.profile.phone,
      photoUrl,
      photoPath: me.profile.photo_path,
      verificationStatus: me.profile.verification_status,
      issueDate: me.profile.created_at
        ? new Date(me.profile.created_at).toISOString().slice(0, 10)
        : undefined,
      workshopName: settings?.name || "Workshop Attendance",
      startDate,
      endDate,
      durationDays,
      institutionName: "GrowIOTA Innovations",
    };
  }, [me, settings, photoUrl]);

  const digitalIdStats = useMemo(() => {
    if (!summary) return null;
    return {
      present: summary.present,
      absent: summary.absent,
      eligible: summary.eligible,
      total: summary.total,
      remaining: summary.remaining,
      currentPct: summary.currentPct,
      finalPct: summary.finalPct,
    };
  }, [summary]);

  const handleDownloadExcel = async () => {
    if (!me?.profile || !settings || !summary) return;
    try {
      const rawAttendance: Record<string, { status: string; checked_in_at: string; method: string; remarks?: string | null }> = {};
      attData.records.forEach((r) => {
        rawAttendance[r.day_date] = {
          status: r.status,
          checked_in_at: r.checked_in_at,
          method: r.method,
          remarks: r.remarks,
        };
      });

      const bytes = await generateIndividualReportWorkbook(
        {
          id: me.user.id,
          participant_code: me.profile.participant_code,
          full_name: me.profile.full_name,
          phone: me.profile.phone,
          email: me.profile.email,
          verification_status: me.profile.verification_status,
          summary,
          rawAttendance,
        },
        settings,
      );

      downloadExcelFile(bytes, `${me.profile.participant_code}_attendance_report.xlsx`);
      toast.success("Individual report downloaded.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to generate report.");
    }
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-8">
      {/* PENDING APPROVAL SCREEN */}
      {isPending && (
        <Card className="border-warning/40 bg-warning/5 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center p-8 sm:p-12 text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-warning/20 flex items-center justify-center text-warning">
              <Clock className="h-8 w-8 text-warning" />
            </div>
            <div className="space-y-2 max-w-md">
              <h2 className="font-display text-2xl font-bold text-foreground">
                Your Registration is Awaiting Admin Approval
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                An administrator is currently reviewing your registration details and profile photograph.
                Attendance check-in and your workshop calendar will be unlocked as soon as your account is approved.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Badge variant="outline" className="gap-1.5 text-xs py-1 px-3">
                <Lock className="h-3 w-3" /> Attendance Scanning Locked Until Verified
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* REJECTED SCREEN */}
      {isRejected && (
        <Card className="border-destructive/40 bg-destructive/5 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-3">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <h2 className="font-display text-xl font-bold text-destructive">Registration Rejected</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Your registration was reviewed and could not be approved. Please speak directly with a workshop organizer.
            </p>
          </CardContent>
        </Card>
      )}

      {/* APPROVED PARTICIPANT CONTENT - UNIFIED QR-FIRST DASHBOARD */}
      {isApproved && (
        <>
          {/* 1. PRIMARY HERO SECTION: MY ATTENDANCE QR (FRONT & CENTER) */}
          <ParticipantAttendanceQrCard
            participantId={me?.user?.id}
            fullName={me?.profile?.full_name}
            participantCode={me?.profile?.participant_code}
            photoUrl={photoUrl}
            verificationStatus={me?.profile?.verification_status}
            todayDate={today}
            isWorkshopDay={isWorkshopDay}
            isLastWorkshopDay={settings ? workshopDays(settings).slice(-1)[0] === today : false}
            todayRecord={todayRecord}
            workshopName={settings?.name}
            workshopStartDate={settings?.start_date}
            workshopDurationDays={settings?.duration_days}
            onOpenScanner={() => {
              setScanSessionType(entryPresent ? "exit" : "entry");
              setScanModalOpen(true);
            }}
            onOpenDigitalId={() => setIdModalOpen(true)}
            onDownloadExcel={handleDownloadExcel}
            onOpenPhotoModal={() => setPhotoModalOpen(true)}
            onOpenPasswordModal={() => setPasswordModalOpen(true)}
            isStaff={me?.isStaff}
            onAttendanceUpdated={() => {
              void qc.invalidateQueries({ queryKey: ["my_attendance"] });
            }}
          />

          {/* TWO SEPARATED ATTENDANCE ACTIONS: ENTRY & EXIT */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* ENTRY ATTENDANCE */}
            <Card className={`shadow-sm border-2 transition-all ${
              entryPresent ? "border-emerald-500/50 bg-emerald-500/5" : "border-primary/20 bg-card"
            }`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${entryPresent ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"}`}>
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="font-display text-base font-bold">ENTRY ATTENDANCE</CardTitle>
                      <CardDescription className="text-xs">Record your arrival check-in</CardDescription>
                    </div>
                  </div>
                  <Badge variant={entryPresent ? "default" : "secondary"} className={entryPresent ? "bg-emerald-600 font-mono text-xs" : "font-mono text-xs"}>
                    {entryPresent ? "PRESENT" : "NOT MARKED"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-2.5 rounded-lg bg-muted/40 text-xs font-mono space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Session Date:</span>
                    <span className="font-semibold">{today}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Entry Timestamp:</span>
                    <span className="font-semibold text-foreground">{entryTime || "—"}</span>
                  </div>
                </div>

                <Button
                  className={`w-full font-bold gap-2 ${
                    entryPresent
                      ? "bg-muted text-muted-foreground hover:bg-muted cursor-not-allowed"
                      : "bg-primary text-primary-foreground"
                  }`}
                  disabled={entryPresent || !isWorkshopDay}
                  onClick={() => {
                    setScanSessionType("entry");
                    setScanModalOpen(true);
                  }}
                >
                  <Camera className="h-4 w-4" />
                  {entryPresent ? "Entry Recorded" : "Mark Entry Attendance"}
                </Button>
              </CardContent>
            </Card>

            {/* EXIT ATTENDANCE */}
            <Card className={`shadow-sm border-2 transition-all ${
              exitPresent ? "border-emerald-500/50 bg-emerald-500/5" : "border-primary/20 bg-card"
            }`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${exitPresent ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"}`}>
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="font-display text-base font-bold">EXIT ATTENDANCE</CardTitle>
                      <CardDescription className="text-xs">Record your departure check-out</CardDescription>
                    </div>
                  </div>
                  <Badge variant={exitPresent ? "default" : "secondary"} className={exitPresent ? "bg-emerald-600 font-mono text-xs" : "font-mono text-xs"}>
                    {exitPresent ? "PRESENT" : "NOT MARKED"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-2.5 rounded-lg bg-muted/40 text-xs font-mono space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Session Date:</span>
                    <span className="font-semibold">{today}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Exit Timestamp:</span>
                    <span className="font-semibold text-foreground">{exitTime || "—"}</span>
                  </div>
                </div>

                <Button
                  className={`w-full font-bold gap-2 ${
                    exitPresent
                      ? "bg-muted text-muted-foreground hover:bg-muted cursor-not-allowed"
                      : !entryPresent
                      ? "bg-muted/70 text-muted-foreground cursor-not-allowed"
                      : "bg-primary text-primary-foreground"
                  }`}
                  disabled={exitPresent || !entryPresent || !isWorkshopDay}
                  onClick={() => {
                    setScanSessionType("exit");
                    setScanModalOpen(true);
                  }}
                >
                  <Camera className="h-4 w-4" />
                  {exitPresent
                    ? "Exit Recorded"
                    : !entryPresent
                    ? "Entry Required First"
                    : "Mark Exit Attendance"}
                </Button>
                {!entryPresent && !exitPresent && (
                  <p className="text-[11px] text-muted-foreground text-center">
                    Note: Entry attendance must be recorded before recording exit.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 2. ATTENDANCE METRICS KPI GRID */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Attendance Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold font-display">{summary?.currentPct ?? 0}%</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Based on {summary?.eligible ?? 0} eligible days so far
                </p>
                <Progress value={summary?.currentPct ?? 0} className="mt-3 h-2" />
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Present Days</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold font-display text-success">{summary?.present ?? 0}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Target: {settings?.duration_days ?? 30} days total ({summary?.finalPct ?? 0}% completed)
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Absent Days</CardTitle>
                <AlertCircle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold font-display text-destructive">{summary?.absent ?? 0}</div>
                <p className="mt-1 text-xs text-muted-foreground">Past workshop sessions missed</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Remaining Days</CardTitle>
                <Clock className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold font-display">{summary?.remaining ?? 30}</div>
                <p className="mt-1 text-xs text-muted-foreground">Future sessions left in the workshop</p>
              </CardContent>
            </Card>
          </div>

          {/* 3. LIVE WORKSHOP PROJECTOR QR SCAN BANNER (When applicable) */}
          {isApproved && isWorkshopDay && todayRecord?.status !== "present" && (
            <Card className="border-2 border-primary/40 bg-gradient-to-r from-primary/10 via-primary/5 to-card shadow-sm">
              <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 text-center sm:text-left">
                  <div className="h-12 w-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-md">
                    <Camera className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 justify-center sm:justify-start">
                      <h3 className="font-display text-base sm:text-lg font-bold text-foreground">
                        Live Session Attendance Check-In
                      </h3>
                      <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] font-semibold uppercase">
                        LIVE
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Scan the live rotating QR code projected on the venue screen, or enter the 6-character code.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => setScanModalOpen(true)}
                  className="w-full sm:w-auto shrink-0 gap-2 font-bold bg-primary text-primary-foreground shadow-sm px-6 h-10 hover:scale-[1.02] transition-transform text-xs sm:text-sm cursor-pointer"
                >
                  <Camera className="h-4 w-4" /> Scan Workshop QR Code
                </Button>
              </CardContent>
            </Card>
          )}

          {/* 4. SMART DIGITAL PARTICIPANT ID CARD SECTION */}
          {digitalIdData && (
            <Card className="shadow-sm border">
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-700 shrink-0">
                      <IdCard className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="font-display text-lg sm:text-xl font-bold">
                        Digital Participant ID Card
                      </CardTitle>
                      <CardDescription className="text-xs sm:text-sm">
                        Official attendee credential and access pass. Click the card or toggle sides to flip.
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <Suspense fallback={<div className="h-64 rounded-2xl bg-muted/20 animate-pulse flex items-center justify-center text-xs text-muted-foreground">Loading ID Card…</div>}>
                  <DigitalParticipantIdCard
                    data={digitalIdData}
                    stats={digitalIdStats}
                  />
                </Suspense>
              </CardContent>
            </Card>
          )}

          {/* 5. WORKSHOP ATTENDANCE CALENDAR */}
          <Card className="shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="font-display text-xl">Workshop Attendance Calendar</CardTitle>
                  <CardDescription>
                    Your complete workshop attendance timeline. Color coded by presence and review status.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-success" /> Present</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-warning" /> Pending</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-destructive" /> Absent</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Holiday</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-muted" /> Upcoming</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-10 gap-2.5">
                {summary?.states.map(({ day, state }, index) => (
                  <DayCell key={day} day={day} index={index} state={state} />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 6. ATTENDANCE HISTORY TABLE */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="font-display text-xl">Attendance History</CardTitle>
              <CardDescription>All recorded check-ins and verified sessions for your account.</CardDescription>
            </CardHeader>
            <CardContent>
              {!attData?.records.length ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No attendance records yet. Scan today's QR code to record your first check-in.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
                      <tr>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Method</th>
                        <th className="py-3 px-4">Check-in Time</th>
                        <th className="py-3 px-4">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {attData.records.map((r) => (
                        <tr key={r.id} className="hover:bg-muted/20">
                          <td className="py-3 px-4 font-mono font-medium">{r.day_date}</td>
                          <td className="py-3 px-4">
                            <StatusPill state={r.status === "present" ? "Present" : r.status === "pending" ? "Pending" : "Absent"} />
                          </td>
                          <td className="py-3 px-4 capitalize font-mono text-xs">{r.method.replace("_", " ")}</td>
                          <td className="py-3 px-4 text-xs text-muted-foreground">
                            {r.checked_in_at ? new Date(r.checked_in_at).toLocaleString() : "-"}
                          </td>
                          <td className="py-3 px-4 text-xs text-muted-foreground">{r.remarks || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Digital ID Card Popup Dialog (for header button click) */}
      <Dialog open={idModalOpen} onOpenChange={setIdModalOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6 w-[95vw] sm:w-full">
          <DialogHeader className="pb-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-700 shrink-0">
                <IdCard className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold font-display text-foreground">
                  Digital Participant ID Card
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Official attendee pass and dynamic attendance credential for {me?.profile?.full_name}.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {digitalIdData && (
            <div className="pt-2">
              <Suspense fallback={<div className="h-64 rounded-2xl bg-muted/20 animate-pulse flex items-center justify-center text-xs text-muted-foreground">Loading ID Card…</div>}>
                <DigitalParticipantIdCard
                  data={digitalIdData}
                  stats={digitalIdStats}
                />
              </Suspense>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* QR Check-in Modal */}
      <QrCheckinDialog
        open={scanModalOpen}
        onOpenChange={setScanModalOpen}
        requireSelfie={settings?.require_selfie}
        userId={me?.user?.id}
        sessionType={scanSessionType}
      />

      {/* Upload/Update Profile Photo Modal */}
      <Dialog open={photoModalOpen} onOpenChange={setPhotoModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" /> Update Profile Photograph
            </DialogTitle>
            <DialogDescription className="text-xs">
              Capture a selfie or upload a clear front-facing photograph for your profile and attendance records.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <PhotoCaptureInput
              value={selectedPhoto}
              onChange={setSelectedPhoto}
              disabled={uploadingPhoto}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setPhotoModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!selectedPhoto || uploadingPhoto}
              onClick={handleSavePhoto}
              className="gap-2 font-bold"
            >
              {uploadingPhoto ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" /> Uploading…
                </>
              ) : (
                "Save Photograph"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* STUDENT SELF-SERVE PASSWORD CHANGE DIALOG */}
      <StudentChangePasswordDialog
        open={passwordModalOpen}
        onOpenChange={setPasswordModalOpen}
        fullName={me?.profile?.full_name}
        participantCode={me?.profile?.participant_code}
      />
    </div>
  );
}
