import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import QRCode from "qrcode";
import { getParticipantDailyQr, type ParticipantQrResponse } from "@/lib/attendance-qr.server";
import { getNextSessionUnlockTime } from "@/lib/attendance";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ClickableAvatar } from "@/components/ui/profile-photo-lightbox";
import {
  QrCode,
  CheckCircle2,
  Clock,
  RefreshCw,
  ShieldCheck,
  CalendarDays,
  Camera,
  IdCard,
  FileSpreadsheet,
  Copy,
  Check,
  HelpCircle,
  Info,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  participantId?: string;
  fullName?: string;
  participantCode?: string;
  photoUrl?: string | null;
  verificationStatus?: string;
  todayDate: string;
  isWorkshopDay: boolean;
  isLastWorkshopDay?: boolean;
  todayRecord?: {
    status: string;
    checked_in_at?: string | null;
    morning_status?: string | null;
    afternoon_status?: string | null;
    remarks?: string | null;
  } | null;
  workshopName?: string;
  workshopStartDate?: string;
  workshopDurationDays?: number;
  onAttendanceUpdated?: () => void;
  onOpenScanner?: () => void;
  onOpenDigitalId?: () => void;
  onDownloadExcel?: () => void;
  onOpenPhotoModal?: () => void;
  onOpenPasswordModal?: () => void;
  isStaff?: boolean;
}

function QrCountdownBadge({
  expiresAt,
  onExpire,
}: {
  expiresAt?: string | null;
  onExpire: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(() => {
    if (!expiresAt) return 0;
    return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onExpire();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formatted = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <div className="pt-2">
      <div className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-muted-foreground bg-card border px-3 py-1 rounded-full shadow-xs">
        <Clock className="h-3.5 w-3.5 text-primary" />
        <span>Valid for: </span>
        <span className={timeLeft < 120 ? "text-destructive font-bold" : "text-foreground font-bold"}>
          {formatted}
        </span>
      </div>
    </div>
  );
}

function UnlockCountdownText({
  targetIso,
  onUnlock,
}: {
  targetIso: string | null;
  onUnlock: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(() => {
    if (!targetIso) return 0;
    return Math.max(0, Math.floor((new Date(targetIso).getTime() - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!targetIso) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(targetIso).getTime() - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onUnlock();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [targetIso, onUnlock]);

  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);

  return (
    <div className="text-[11px] text-muted-foreground font-mono bg-card px-3 py-1 rounded-full border">
      Next QR unlocks in {hours}h {minutes}m
    </div>
  );
}

export function ParticipantAttendanceQrCard({
  participantId,
  fullName = "Participant",
  participantCode = "SA-2026",
  photoUrl,
  verificationStatus = "verified",
  todayDate,
  isWorkshopDay,
  isLastWorkshopDay = false,
  todayRecord,
  workshopName,
  workshopStartDate,
  workshopDurationDays = 30,
  onAttendanceUpdated,
  onOpenScanner,
  onOpenDigitalId,
  onDownloadExcel,
  onOpenPhotoModal,
  onOpenPasswordModal,
  isStaff = false,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [qrData, setQrData] = useState<ParticipantQrResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoModalOpen, setInfoModalOpen] = useState(false);

  const isApproved = verificationStatus === "verified";

  // Fetch or retrieve participant's daily QR code
  const fetchDailyQr = useCallback(
    async (isRefresh = false) => {
      if (!isApproved || !isWorkshopDay || !participantId) return;
      setLoading(true);
      setErrorMsg(null);

      try {
        const res = await getParticipantDailyQr({
          data: { participantId },
        });

        setQrData(res);

        if (res.ok) {
          if (res.code === "ACTIVE_QR" && res.token) {
            const url = await QRCode.toDataURL(res.token, {
              width: 320,
              margin: 2,
              color: {
                dark: "#042f2e", // Deep brand teal
                light: "#ffffff",
              },
            });
            setQrDataUrl(url);

            if (isRefresh) {
              toast.success("Attendance QR refreshed!");
            }
          } else if (res.code === "ALREADY_PRESENT") {
            onAttendanceUpdated?.();
          }
        } else {
          if (res.code !== "LOCKED_UNTIL_SESSION_TIME") {
            setErrorMsg(res.message);
          }
        }
      } catch (err: unknown) {
        const rawMsg = err instanceof Error ? err.message : "Failed to load attendance QR";
        const msg =
          rawMsg.includes("Failed to fetch") || rawMsg.includes("fetch")
            ? "Connection interrupted. Tap refresh to load today's attendance QR code."
            : rawMsg;
        setErrorMsg(msg);
      } finally {
        setLoading(false);
      }
    },
    [participantId, isApproved, isWorkshopDay, onAttendanceUpdated]
  );

  // Initial load
  useEffect(() => {
    void fetchDailyQr();
  }, [fetchDailyQr]);

  // Immediately re-sync when attendance changes
  useEffect(() => {
    if (todayRecord?.status === "present" && !qrData?.entryMarked) {
      void fetchDailyQr();
    }
  }, [todayRecord?.status, todayRecord?.morning_status, todayRecord?.afternoon_status, qrData?.entryMarked, fetchDailyQr]);

  const entryPresent = Boolean(
    qrData?.entryMarked ??
      (todayRecord &&
        (todayRecord.morning_status === "present" ||
          (todayRecord.status === "present" && !todayRecord.morning_status)))
  );
  const exitPresent = Boolean(qrData?.exitMarked ?? (todayRecord && todayRecord.afternoon_status === "present"));
  const isFullyComplete = entryPresent && exitPresent;
  const isAlreadyPresent = isFullyComplete || qrData?.code === "ALREADY_PRESENT";
  const isLockedUntilNoon = qrData?.code === "LOCKED_UNTIL_SESSION_TIME";

  const unlockTargetIso =
    qrData?.unlocksAt ||
    (isAlreadyPresent
      ? getNextSessionUnlockTime(todayDate, true)
      : isLockedUntilNoon
      ? getNextSessionUnlockTime(todayDate, false)
      : null);

  const handleCopyCode = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success(`Copied code: ${code}`);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <Card className="overflow-hidden border border-border/80 bg-card rounded-2xl shadow-sm">
      {/* Card Header: Brand identity & Today's Attendance State */}
      <CardHeader className="border-b bg-muted/30 py-3.5 px-5 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <QrCode className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="font-display text-lg sm:text-xl font-bold flex items-center gap-2">
                <span>My Attendance QR</span>
                <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-mono uppercase tracking-wider">
                  DAILY TOKEN
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Session Date: <span className="font-mono font-semibold text-foreground">{todayDate}</span>
                {workshopName && <span> • {workshopName}</span>}
              </CardDescription>
            </div>
          </div>

          {/* Today's Status Badge */}
          <div className="flex items-center gap-2 flex-wrap">
            {isFullyComplete ? (
              <Badge className="bg-emerald-600 text-white gap-1.5 px-3 py-1 font-semibold text-xs shadow-2xs">
                <CheckCircle2 className="h-3.5 w-3.5" /> Both Completed (Present)
              </Badge>
            ) : entryPresent ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge className="bg-emerald-600 text-white gap-1 px-2.5 py-0.5 font-semibold text-xs">
                  <CheckCircle2 className="h-3 w-3" /> Entry Recorded
                </Badge>
                <Badge variant="outline" className="border-purple-400 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 gap-1 px-2.5 py-0.5 font-semibold text-xs animate-pulse">
                  <Clock className="h-3 w-3" /> Exit Pending
                </Badge>
              </div>
            ) : isLockedUntilNoon ? (
              <Badge variant="outline" className="border-primary/40 bg-primary/5 text-primary gap-1.5 px-3 py-1 font-semibold text-xs">
                <Clock className="h-3.5 w-3.5 text-primary" /> Opens at 12:00 AM
              </Badge>
            ) : isWorkshopDay ? (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 gap-1.5 px-3 py-1 font-semibold text-xs">
                <Clock className="h-3.5 w-3.5 text-amber-600" /> Attendance Not Marked
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                No Session Today
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 sm:p-6">
        {/* Two-Column Layout on Desktop, Mobile-First (QR Code appears first on mobile) */}
        <div className="flex flex-col-reverse lg:flex-row items-center lg:items-stretch justify-between gap-6 lg:gap-8">
          {/* LEFT COLUMN: Participant Information & Attendance Actions (Vertically Centered) */}
          <div className="flex-1 flex flex-col justify-center space-y-4 sm:space-y-5 w-full self-stretch py-1">
            {/* Participant Profile Details Card */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-xl border bg-muted/20">
              <div className="relative shrink-0">
                <ClickableAvatar
                  src={photoUrl}
                  alt={fullName}
                  fullName={fullName}
                  participantCode={participantCode}
                  verificationStatus={verificationStatus}
                  fallback={fullName.slice(0, 2).toUpperCase()}
                  className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl border-2 border-primary/20 shadow-xs object-cover"
                  fallbackClassName="text-2xl font-bold bg-muted text-foreground"
                />
                {onOpenPhotoModal && (
                  <button
                    type="button"
                    onClick={onOpenPhotoModal}
                    className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:scale-110 transition-transform cursor-pointer z-10"
                    title="Upload or change profile photograph"
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-display text-xl sm:text-2xl font-bold text-foreground truncate">
                    {fullName}
                  </h3>
                  <Badge variant="outline" className="font-mono text-xs font-semibold bg-card border">
                    {participantCode}
                  </Badge>
                  <Badge
                    className={
                      isApproved
                        ? "bg-success text-success-foreground font-semibold text-[11px]"
                        : "bg-warning text-warning-foreground font-semibold text-[11px]"
                    }
                  >
                    {verificationStatus.toUpperCase()}
                  </Badge>
                </div>

                {/* Workshop details line */}
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                  <span>{workshopName || "Workshop"}</span>
                  {workshopStartDate && (
                    <>
                      <span>•</span>
                      <span>Start: {workshopStartDate}</span>
                    </>
                  )}
                  <span>•</span>
                  <span>{workshopDurationDays} Days Total</span>
                </p>

                {/* Today's status alert / callout */}
                <div className="pt-1">
                  {isFullyComplete ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 text-xs font-medium">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>
                        Both Entry & Exit verified present for today. Full attendance recorded!
                      </span>
                    </div>
                  ) : entryPresent ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-500/10 text-purple-800 dark:text-purple-300 border border-purple-500/20 text-xs font-medium">
                      <Clock className="h-4 w-4 text-purple-600 shrink-0" />
                      <span>
                        Entry attendance recorded. Present QR code below to record <strong>Exit Attendance (Check-out)</strong>.
                      </span>
                    </div>
                  ) : isLockedUntilNoon ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 text-xs font-medium">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span>Today's session opens at 12:00 AM. QR unlocks automatically.</span>
                    </div>
                  ) : isWorkshopDay ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 text-xs font-medium">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span>Present this QR code to the workshop administrator to check in (Entry Attendance).</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-muted text-muted-foreground border text-xs">
                      <CalendarDays className="h-4 w-4 shrink-0" />
                      <span>No workshop session scheduled for today.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Attendance Actions: Clean Horizontal Row */}
            <div className="space-y-2 pt-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Attendance Actions
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                {onOpenScanner && isApproved && isWorkshopDay && (
                  <Button
                    size="sm"
                    onClick={onOpenScanner}
                    className="h-10 px-4 rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary/90 gap-2 shadow-xs cursor-pointer text-xs sm:text-sm"
                  >
                    <Camera className="h-4 w-4 shrink-0" />
                    <span>Scan Presenter Screen / Enter Code</span>
                  </Button>
                )}

                {onOpenDigitalId && (
                  <Button
                    size="sm"
                    onClick={onOpenDigitalId}
                    className="h-10 px-4 rounded-xl font-bold bg-emerald-700 hover:bg-emerald-800 text-white gap-2 shadow-xs cursor-pointer text-xs sm:text-sm"
                  >
                    <IdCard className="h-4 w-4 text-white shrink-0" />
                    <span className="text-white">My Digital ID</span>
                  </Button>
                )}

                {onDownloadExcel && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onDownloadExcel}
                    className="h-10 px-4 rounded-xl font-semibold gap-2 border-border hover:bg-muted text-foreground cursor-pointer text-xs sm:text-sm"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Download Attendance Report</span>
                  </Button>
                )}

                {onOpenPasswordModal && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenPasswordModal}
                    className="h-10 px-4 rounded-xl font-semibold gap-2 border-border hover:bg-muted text-foreground cursor-pointer text-xs sm:text-sm"
                  >
                    <KeyRound className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Change Password</span>
                  </Button>
                )}

                {isStaff && (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-10 px-4 rounded-xl font-semibold gap-2 border-border text-foreground text-xs sm:text-sm"
                  >
                    <Link to="/admin">
                      <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                      <span>Admin Portal</span>
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            {/* Compact Attendance Guidance */}
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-muted/30 border border-border/50 text-xs text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              <span>
                {isAlreadyPresent ? (
                  <>Attendance recorded for today. You can view your digital pass or export attendance records at any time.</>
                ) : (
                  <>Present your QR code on the right to the workshop administrator, or tap <strong className="text-foreground font-semibold">Scan Presenter Screen</strong> to check in with the venue display.</>
                )}
              </span>
            </div>
          </div>

          {/* RIGHT COLUMN: Primary Attendance QR Code Card (Strongest Visual Emphasis) */}
          <div className="flex flex-col items-center justify-center shrink-0 w-full lg:w-auto">
            <div className="flex flex-col items-center justify-center p-4 sm:p-5 bg-muted/20 rounded-2xl border-2 border-primary/20 w-full sm:w-[320px] shrink-0 space-y-3 shadow-xs">
              {isFullyComplete ? (
                /* Verified Both Entry and Exit Present State */
                <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
                  <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center shadow-inner">
                    <CheckCircle2 className="h-9 w-9" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-display text-lg font-bold text-foreground">Attendance Completed!</h4>
                    <p className="text-xs text-muted-foreground">
                      Both <strong className="text-emerald-600">Entry</strong> and <strong className="text-purple-600">Exit</strong> attendance are recorded for today.
                    </p>
                  </div>
                  {!isLastWorkshopDay && (
                    <UnlockCountdownText
                      targetIso={unlockTargetIso}
                      onUnlock={() => void fetchDailyQr(true)}
                    />
                  )}
                </div>
              ) : isLockedUntilNoon ? (
                /* Locked Until Midnight State */
                <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
                  <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <Clock className="h-7 w-7" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-display text-base font-bold text-foreground">Session Opens at 12:00 AM</h4>
                    <p className="text-xs text-muted-foreground">Your attendance QR will unlock automatically.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void fetchDailyQr(true)}
                    disabled={loading}
                    className="h-8 text-xs gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh Status
                  </Button>
                </div>
              ) : !isWorkshopDay ? (
                /* No Session State */
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                  <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                    <CalendarDays className="h-7 w-7" />
                  </div>
                  <h4 className="font-display text-base font-bold text-foreground">No Session Today</h4>
                  <p className="text-xs text-muted-foreground">Scheduled workshop days only.</p>
                </div>
              ) : (
                /* Active Dynamic QR Code Pass */
                <>
                  <div className="relative rounded-2xl border-2 border-primary/30 bg-white p-3 shadow-md inline-block">
                    {loading && !qrDataUrl ? (
                      <div className="h-52 w-52 sm:h-56 sm:w-56 flex flex-col items-center justify-center gap-2 bg-muted/20 rounded-xl">
                        <RefreshCw className="h-7 w-7 animate-spin text-primary" />
                        <span className="text-xs font-mono text-muted-foreground">Generating QR…</span>
                      </div>
                    ) : qrDataUrl ? (
                      <button
                        type="button"
                        onClick={() => setInfoModalOpen(true)}
                        className="cursor-pointer group relative block focus:outline-hidden"
                        title="Click to view attendance verification instructions"
                      >
                        <img
                          src={qrDataUrl}
                          alt="My Attendance QR Code"
                          className="h-52 w-52 sm:h-56 sm:w-56 object-contain rounded-xl transition-transform group-hover:scale-[1.02]"
                        />
                        <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/5 transition-colors rounded-xl flex items-center justify-center pointer-events-none">
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-md backdrop-blur-xs flex items-center gap-1">
                            <Info className="h-3 w-3" /> Tap for verification info
                          </span>
                        </div>
                      </button>
                    ) : (
                      <div className="h-52 w-52 sm:h-56 sm:w-56 flex items-center justify-center bg-muted/20 rounded-xl">
                        <QrCode className="h-10 w-10 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2">
                      <button
                        type="button"
                        onClick={() => setInfoModalOpen(true)}
                        className="group cursor-pointer focus:outline-hidden"
                        title="Attendee pass — Click to see how attendance works"
                      >
                        <Badge className={`${entryPresent ? "bg-purple-700 hover:bg-purple-800" : "bg-primary hover:bg-primary/90"} text-white font-mono text-[10px] tracking-wider uppercase shadow-xs px-2.5 py-0.5 whitespace-nowrap gap-1 transition-transform group-hover:scale-105`}>
                          <span>{entryPresent ? "EXIT PASS (CHECK-OUT)" : "ENTRY PASS (CHECK-IN)"}</span>
                          <HelpCircle className="h-2.5 w-2.5 opacity-80" />
                        </Badge>
                      </button>
                    </div>
                  </div>

                  {/* Countdown Timer (Isolated to avoid re-rendering entire card every second) */}
                  <QrCountdownBadge
                    expiresAt={qrData?.expiresAt}
                    onExpire={() => void fetchDailyQr(true)}
                  />

                  {/* Six-character verification code & Refresh action */}
                  <div className="flex items-center justify-between w-full pt-1 px-1 text-xs">
                    {qrData?.shortCode ? (
                      <button
                        type="button"
                        onClick={() => handleCopyCode(qrData.shortCode!)}
                        className="font-mono text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 bg-card border px-2 py-0.5 rounded cursor-pointer transition-colors"
                        title="Click to copy 6-character code"
                      >
                        <span>Code: <strong className="font-bold text-foreground">{qrData.shortCode}</strong></span>
                        {copiedCode ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                      </button>
                    ) : <div />}

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void fetchDailyQr(true)}
                      disabled={loading}
                      className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5 cursor-pointer px-2"
                    >
                      <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh QR
                    </Button>
                  </div>

                  {/* Quick Verification Guidance Link */}
                  <button
                    type="button"
                    onClick={() => setInfoModalOpen(true)}
                    className="text-[11px] text-primary/80 hover:text-primary hover:underline inline-flex items-center gap-1 font-medium pt-1 cursor-pointer transition-colors"
                  >
                    <HelpCircle className="h-3 w-3" /> How does verification work?
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>

      {/* Attendance Verification Guidance Modal */}
      <Dialog open={infoModalOpen} onOpenChange={setInfoModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-lg">
              <QrCode className="h-5 w-5 text-primary" /> Daily Attendance Verification
            </DialogTitle>
            <DialogDescription className="text-xs">
              Here is how your attendance is verified and marked for today's session:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-1 text-xs">
            {/* Method 1: Organizer Scan */}
            <div className="p-3.5 rounded-xl border-2 border-primary/20 bg-primary/5 space-y-1.5">
              <div className="flex items-center justify-between font-bold text-foreground">
                <span className="flex items-center gap-1.5 text-primary">
                  <ShieldCheck className="h-4 w-4 shrink-0" /> Method 1: Organizer Scan (Recommended)
                </span>
                <Badge variant="outline" className="text-[10px] bg-card uppercase font-mono border-primary/30 text-primary">
                  Primary
                </Badge>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Present your personal QR code on your dashboard to the workshop organizer or scan-desk. The organizer will scan your pass to confirm and record your attendance.
              </p>
              {qrData?.shortCode && (
                <div className="pt-1 flex items-center justify-between bg-card border rounded-lg px-2.5 py-1.5 font-mono">
                  <span className="text-muted-foreground text-[11px]">Your Backup Code:</span>
                  <button
                    type="button"
                    onClick={() => handleCopyCode(qrData.shortCode!)}
                    className="font-bold text-foreground hover:text-primary flex items-center gap-1 cursor-pointer"
                  >
                    <span>{qrData.shortCode}</span>
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              )}
            </div>

            {/* Method 2: Self Check-In */}
            <div className="p-3.5 rounded-xl border bg-muted/40 space-y-2">
              <div className="flex items-center justify-between font-bold text-foreground">
                <span className="flex items-center gap-1.5 text-foreground">
                  <Camera className="h-4 w-4 text-emerald-600 shrink-0" /> Method 2: Self Check-In (Venue Display)
                </span>
                <Badge variant="outline" className="text-[10px] bg-card uppercase font-mono">
                  Self Scan
                </Badge>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                If the workshop presenter is displaying today's live rotating QR code on the venue wall/projector screen, tap below to open your camera or enter the presenter's 6-character screen code.
              </p>
              {onOpenScanner && isApproved && isWorkshopDay && (
                <Button
                  size="sm"
                  onClick={() => {
                    setInfoModalOpen(false);
                    onOpenScanner();
                  }}
                  className="w-full gap-2 font-bold bg-primary text-primary-foreground hover:bg-primary/90 text-xs h-9 cursor-pointer shadow-xs"
                >
                  <Camera className="h-4 w-4" /> Scan Presenter Screen / Enter Code
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
