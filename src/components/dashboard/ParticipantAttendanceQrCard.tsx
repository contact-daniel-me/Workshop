import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { getParticipantDailyQr, type ParticipantQrResponse } from "@/lib/attendance-qr.server";
import { getNextSessionUnlockTime } from "@/lib/attendance";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ClickableAvatar } from "@/components/ui/profile-photo-lightbox";
import {
  QrCode,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  CalendarDays,
  Sparkles,
  Camera,
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
  onAttendanceUpdated?: () => void;
  onOpenScanner?: () => void;
}

function SessionCountdownTimer({
  hours,
  minutes,
  seconds,
  title = "Next QR code will generate at 12:00 PM",
  subtitle,
}: {
  hours: number;
  minutes: number;
  seconds: number;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center p-5 rounded-2xl border-2 border-primary/20 bg-muted/30 shadow-xs max-w-md w-full space-y-3.5 text-center">
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-semibold">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span>{title}</span>
      </div>

      <div className="flex items-center justify-center gap-2 sm:gap-3 font-mono">
        <div className="flex flex-col items-center bg-card border rounded-xl px-3 py-2 min-w-[62px] sm:min-w-[68px] shadow-xs">
          <span className="text-2xl sm:text-3xl font-extrabold text-foreground">
            {String(hours).padStart(2, "0")}
          </span>
          <span className="text-[10px] text-muted-foreground uppercase font-sans tracking-wider font-semibold">
            Hours
          </span>
        </div>
        <span className="text-2xl font-bold text-muted-foreground -mt-3.5">:</span>
        <div className="flex flex-col items-center bg-card border rounded-xl px-3 py-2 min-w-[62px] sm:min-w-[68px] shadow-xs">
          <span className="text-2xl sm:text-3xl font-extrabold text-foreground">
            {String(minutes).padStart(2, "0")}
          </span>
          <span className="text-[10px] text-muted-foreground uppercase font-sans tracking-wider font-semibold">
            Mins
          </span>
        </div>
        <span className="text-2xl font-bold text-muted-foreground -mt-3.5">:</span>
        <div className="flex flex-col items-center bg-card border rounded-xl px-3 py-2 min-w-[62px] sm:min-w-[68px] shadow-xs">
          <span className="text-2xl sm:text-3xl font-extrabold text-primary">
            {String(seconds).padStart(2, "0")}
          </span>
          <span className="text-[10px] text-muted-foreground uppercase font-sans tracking-wider font-semibold">
            Secs
          </span>
        </div>
      </div>

      {subtitle && (
        <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
          {subtitle}
        </p>
      )}
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
  onAttendanceUpdated,
  onOpenScanner,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [qrData, setQrData] = useState<ParticipantQrResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [timeLeftSec, setTimeLeftSec] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isApproved = verificationStatus === "verified";
  const timerRef = useRef<number | null>(null);

  // Fetch or retrieve participant's daily QR code
  const fetchDailyQr = useCallback(async (isRefresh = false) => {
    if (!isApproved || !isWorkshopDay) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await getParticipantDailyQr({
        data: { participantId },
      });

      setQrData(res);

      if (res.ok) {
        if (res.code === "ACTIVE_QR" && res.token) {
          // Generate QR code data URL
          const url = await QRCode.toDataURL(res.token, {
            width: 320,
            margin: 2,
            color: {
              dark: "#042f2e", // Deep teal brand color
              light: "#ffffff",
            },
          });
          setQrDataUrl(url);

          // Calculate remaining validity in seconds
          if (res.expiresAt) {
            const diff = Math.max(0, Math.floor((new Date(res.expiresAt).getTime() - Date.now()) / 1000));
            setTimeLeftSec(diff);
          }
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
      const msg = err instanceof Error ? err.message : "Failed to load attendance QR";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [participantId, isApproved, isWorkshopDay, onAttendanceUpdated]);

  // Initial load
  useEffect(() => {
    void fetchDailyQr();
  }, [fetchDailyQr]);

  // Expiration countdown timer for active QR token
  useEffect(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);

    if (timeLeftSec > 0) {
      timerRef.current = window.setInterval(() => {
        setTimeLeftSec((prev) => {
          if (prev <= 1) {
            if (timerRef.current) window.clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [timeLeftSec]);

  // Auto-refresh when expired if user is viewing
  const isExpired = qrData?.code === "ACTIVE_QR" && timeLeftSec <= 0 && !!qrData?.expiresAt;
  const isAlreadyPresent = qrData?.code === "ALREADY_PRESENT" || qrData?.alreadyMarked;
  const isLockedUntilNoon = qrData?.code === "LOCKED_UNTIL_SESSION_TIME";

  // Session unlock countdown timer (to 12:00 PM IST)
  const [unlockTimeLeftSec, setUnlockTimeLeftSec] = useState<number>(0);

  useEffect(() => {
    const targetIso =
      qrData?.unlocksAt ||
      (isAlreadyPresent
        ? getNextSessionUnlockTime(todayDate, true)
        : isLockedUntilNoon
        ? getNextSessionUnlockTime(todayDate, false)
        : null);

    if (!targetIso) {
      setUnlockTimeLeftSec(0);
      return;
    }

    const calcDiff = () => {
      const diffMs = new Date(targetIso).getTime() - Date.now();
      return Math.max(0, Math.floor(diffMs / 1000));
    };

    setUnlockTimeLeftSec(calcDiff());

    const interval = window.setInterval(() => {
      const remaining = calcDiff();
      setUnlockTimeLeftSec(remaining);
      if (remaining <= 0) {
        window.clearInterval(interval);
        // Automatically fetch QR once 12:00 PM is reached!
        void fetchDailyQr(true);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [qrData?.unlocksAt, isLockedUntilNoon, isAlreadyPresent, todayDate, fetchDailyQr]);

  const unlockHours = Math.floor(unlockTimeLeftSec / 3600);
  const unlockMinutes = Math.floor((unlockTimeLeftSec % 3600) / 60);
  const unlockSeconds = unlockTimeLeftSec % 60;

  const minutes = Math.floor(timeLeftSec / 60);
  const seconds = timeLeftSec % 60;
  const formattedTimeLeft = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <Card className="overflow-hidden border-2 border-primary/20 bg-gradient-to-b from-card to-primary/[0.02] shadow-md">
      {/* Card Header */}
      <CardHeader className="border-b bg-muted/30 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="font-display text-xl font-bold flex items-center gap-2">
                My Attendance QR
                <Badge className="bg-primary/10 text-primary border-primary/20 text-[11px] font-mono">
                  DAILY TOKEN
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Session Date: <span className="font-mono font-semibold text-foreground">{todayDate}</span>
              </CardDescription>
            </div>
          </div>

          {/* Status Badge & Scan Trigger */}
          <div className="flex items-center gap-2">
            {!isAlreadyPresent && !isLockedUntilNoon && isWorkshopDay && isApproved && onOpenScanner && (
              <Button
                size="sm"
                onClick={onOpenScanner}
                className="gap-1.5 font-bold text-xs bg-primary text-primary-foreground shadow-xs h-8"
              >
                <Camera className="h-3.5 w-3.5" /> Scan Screen
              </Button>
            )}
            {isAlreadyPresent ? (
              <Badge className="bg-emerald-600 text-white gap-1.5 px-3 py-1 font-semibold text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" /> Present
              </Badge>
            ) : isLockedUntilNoon ? (
              <Badge variant="outline" className="border-primary/40 bg-primary/5 text-primary gap-1.5 px-3 py-1 font-semibold text-xs">
                <Clock className="h-3.5 w-3.5 text-primary" /> Opens at 12:00 PM
              </Badge>
            ) : isWorkshopDay ? (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 gap-1.5 px-3 py-1 font-semibold text-xs">
                <Clock className="h-3.5 w-3.5 text-amber-600" /> Not Marked
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                No Session Today
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        {/* Case 1: Attendance Already Marked for Today */}
        {isAlreadyPresent ? (
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-5">
            <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center shadow-inner">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h3 className="font-display text-2xl font-bold text-foreground">
                Attendance Recorded!
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You are marked <strong className="text-emerald-600 font-semibold">PRESENT</strong> for today's workshop session ({todayDate}).
              </p>
              {qrData?.checkedInAt && (
                <div className="pt-1">
                  <Badge variant="outline" className="font-mono text-xs text-muted-foreground bg-muted/40">
                    Checked in at: {new Date(qrData.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Badge>
                </div>
              )}
            </div>

            {/* Next Day QR Code Generation & Countdown Timer */}
            {!isLastWorkshopDay ? (
              <SessionCountdownTimer
                hours={unlockHours}
                minutes={unlockMinutes}
                seconds={unlockSeconds}
                title="Next QR code will generate at 12:00 PM"
                subtitle="Your attendance QR code for the next session will automatically become available tomorrow at 12:00 PM."
              />
            ) : (
              <div className="p-4 rounded-xl border bg-muted/30 text-xs text-muted-foreground max-w-xs">
                You have completed all scheduled workshop sessions! Thank you for your active participation.
              </div>
            )}
          </div>
        ) : isLockedUntilNoon ? (
          /* Case 1B: Workshop day, but before 12:00 PM (Locked) */
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-5">
            <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center shadow-inner">
              <Clock className="h-8 w-8" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h3 className="font-display text-2xl font-bold text-foreground">
                Session Opens at 12:00 PM
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Today's workshop attendance session ({todayDate}) opens at 12:00 PM.
              </p>
            </div>

            <SessionCountdownTimer
              hours={unlockHours}
              minutes={unlockMinutes}
              seconds={unlockSeconds}
              title="Next QR code will generate at 12:00 PM"
              subtitle="The countdown is active. Your personal attendance QR code will automatically unlock and appear when the timer reaches zero."
            />

            <Button
              size="sm"
              variant="outline"
              onClick={() => void fetchDailyQr(true)}
              disabled={loading}
              className="gap-1.5 text-xs font-semibold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh Status
            </Button>
          </div>
        ) : !isWorkshopDay ? (
          /* Case 2: No Workshop Session Scheduled */
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <CalendarDays className="h-7 w-7" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="font-display text-lg font-bold text-foreground">No Session Scheduled</h3>
              <p className="text-xs text-muted-foreground">
                There is no workshop session scheduled for today ({todayDate}). Check the workshop calendar for upcoming sessions.
              </p>
            </div>
          </div>
        ) : !isApproved ? (
          /* Case 3: Registration Pending / Rejected */
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
            <div className="h-14 w-14 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
              <Clock className="h-7 w-7" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="font-display text-lg font-bold text-foreground">Approval Required</h3>
              <p className="text-xs text-muted-foreground">
                Your profile must be approved by an administrator before an attendance QR can be generated.
              </p>
            </div>
          </div>
        ) : (
          /* Case 4: Active QR Ready for Administrator Scanning */
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            {/* Left side: Participant info card */}
            <div className="flex-1 space-y-4 w-full">
              <div className="flex items-center gap-4 p-4 rounded-xl border bg-card/60 shadow-xs">
                <ClickableAvatar
                  src={photoUrl}
                  alt={fullName}
                  fullName={fullName}
                  participantCode={participantCode}
                  verificationStatus={verificationStatus}
                  fallback={fullName.slice(0, 2).toUpperCase()}
                  className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl border-2 border-primary/20 shrink-0 shadow-sm"
                  fallbackClassName="text-2xl font-bold"
                />
                <div className="min-w-0 flex-1">
                  <h4 className="font-display text-lg font-bold text-foreground truncate">{fullName}</h4>
                  <p className="text-xs font-mono font-semibold text-primary">{participantCode}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Verified Participant
                    </span>
                  </div>
                </div>
              </div>

              {/* Instructions banner with 2 check-in methods */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                <p className="text-xs font-bold text-primary flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" /> Two Ways to Check In Today:
                </p>
                <div className="space-y-2 text-xs text-foreground/90 leading-relaxed">
                  <div>
                    <strong className="text-foreground">Method 1 (Self Scan):</strong> If the workshop organizer is displaying the daily rotating QR code on the venue screen, tap below to scan it with your camera or enter the 6-character code.
                    {onOpenScanner && (
                      <Button
                        type="button"
                        onClick={onOpenScanner}
                        className="w-full gap-2 font-bold bg-primary text-primary-foreground mt-2 shadow-xs"
                        size="sm"
                      >
                        <Camera className="h-4 w-4" /> Scan Presenter Screen / Enter Code
                      </Button>
                    )}
                  </div>
                  <div className="pt-1 border-t border-primary/10">
                    <strong className="text-foreground">Method 2 (Organizer Scan):</strong> Alternatively, present your personal QR code on the right to the workshop administrator to scan.
                  </div>
                </div>
              </div>

              {/* Token Info & Short Code */}
              {qrData?.shortCode && (
                <div className="p-3 rounded-lg border bg-muted/40 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Backup Short Code:</span>
                  <span className="font-mono font-extrabold text-sm tracking-wider text-primary">
                    {qrData.shortCode}
                  </span>
                </div>
              )}
            </div>

            {/* Right side: QR Code Display & Countdown */}
            <div className="flex flex-col items-center justify-center p-4 bg-muted/20 rounded-2xl border w-full lg:w-auto shrink-0 space-y-3">
              {loading ? (
                <div className="h-60 w-60 rounded-xl bg-muted/60 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="h-7 w-7 animate-spin text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">Generating secure QR…</span>
                </div>
              ) : isExpired ? (
                <div className="h-60 w-60 rounded-xl border-2 border-dashed border-destructive/40 bg-destructive/5 flex flex-col items-center justify-center p-4 text-center space-y-2">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                  <p className="text-xs font-bold text-destructive">QR Token Expired</p>
                  <p className="text-[11px] text-muted-foreground">
                    QR codes expire periodically for security. Click below to generate a fresh one.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void fetchDailyQr(true)}
                    className="h-8 text-xs gap-1.5 mt-1 font-semibold"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh QR Code
                  </Button>
                </div>
              ) : qrDataUrl ? (
                <div className="space-y-3 text-center">
                  <div className="relative rounded-2xl border-2 border-primary/30 bg-white p-3 shadow-lg inline-block">
                    <img
                      src={qrDataUrl}
                      alt="My Attendance QR Code"
                      className="h-56 w-56 object-contain rounded-lg"
                    />
                    <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground font-mono text-[10px] uppercase shadow-xs px-2 py-0.5">
                        Scan to verify
                      </Badge>
                    </div>
                  </div>

                  {/* Countdown Timer */}
                  <div className="pt-2">
                    <div className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-muted-foreground bg-card border px-3 py-1 rounded-full shadow-xs">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      <span>Valid for: </span>
                      <span className={timeLeftSec < 120 ? "text-destructive font-bold" : "text-foreground font-bold"}>
                        {formattedTimeLeft}
                      </span>
                    </div>
                  </div>
                </div>
              ) : errorMsg ? (
                <div className="h-60 w-60 rounded-xl border border-destructive/30 bg-destructive/5 flex flex-col items-center justify-center p-4 text-center space-y-2 text-destructive">
                  <AlertCircle className="h-8 w-8" />
                  <p className="text-xs font-bold">Failed to load QR</p>
                  <p className="text-[11px] text-muted-foreground">{errorMsg}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void fetchDailyQr(true)}
                    className="h-8 text-xs gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Retry
                  </Button>
                </div>
              ) : null}

              {/* Manual Refresh Action */}
              {!isExpired && qrDataUrl && !loading && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void fetchDailyQr(true)}
                  className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                >
                  <RefreshCw className="h-3 w-3" /> Refresh QR
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

