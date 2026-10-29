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
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ParticipantAttendanceQrCard } from "@/components/dashboard/ParticipantAttendanceQrCard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  component: DashboardPage,
});

function DashboardPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: settings } = useSettings();
  const { data: attData } = useMyAttendance();

  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // Load signed avatar photo
  useEffect(() => {
    if (me?.profile?.photo_path) {
      void signedUrls("photos", [me.profile.photo_path]).then((map) => {
        const url = map[me.profile!.photo_path!];
        if (url) setPhotoUrl(url);
      });
    }
  }, [me?.profile?.photo_path]);

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
          <Avatar className="h-16 w-16 border-2 border-primary/20 shadow-sm">
            <AvatarImage src={photoUrl ?? undefined} alt={me?.profile?.full_name} className="object-cover" />
            <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
              {me?.profile?.full_name?.slice(0, 2).toUpperCase() ?? "SA"}
            </AvatarFallback>
          </Avatar>
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
            <p className="mt-1 text-sm text-muted-foreground flex items-center gap-2">
              <span>{settings?.name ?? "Workshop"}</span>
              <span>•</span>
              <span>Start: {settings?.start_date}</span>
              <span>•</span>
              <span>{settings?.duration_days ?? 30} Days Total</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {isApproved && (
            <Button variant="outline" size="sm" onClick={handleDownloadExcel} className="gap-2">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Download Report (.xlsx)
            </Button>
          )}
          {me?.isStaff && (
            <Button asChild size="sm" variant="default" className="gap-2">
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

          {/* Prominent My Attendance QR Section */}
          <ParticipantAttendanceQrCard
            participantId={me?.user?.id}
            fullName={me?.profile?.full_name}
            participantCode={me?.profile?.participant_code}
            photoUrl={photoUrl}
            verificationStatus={me?.profile?.verification_status}
            todayDate={today}
            isWorkshopDay={isWorkshopDay}
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
        </>
      )}
    </div>
  );
}
