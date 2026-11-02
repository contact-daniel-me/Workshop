import { useState, useEffect, useCallback, useRef } from "react";
import QRCode from "qrcode";
import {
  getParticipantDailyQr,
  type ParticipantQrResponse,
} from "@/lib/attendance-qr.server";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  QrCode,
  CheckCircle2,
  Clock,
  Calendar,
  RefreshCw,
  Maximize2,
  Copy,
  Check,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  participantId?: string;
  fullName?: string;
  participantCode?: string;
  verificationStatus?: string;
  todayDate: string;
  isWorkshopDay: boolean;
  todayRecord?: {
    status: string;
    checked_in_at?: string | null;
  } | null;
  onAttendanceUpdated?: () => void;
}

export function BannerAttendanceQr({
  participantId,
  fullName = "Participant",
  participantCode = "SA-2026",
  verificationStatus = "verified",
  todayDate,
  isWorkshopDay,
  todayRecord,
  onAttendanceUpdated,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [qrData, setQrData] = useState<ParticipantQrResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [timeLeftSec, setTimeLeftSec] = useState<number>(0);
  const [enlargeOpen, setEnlargeOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const isApproved = verificationStatus === "verified";
  const isAlreadyPresent = todayRecord?.status === "present" || qrData?.code === "ALREADY_PRESENT";

  const fetchDailyQr = useCallback(async (isRefresh = false) => {
    if (!isApproved || !isWorkshopDay || !participantId || isAlreadyPresent) return;
    setLoading(true);

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
              dark: "#042f2e",
              light: "#ffffff",
            },
          });
          setQrDataUrl(url);

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
      }
    } catch {
      // Quiet fail in banner - user still has main QR card
    } finally {
      setLoading(false);
    }
  }, [isApproved, isWorkshopDay, participantId, isAlreadyPresent, onAttendanceUpdated]);

  useEffect(() => {
    void fetchDailyQr();
  }, [fetchDailyQr]);

  // Countdown timer
  useEffect(() => {
    if (timeLeftSec <= 0) return;
    const interval = window.setInterval(() => {
      setTimeLeftSec((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          void fetchDailyQr(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timeLeftSec, fetchDailyQr]);

  const minutes = Math.floor(timeLeftSec / 60);
  const seconds = timeLeftSec % 60;
  const formattedTimeLeft = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  const handleCopyCode = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success(`Copied code: ${code}`);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // State 1: Already Verified Present Today
  if (isAlreadyPresent) {
    return (
      <div className="flex items-center gap-3 p-3 sm:p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 shadow-xs shrink-0">
        <div className="h-11 w-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="space-y-0.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600/20 text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
            Verified Present
          </span>
          <p className="font-bold text-xs sm:text-sm text-foreground">Attendance Recorded</p>
          <p className="text-[11px] text-muted-foreground font-mono">Date: {todayDate}</p>
        </div>
      </div>
    );
  }

  // State 2: Not a workshop day
  if (!isWorkshopDay) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl border bg-muted/40 shadow-xs shrink-0">
        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
          <Calendar className="h-5 w-5" />
        </div>
        <div className="space-y-0.5">
          <p className="font-bold text-xs text-foreground">No Session Today</p>
          <p className="text-[11px] text-muted-foreground">Scheduled workshop days only</p>
        </div>
      </div>
    );
  }

  // State 3: Session Locked Until Midnight/Time
  if (qrData?.code === "LOCKED_UNTIL_SESSION_TIME") {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 shadow-xs shrink-0">
        <div className="h-10 w-10 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
          <Clock className="h-5 w-5" />
        </div>
        <div className="space-y-0.5">
          <p className="font-bold text-xs text-foreground">Session Starts at 12:00 AM</p>
          <p className="text-[11px] text-muted-foreground">Daily QR will unlock automatically</p>
        </div>
      </div>
    );
  }

  // State 4: Loading
  if (loading && !qrDataUrl) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl border bg-muted/30 shadow-xs shrink-0 min-w-[210px]">
        <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center shrink-0 animate-pulse">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <div className="h-3 w-16 bg-muted rounded animate-pulse" />
          <div className="h-2.5 w-24 bg-muted rounded animate-pulse" />
          <p className="text-[11px] text-muted-foreground">Generating QR…</p>
        </div>
      </div>
    );
  }

  // State 5: Active Scannable Daily QR Code (Matches screenshot design)
  return (
    <>
      <div className="flex flex-col items-center justify-center p-3.5 sm:p-4 bg-muted/20 rounded-2xl border w-full sm:w-auto shrink-0 space-y-2.5">
        {/* Crisp QR Code Frame with centered SCAN TO VERIFY pill badge */}
        <div
          onClick={() => setEnlargeOpen(true)}
          className="relative rounded-2xl border-2 border-primary/30 bg-white p-3 shadow-md inline-block cursor-pointer hover:scale-[1.02] transition-transform"
          title="Click to view enlarged QR"
        >
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="My Attendance QR Code"
              className="h-44 w-44 sm:h-48 sm:w-48 object-contain rounded-lg"
            />
          ) : (
            <div className="h-44 w-44 sm:h-48 sm:w-48 flex items-center justify-center bg-muted/20 rounded-lg">
              <QrCode className="h-10 w-10 text-muted-foreground animate-pulse" />
            </div>
          )}
          <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2">
            <Badge className="bg-primary text-primary-foreground font-mono text-[10px] uppercase shadow-xs px-2.5 py-0.5 whitespace-nowrap">
              SCAN TO VERIFY
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

        {/* Short Code & Refresh Button */}
        <div className="flex items-center gap-3 text-xs">
          {qrData?.shortCode && (
            <span className="font-mono text-muted-foreground text-[11px]">
              Code: <strong className="font-bold text-foreground bg-muted px-1.5 py-0.5 rounded">{qrData.shortCode}</strong>
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void fetchDailyQr(true)}
            disabled={loading}
            className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh QR
          </Button>
        </div>
      </div>

      {/* Enlarged QR Modal Dialog */}
      <Dialog open={enlargeOpen} onOpenChange={setEnlargeOpen}>
        <DialogContent className="sm:max-w-md p-6 text-center">
          <DialogHeader className="text-center pb-2">
            <div className="mx-auto p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-700 w-fit mb-2">
              <QrCode className="h-7 w-7" />
            </div>
            <DialogTitle className="font-display text-xl font-bold">
              Today's Attendance QR Pass
            </DialogTitle>
            <DialogDescription className="text-xs">
              Show this dynamic QR code to the workshop administrator to scan and confirm your attendance for {todayDate}.
            </DialogDescription>
          </DialogHeader>

          {/* Large High-Contrast QR Code */}
          <div className="my-3 flex flex-col items-center justify-center">
            <div className="p-4 bg-white rounded-2xl border-2 border-emerald-500/30 shadow-md">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Daily Attendance QR Code"
                  className="h-56 w-56 sm:h-64 sm:w-64 object-contain"
                />
              ) : (
                <div className="h-56 w-56 flex items-center justify-center">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          </div>

          {/* Expiration Countdown & Backup Short Code */}
          <div className="space-y-2 pt-1">
            {timeLeftSec > 0 && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-800 dark:text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Expires in {formattedTimeLeft}</span>
              </div>
            )}

            {qrData?.shortCode && (
              <div className="flex items-center justify-center gap-2 pt-1">
                <span className="text-xs text-muted-foreground">Manual Code:</span>
                <button
                  type="button"
                  onClick={() => handleCopyCode(qrData.shortCode!)}
                  className="inline-flex items-center gap-1.5 font-mono text-sm font-bold text-foreground bg-muted px-3 py-1 rounded-lg border hover:bg-muted/80 transition-colors cursor-pointer"
                  title="Click to copy manual 6-character code"
                >
                  <span>{qrData.shortCode}</span>
                  {copiedCode ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              </div>
            )}

            <div className="pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEnlargeOpen(false)}
                className="w-full text-xs font-semibold cursor-pointer"
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

