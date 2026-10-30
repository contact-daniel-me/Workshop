import React, { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { getParticipantDailyQr, type ParticipantQrResponse } from "@/lib/attendance-qr.server";
import { getNextSessionUnlockTime, todayLocal } from "@/lib/attendance";
import {
  ParticipantIdCardFront,
  type ParticipantIdCardData,
} from "./ParticipantIdCardFront";
import {
  ParticipantIdCardBack,
  type ParticipantAttendanceStats,
} from "./ParticipantIdCardBack";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  RotateCw,
  Download,
  Share2,
  IdCard,
  FileText,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Calendar,
  Mail,
  Phone,
  User,
  Sparkles,
  ExternalLink,
} from "lucide-react";

interface Props {
  data: ParticipantIdCardData;
  stats?: ParticipantAttendanceStats | null;
  className?: string;
  allowAdminActions?: boolean;
}

export function DigitalParticipantIdCard({
  data,
  stats,
  className = "",
  allowAdminActions = false,
}: Props) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "dossier">("card");
  const [downloading, setDownloading] = useState(false);

  // Dynamic QR state
  const [loadingQr, setLoadingQr] = useState(false);
  const [qrData, setQrData] = useState<ParticipantQrResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrTimeLeftSec, setQrTimeLeftSec] = useState<number>(0);
  const [unlockTimeLeftSec, setUnlockTimeLeftSec] = useState<number>(0);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const qrTimerRef = useRef<number | null>(null);

  // Fetch or retrieve dynamic QR code
  const fetchQr = useCallback(async () => {
    if (data.verificationStatus !== "verified") return;
    setLoadingQr(true);

    try {
      const res = await getParticipantDailyQr({
        data: { participantId: data.id },
      });

      setQrData(res);

      if (res.ok && res.code === "ACTIVE_QR" && res.token) {
        const url = await QRCode.toDataURL(res.token, {
          width: 360,
          margin: 1,
          color: {
            dark: "#172B45",
            light: "#ffffff",
          },
        });
        setQrDataUrl(url);

        if (res.expiresAt) {
          const diff = Math.max(0, Math.floor((new Date(res.expiresAt).getTime() - Date.now()) / 1000));
          setQrTimeLeftSec(diff);
        }
      }
    } catch (err: unknown) {
      console.warn("Could not load dynamic QR for ID card:", err);
    } finally {
      setLoadingQr(false);
    }
  }, [data.id, data.verificationStatus]);

  useEffect(() => {
    void fetchQr();
  }, [fetchQr]);

  // Rolling QR token countdown
  useEffect(() => {
    if (qrTimerRef.current) window.clearInterval(qrTimerRef.current);

    if (qrTimeLeftSec > 0) {
      qrTimerRef.current = window.setInterval(() => {
        setQrTimeLeftSec((prev) => {
          if (prev <= 1) {
            if (qrTimerRef.current) window.clearInterval(qrTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (qrTimerRef.current) window.clearInterval(qrTimerRef.current);
    };
  }, [qrTimeLeftSec]);

  // 12:00 AM session unlock countdown
  useEffect(() => {
    const isLocked = qrData?.code === "LOCKED_UNTIL_SESSION_TIME";
    const today = todayLocal();
    const targetIso =
      qrData?.unlocksAt ||
      (qrData?.code === "ALREADY_PRESENT"
        ? getNextSessionUnlockTime(today, true)
        : isLocked
        ? getNextSessionUnlockTime(today, false)
        : null);

    if (!targetIso) {
      setUnlockTimeLeftSec(0);
      return;
    }

    const calc = () => Math.max(0, Math.floor((new Date(targetIso).getTime() - Date.now()) / 1000));
    setUnlockTimeLeftSec(calc());

    const interval = window.setInterval(() => {
      const rem = calc();
      setUnlockTimeLeftSec(rem);
      if (rem <= 0) {
        window.clearInterval(interval);
        void fetchQr();
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [qrData?.unlocksAt, qrData?.code, data.startDate, fetchQr]);

  const qrMinutes = Math.floor(qrTimeLeftSec / 60);
  const qrSeconds = qrTimeLeftSec % 60;
  const qrTimeLeftFormatted = `${qrMinutes}:${qrSeconds.toString().padStart(2, "0")}`;

  const unlockHours = Math.floor(unlockTimeLeftSec / 3600);
  const unlockMinutes = Math.floor((unlockTimeLeftSec % 3600) / 60);
  const unlockSec = unlockTimeLeftSec % 60;
  const unlockTimeFormatted = `${unlockHours}h ${unlockMinutes}m ${unlockSec}s`;

  // Download ID card as high-res PNG
  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);

    try {
      // Create high-res PNG at 2.5x retina ratio
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2.5,
        quality: 0.95,
      });

      const link = document.createElement("a");
      const side = isFlipped ? "Back" : "Front";
      link.download = `${data.participantCode}_Participant_ID_${side}.png`;
      link.href = dataUrl;
      link.click();
      toast.success(`Identity Card (${side}) downloaded successfully!`);
    } catch (err: unknown) {
      console.error("Failed to download digital ID card:", err);
      toast.error("Failed to download ID card image. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  // Share digital ID
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${data.fullName} — Participant Identity`,
          text: `Participant Identity Credential: ${data.fullName} (${data.participantCode})`,
        });
        toast.success("Shared successfully!");
      } catch {
        // User dismissed share dialog
      }
    } else {
      void navigator.clipboard.writeText(
        `Participant Identity: ${data.fullName} | ID: ${data.participantCode}`,
      );
      toast.success("Participant details copied to clipboard!");
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Control Bar: Mode Switcher & Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2 bg-muted/40 rounded-2xl border">
        {/* View Mode Toggle */}
        <div className="grid grid-cols-2 p-1 bg-muted rounded-xl border gap-1 w-full sm:w-auto">
          <Button
            size="sm"
            variant={viewMode === "card" ? "default" : "ghost"}
            onClick={() => setViewMode("card")}
            className={`gap-1.5 text-xs font-bold rounded-lg transition-all ${
              viewMode === "card" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground"
            }`}
          >
            <IdCard className="h-4 w-4" /> Digital Card View
          </Button>
          <Button
            size="sm"
            variant={viewMode === "dossier" ? "default" : "ghost"}
            onClick={() => setViewMode("dossier")}
            className={`gap-1.5 text-xs font-bold rounded-lg transition-all ${
              viewMode === "dossier" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground"
            }`}
          >
            <FileText className="h-4 w-4" /> Detailed Profile View
          </Button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {viewMode === "card" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsFlipped((prev) => !prev)}
              className="gap-1.5 text-xs font-bold flex-1 sm:flex-initial"
            >
              <RotateCw className="h-3.5 w-3.5 text-primary" />
              {isFlipped ? "Show Front" : "Show Back (QR & Stats)"}
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={handleDownload}
            disabled={downloading}
            className="gap-1.5 text-xs font-bold flex-1 sm:flex-initial"
          >
            <Download className={`h-3.5 w-3.5 text-emerald-600 ${downloading ? "animate-bounce" : ""}`} />
            {downloading ? "Rendering…" : "Download PNG"}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleShare}
            className="gap-1.5 text-xs font-semibold px-2.5 sm:px-3"
            title="Share Participant ID"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Share</span>
          </Button>
        </div>
      </div>

      {/* VIEW MODE 1: DIGITAL CARD VIEW (3D FLIP) */}
      {viewMode === "card" && (
        <div className="flex flex-col items-center justify-center py-4">
          {/* Card Container with smooth 3D Perspective */}
          <div className="[perspective:1200px] w-full max-w-[340px] sm:max-w-[360px]">
            <div
              ref={cardRef}
              onClick={() => setIsFlipped((prev) => !prev)}
              className="w-full transition-transform duration-700 [transform-style:preserve-3d] cursor-pointer"
              style={{
                transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
              }}
            >
              {/* Card Front Face */}
              <div
                className="w-full [backface-visibility:hidden]"
                style={{ display: isFlipped ? "none" : "block" }}
              >
                <ParticipantIdCardFront
                  data={data}
                  onFlip={() => setIsFlipped(true)}
                  showFlipPrompt={true}
                />
              </div>

              {/* Card Back Face */}
              <div
                className="w-full [backface-visibility:hidden]"
                style={{ display: isFlipped ? "block" : "none" }}
              >
                <ParticipantIdCardBack
                  data={data}
                  stats={stats}
                  qrDataUrl={qrDataUrl}
                  qrShortCode={qrData?.shortCode}
                  qrStatus={qrData?.code}
                  qrTimeLeftFormatted={qrTimeLeftFormatted}
                  unlockTimeFormatted={unlockTimeFormatted}
                  loadingQr={loadingQr}
                  onRefreshQr={() => void fetchQr()}
                  onFlip={() => setIsFlipped(false)}
                />
              </div>
            </div>
          </div>

          {/* Interactive Flip Hint */}
          <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1.5">
            <RotateCw className="h-3.5 w-3.5 text-primary" />
            <span>Click the card or use the toggle above to flip between Front and Back.</span>
          </p>
        </div>
      )}

      {/* VIEW MODE 2: DETAILED PROFILE VIEW (EXPANDED DOSSIER) */}
      {viewMode === "dossier" && (
        <div className="grid gap-6 md:grid-cols-3">
          {/* Left Column: Mini Card Preview */}
          <div className="flex flex-col items-center space-y-3">
            <ParticipantIdCardFront
              data={data}
              onFlip={() => setViewMode("card")}
              showFlipPrompt={false}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setViewMode("card")}
              className="gap-1.5 text-xs font-semibold w-full max-w-[360px]"
            >
              <IdCard className="h-3.5 w-3.5 text-primary" /> Switch to Interactive 3D Card
            </Button>
          </div>

          {/* Right Column: Complete Dossier Information */}
          <div className="md:col-span-2 space-y-6">
            {/* Participant Profile Dossier */}
            <Card className="shadow-sm border">
              <CardHeader className="pb-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    <CardTitle className="font-display text-lg font-bold">
                      Participant Identity Dossier
                    </CardTitle>
                  </div>
                  <Badge
                    className={`font-mono text-xs uppercase ${
                      data.verificationStatus === "verified"
                        ? "bg-success text-success-foreground"
                        : data.verificationStatus === "rejected"
                        ? "bg-destructive text-destructive-foreground"
                        : "bg-warning text-warning-foreground"
                    }`}
                  >
                    {data.verificationStatus.toUpperCase()}
                  </Badge>
                </div>
                <CardDescription>
                  Verified personal identity credential.
                </CardDescription>
              </CardHeader>

              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                  <div className="p-3 rounded-xl border bg-card space-y-1">
                    <span className="text-muted-foreground font-medium">Full Name</span>
                    <p className="font-bold text-sm text-foreground">{data.fullName}</p>
                  </div>

                  <div className="p-3 rounded-xl border bg-card space-y-1">
                    <span className="text-muted-foreground font-medium">Unique Participant ID</span>
                    <p className="font-mono font-bold text-sm text-primary">{data.participantCode}</p>
                  </div>

                  <div className="p-3 rounded-xl border bg-card space-y-1">
                    <span className="text-muted-foreground font-medium flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5 text-primary" /> Email Address
                    </span>
                    <p className="font-semibold text-foreground truncate">{data.email}</p>
                  </div>

                  <div className="p-3 rounded-xl border bg-card space-y-1">
                    <span className="text-muted-foreground font-medium flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5 text-primary" /> Mobile Phone
                    </span>
                    <p className="font-mono font-semibold text-foreground">{data.phone}</p>
                  </div>

                  <div className="p-3 rounded-xl border bg-card space-y-1">
                    <span className="text-muted-foreground font-medium flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-primary" /> Event / Workshop
                    </span>
                    <p className="font-semibold text-foreground truncate">{data.workshopName}</p>
                  </div>

                  <div className="p-3 rounded-xl border bg-card space-y-1">
                    <span className="text-muted-foreground font-medium flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-primary" /> Event Duration
                    </span>
                    <p className="font-mono font-semibold text-foreground">
                      {data.startDate} → {data.endDate} ({data.durationDays} Days)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Attendance Analytics & Progress */}
            {stats && (
              <Card className="shadow-sm border">
                <CardHeader className="pb-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-emerald-600" />
                      <CardTitle className="font-display text-lg font-bold">
                        Live Attendance Performance
                      </CardTitle>
                    </div>
                    <Badge className="bg-emerald-600 text-white font-mono text-xs">
                      {Math.round(stats.currentPct)}% ATTENDANCE
                    </Badge>
                  </div>
                  <CardDescription>
                    Official attendance standing computed by authoritative workshop business rules.
                  </CardDescription>
                </CardHeader>

                <CardContent className="p-6 space-y-5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-muted-foreground">Current Completion Rate</span>
                      <span className="font-mono text-primary font-bold">{stats.currentPct}%</span>
                    </div>
                    <Progress value={stats.currentPct} className="h-2.5" />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="p-3 rounded-xl border bg-muted/20">
                      <span className="text-xs text-muted-foreground font-medium block">Present</span>
                      <span className="text-xl font-bold font-display text-success">{stats.present}</span>
                      <span className="text-[10px] text-muted-foreground block">days marked</span>
                    </div>

                    <div className="p-3 rounded-xl border bg-muted/20">
                      <span className="text-xs text-muted-foreground font-medium block">Absent</span>
                      <span className="text-xl font-bold font-display text-destructive">{stats.absent}</span>
                      <span className="text-[10px] text-muted-foreground block">days missed</span>
                    </div>

                    <div className="p-3 rounded-xl border bg-muted/20">
                      <span className="text-xs text-muted-foreground font-medium block">Eligible</span>
                      <span className="text-xl font-bold font-display text-foreground">{stats.eligible}</span>
                      <span className="text-[10px] text-muted-foreground block">days elapsed</span>
                    </div>

                    <div className="p-3 rounded-xl border bg-muted/20">
                      <span className="text-xs text-muted-foreground font-medium block">Remaining</span>
                      <span className="text-xl font-bold font-display text-primary">{stats.remaining}</span>
                      <span className="text-[10px] text-muted-foreground block">sessions left</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

