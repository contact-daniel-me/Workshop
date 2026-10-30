import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMe, useSettings, useMyAttendance, signedUrls } from "@/lib/use-me";
import { todayLocal, workshopDays } from "@/lib/attendance";
import { generateIndividualReportWorkbook, downloadExcelFile } from "@/lib/excel";
import { StatusPill, DayCell } from "@/components/app/status";
import { QrCheckinDialog } from "@/components/app/qr-checkin-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ClickableAvatar } from "@/components/ui/profile-photo-lightbox";
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
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ParticipantAttendanceQrCard } from "@/components/dashboard/ParticipantAttendanceQrCard";
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
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
      {/* Top Welcome Profile Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <ClickableAvatar
              src={photoUrl}
              alt={me?.profile?.full_name}
              fullName={me?.profile?.full_name}
              participantCode={me?.profile?.participant_code}
              verificationStatus={me?.profile?.verification_status}
              fallback={me?.profile?.full_name?.slice(0, 2).toUpperCase() ?? "SA"}
              className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl border-2 border-primary/20 shadow-md"
              fallbackClassName="text-2xl font-display"
            />
            <button
              type="button"
              onClick={() => setPhotoModalOpen(true)}
              className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-primary z-10"
              title="Upload or change profile photograph"
            >
              <Camera className="h-4 w-4" />
            </button>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                Welcome, {me?.profile?.full_name ?? "Participant"}
              </h1>
              <Badge variant="outline" className="font-mono text-xs font-semibold bg-muted">
                {me?.profile?.participant_code ?? "SA-2026-..."}
              </Badge>
              <Badge
                className={
                  isApproved
                    ? "bg-success text-success-foreground"
                    : isRejected
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-warning text-warning-foreground"
                }
              >
                {me?.profile?.verification_status ? me.profile.verification_status.toUpperCase() : "PENDING APPROVAL"}
              </Badge>
            </div>
            {!photoUrl && (
              <button
                type="button"
                onClick={() => setPhotoModalOpen(true)}
                className="text-xs text-primary hover:underline font-semibold flex items-center gap-1.5 mt-1"
              >
                <Camera className="h-3.5 w-3.5" /> Upload Profile Photograph
              </button>
            )}
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span>{settings?.name ?? "Workshop"}</span>
              <span>•</span>
              <span>Start: {settings?.start_date}</span>
              <span>•</span>
              <span>{settings?.duration_days ?? 30} Days Total</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isApproved && isWorkshopDay && (
            <Button
              size="sm"
              onClick={() => setScanModalOpen(true)}
              className="gap-2 font-bold shadow-xs bg-primary text-primary-foreground hover:bg-primary/90 text-xs sm:text-sm"
            >
              <Camera className="h-4 w-4" /> Scan Workshop QR
            </Button>
          )}
          {isApproved && (
            <Button variant="outline" size="sm" onClick={handleDownloadExcel} className="gap-2 text-xs sm:text-sm">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Download Report (.xlsx)
            </Button>
          )}
          {me?.isStaff && (
            <Button asChild size="sm" variant="default" className="gap-2 text-xs sm:text-sm">
              <Link to="/admin">
                <ShieldCheck className="h-4 w-4" /> Admin Portal
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* REQUIREMENT 4: PENDING APPROVAL SCREEN */}
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

      {/* APPROVED PARTICIPANT CONTENT */}
      {isApproved && (
        <>
          {/* KPI Stats Grid */}
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

          {/* Live Workshop Projector QR Scan Banner */}
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
                  className="w-full sm:w-auto shrink-0 gap-2 font-bold bg-primary text-primary-foreground shadow-sm px-6 h-10 hover:scale-[1.02] transition-transform text-xs sm:text-sm"
                >
                  <Camera className="h-4 w-4" /> Scan Workshop QR Code
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Prominent My Attendance QR Section */}
          <ParticipantAttendanceQrCard
            participantId={me?.user?.id}
            fullName={me?.profile?.full_name}
            participantCode={me?.profile?.participant_code}
            photoUrl={photoUrl}
            verificationStatus={me?.profile?.verification_status}
            todayDate={today}
            isWorkshopDay={isWorkshopDay}
            isLastWorkshopDay={settings ? workshopDays(settings).slice(-1)[0] === today : false}
            onOpenScanner={() => setScanModalOpen(true)}
            onAttendanceUpdated={() => {
              void qc.invalidateQueries({ queryKey: ["my_attendance"] });
            }}
          />

          {/* Attendance Calendar Grid */}
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

          {/* Detailed Attendance History Table */}
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

          {/* QR Check-in Modal */}
          <QrCheckinDialog
            open={scanModalOpen}
            onOpenChange={setScanModalOpen}
            requireSelfie={settings?.require_selfie}
            userId={me?.user?.id}
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
        </>
      )}
    </div>
  );
}
