import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { getParticipantDailyQr, type ParticipantQrResponse } from "@/lib/attendance-qr.server";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  QrCode,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  CalendarDays,
  Sparkles,
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
  onAttendanceUpdated?: () => void;
}

export function ParticipantAttendanceQrCard({
  participantId,
  fullName = "Participant",
  participantCode = "SA-2026",
  photoUrl,
  verificationStatus = "verified",
  todayDate,
  isWorkshopDay,
  onAttendanceUpdated,
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
        setErrorMsg(res.message);
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

  // Expiration countdown timer
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

          {/* Status Badge */}
          <div>
            {isAlreadyPresent ? (
              <Badge className="bg-emerald-600 text-white gap-1.5 px-3 py-1 font-semibold text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" /> Present
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
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
            <div className="h-20 w-20 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center shadow-inner">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h3 className="font-display text-2xl font-bold text-foreground">
                Attendance Recorded!
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You are marked <strong className="text-emerald-600 font-semibold">PRESENT</strong> for today's workshop session ({todayDate}).
              </p>
              {qrData?.checkedInAt && (
                <div className="pt-2">
                  <Badge variant="outline" className="font-mono text-xs text-muted-foreground bg-muted/40">
                    Checked in at: {new Date(qrData.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Badge>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground/80 max-w-xs">
              Every presence matters. Your attendance has been verified by the workshop administrator.
            </p>
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
                <Avatar className="h-16 w-16 border-2 border-primary/20 shrink-0">
                  <AvatarImage src={photoUrl ?? undefined} alt={fullName} className="object-cover" />
                  <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
                    {fullName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
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

              {/* Instructions banner */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                <p className="text-xs font-bold text-primary flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" /> How to Mark Attendance:
                </p>
                <p className="text-xs text-foreground/90 leading-relaxed">
                  Present this QR code to the attendance administrator. The administrator will scan it using the Admin QR Scanner to verify your identity and confirm your presence.
                </p>
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

