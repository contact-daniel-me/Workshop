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

  // State 5: Active Scannable Daily QR Code
  return (
    <>
      <div className="flex items-center gap-3 p-2.5 sm:p-3 rounded-xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.06] via-card to-card shadow-xs group hover:border-emerald-500/50 transition-all shrink-0">
        {/* Scannable QR Code Thumbnail */}
        <div
          onClick={() => setEnlargeOpen(true)}
          className="relative bg-white p-1 rounded-lg border border-slate-200/90 shadow-xs shrink-0 cursor-pointer hover:scale-105 transition-transform"
          title="Click to enlarge Daily QR Pass"
        >
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Daily Attendance QR"
              className="h-[74px] w-[74px] sm:h-20 sm:w-20 object-contain"
            />
          ) : (
            <div className="h-[74px] w-[74px] sm:h-20 sm:w-20 flex items-center justify-center bg-muted/20">
              <QrCode className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 hover:bg-black/10 rounded-lg flex items-center justify-center transition-colors">
            <Maximize2 className="h-4 w-4 text-emerald-900 opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-sm" />
          </div>
        </div>

        {/* Live Status & Details */}
        <div className="space-y-1 text-left">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold tracking-wider uppercase text-emerald-800 dark:text-emerald-300">
              Daily Pass
            </span>
          </div>

          {timeLeftSec > 0 && (
            <p className="font-mono text-xs text-muted-foreground">
              Expires in <span className="font-bold text-foreground">{formattedTimeLeft}</span>
            </p>
          )}

          {qrData?.shortCode && (
            <p className="font-mono text-xs text-muted-foreground">
              Code: <span className="font-bold text-foreground bg-muted/80 px-1.5 py-0.5 rounded text-[11px]">{qrData.shortCode}</span>
            </p>
          )}

          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => setEnlargeOpen(true)}
              className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Maximize2 className="h-3 w-3" /> Enlarge
            </button>
            <button
              type="button"
              onClick={() => void fetchDailyQr(true)}
              disabled={loading}
              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
              title="Refresh QR Code"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
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
