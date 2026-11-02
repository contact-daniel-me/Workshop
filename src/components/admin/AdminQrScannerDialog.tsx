import { useState, useRef, useEffect, useCallback } from "react";
import jsQR from "jsqr";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ClickableAvatar } from "@/components/ui/profile-photo-lightbox";
import {
  Camera,
  QrCode,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Search,
  Clock,
  ArrowRight,
  AlertTriangle,
  UserCheck,
} from "lucide-react";
import {
  verifyParticipantQr,
  confirmParticipantAttendance,
  type QrVerificationResult,
  type ConfirmAttendanceResult,
} from "@/lib/attendance-qr.server";

interface AdminQrScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAttendanceConfirmed?: () => void;
  workshopName?: string;
}

export function AdminQrScannerDialog({
  open,
  onOpenChange,
  onAttendanceConfirmed,
  workshopName = "Event Management Portal",
}: AdminQrScannerDialogProps) {
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [manualCode, setManualCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<QrVerificationResult | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmedResult, setConfirmedResult] = useState<ConfirmAttendanceResult | null>(null);
  const [autoConfirmOnScan, setAutoConfirmOnScan] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Stop camera and scan animation loop cleanly
  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraLoading(false);
  }, []);

  // Process verified token (from scan or manual input)
  const processToken = useCallback(
    async (rawToken: string, autoConfirm = false) => {
      if (isVerifying || isConfirming) return;
      const clean = rawToken.trim();
      if (!clean) return;

      stopCamera();
      setIsVerifying(true);
      setVerificationResult(null);
      setConfirmedResult(null);

      try {
        const res = await verifyParticipantQr({ data: { token: clean } });
        setVerificationResult(res);

        if (res.valid) {
          if (autoConfirm && res.session?.token) {
            setIsConfirming(true);
            try {
              const confirmRes = await confirmParticipantAttendance({
                data: { token: res.session.token },
              });
              setConfirmedResult(confirmRes);
              if (confirmRes.ok) {
                if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                  try {
                    navigator.vibrate(150);
                  } catch {
                    // Ignore
                  }
                }
                toast.success(`Attendance marked successfully for ${confirmRes.participant?.fullName ?? "Participant"}!`);
                onAttendanceConfirmed?.();
              } else {
                toast.error(confirmRes.message);
              }
            } catch (confErr: unknown) {
              const cmsg = confErr instanceof Error ? confErr.message : "Confirmation failed";
              toast.error(cmsg);
            } finally {
              setIsConfirming(false);
            }
          } else {
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
              try {
                navigator.vibrate([80, 40, 80]);
              } catch {
                // Ignore vibration failure
              }
            }
            toast.success("Valid QR code detected! Review details to confirm attendance.");
          }
        } else {
          toast.warning(res.resultMessage || "QR verification returned an issue.");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Verification request failed";
        setVerificationResult({
          valid: false,
          resultCode: "VERIFICATION_FAILED",
          resultMessage: msg,
        });
        toast.error(msg);
      } finally {
        setIsVerifying(false);
      }
    },
    [isVerifying, isConfirming, stopCamera, onAttendanceConfirmed],
  );

  // Scan frame loop using jsQR
  const scanFrame = useCallback(() => {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const video = videoRef.current;
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code && code.data) {
        void processToken(code.data, autoConfirmOnScan);
        return;
      }
    }

    animFrameRef.current = requestAnimationFrame(scanFrame);
  }, [processToken, autoConfirmOnScan]);

  // Start camera stream directly
  const startCamera = useCallback(
    async (mode = facingMode) => {
      stopCamera();
      setCameraError(null);
      setCameraLoading(true);
      setVerificationResult(null);
      setConfirmedResult(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access is not supported by your browser. Please enter code manually below.");
        setCameraLoading(false);
        return;
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: mode },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          // Fallback if ideal constraints are not satisfied
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        streamRef.current = stream;

        const attachVideo = (retries = 15) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current
              .play()
              .then(() => {
                animFrameRef.current = requestAnimationFrame(scanFrame);
                setCameraLoading(false);
              })
              .catch(() => {
                setCameraLoading(false);
              });
          } else if (retries > 0) {
            setTimeout(() => attachVideo(retries - 1), 50);
          } else {
            setCameraLoading(false);
          }
        };

        setTimeout(() => attachVideo(), 40);
      } catch (err: unknown) {
        stopCamera();
        const message =
          err instanceof Error && err.name === "NotAllowedError"
            ? "Camera permission was denied. Please allow camera permissions or enter the code manually."
            : "Could not access camera. Please enter the backup code manually.";
        setCameraError(message);
        setCameraLoading(false);
      }
    },
    [facingMode, stopCamera, scanFrame],
  );

  // Toggle front/rear camera
  const toggleFacingMode = () => {
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
    void startCamera(nextMode);
  };

  // Confirm attendance button handler
  const handleConfirmAttendance = async () => {
    if (!verificationResult?.session?.token) return;
    setIsConfirming(true);

    try {
      const res = await confirmParticipantAttendance({
        data: { token: verificationResult.session.token },
      });

      setConfirmedResult(res);

      if (res.ok) {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate(150);
          } catch {
            // Ignore
          }
        }
        toast.success(`Attendance marked successfully for ${res.participant?.fullName ?? "Participant"}!`);
        onAttendanceConfirmed?.();
      } else {
        toast.error(res.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to confirm attendance.";
      toast.error(msg);
    } finally {
      setIsConfirming(false);
    }
  };

  // Reset state and immediately reactivate camera for next participant
  const handleScanNext = () => {
    setVerificationResult(null);
    setConfirmedResult(null);
    setManualCode("");
    void startCamera();
  };

  // Manage camera lifecycle when dialog opens or closes
  useEffect(() => {
    if (open) {
      setVerificationResult(null);
      setConfirmedResult(null);
      setManualCode("");
      void startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [open, facingMode, startCamera, stopCamera]);

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) {
          stopCamera();
        }
        onOpenChange(val);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6 w-[95vw] sm:w-full">
        <DialogHeader className="pb-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <QrCode className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <DialogTitle className="text-xl font-bold font-display text-foreground">
                  QR Code Attendance Scanner
                </DialogTitle>
                <button
                  type="button"
                  onClick={() => setAutoConfirmOnScan((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer bg-card hover:bg-muted shadow-2xs"
                  title="When ON, verifying a code marks attendance immediately in 1 step"
                >
                  <span className="text-muted-foreground text-[11px]">Auto-Confirm:</span>
                  <Badge className={`text-[10px] font-mono uppercase px-1.5 py-0 ${autoConfirmOnScan ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground border"}`}>
                    {autoConfirmOnScan ? "ON" : "OFF"}
                  </Badge>
                </button>
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Point camera directly at participant's daily rotating QR code to mark attendance.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="pt-1 space-y-4">
          {/* ========================================================================= */}
          {/* STATE 1: ATTENDANCE CONFIRMED SUCCESS */}
          {/* ========================================================================= */}
          {confirmedResult?.ok && confirmedResult.attendance ? (
            <Card className="border-2 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-md">
              <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
                <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8" />
                </div>

                <div className="space-y-1">
                  <Badge className="bg-emerald-600 text-white font-mono text-[11px] mb-1">
                    QR VERIFIED • ATTENDANCE RECORDED
                  </Badge>
                  <h2 className="font-display text-2xl font-bold text-foreground">
                    Attendance Marked Successfully!
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Participant presence is officially confirmed for today's session.
                  </p>
                </div>

                {/* Participant Dossier Card */}
                <div className="flex flex-col sm:flex-row items-center gap-4 bg-card p-4 rounded-2xl border shadow-xs max-w-md w-full justify-center text-center sm:text-left">
                  <ClickableAvatar
                    src={confirmedResult.participant?.photoUrl ?? undefined}
                    alt={confirmedResult.participant?.fullName}
                    fullName={confirmedResult.participant?.fullName}
                    participantCode={confirmedResult.participant?.participantCode}
                    fallback={confirmedResult.participant?.fullName?.slice(0, 2).toUpperCase() ?? "PA"}
                    className="h-20 w-20 border-2 border-emerald-500/40 shadow-xs shrink-0"
                    fallbackClassName="text-base"
                  />
                  <div className="space-y-1">
                    <p className="font-bold text-base text-foreground">{confirmedResult.participant?.fullName}</p>
                    <p className="text-xs font-mono text-muted-foreground">{confirmedResult.participant?.participantCode}</p>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono bg-emerald-500/10 text-emerald-700 border-emerald-200">
                      Method: QR Code
                    </Badge>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      Timestamp: {new Date(confirmedResult.attendance.checkedInAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                <div className="pt-2 w-full sm:w-auto">
                  <Button
                    onClick={handleScanNext}
                    className="gap-2 font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md px-6 py-2.5 w-full sm:w-auto justify-center cursor-pointer"
                  >
                    <Camera className="h-4 w-4" /> Scan Next Participant <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : verificationResult ? (
            /* ========================================================================= */
            /* STATE 2: PARTICIPANT SCANNED (PRE-CONFIRMATION OR STATUS) */
            /* ========================================================================= */
            <Card
              className={`border-2 shadow-md ${
                verificationResult.valid
                  ? "border-emerald-500 bg-card"
                  : verificationResult.resultCode === "ATTENDANCE_ALREADY_MARKED"
                  ? "border-amber-300 bg-amber-50/40 dark:bg-amber-950/20"
                  : "border-destructive/60 bg-destructive/5"
              }`}
            >
              {/* Status Header Banner */}
              <div
                className={`px-4 sm:px-6 py-3 border-b flex items-center justify-between flex-wrap gap-2 ${
                  verificationResult.valid
                    ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-200"
                    : verificationResult.resultCode === "ATTENDANCE_ALREADY_MARKED"
                    ? "bg-amber-100/70 text-amber-800 border-amber-200"
                    : "bg-destructive/10 text-destructive border-destructive/20"
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm">
                  {verificationResult.valid ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  ) : verificationResult.resultCode === "ATTENDANCE_ALREADY_MARKED" ? (
                    <Clock className="h-5 w-5 text-amber-600 shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive shrink-0" />
                  )}
                  <span className="leading-snug">{verificationResult.resultMessage}</span>
                </div>

                <Badge
                  className={`uppercase font-mono text-[10px] shrink-0 ${
                    verificationResult.valid
                      ? "bg-emerald-600 text-white"
                      : verificationResult.resultCode === "ATTENDANCE_ALREADY_MARKED"
                      ? "bg-amber-600 text-white"
                      : "bg-destructive text-white"
                  }`}
                >
                  {verificationResult.resultCode.replace(/_/g, " ")}
                </Badge>
              </div>

              <CardContent className="p-4 sm:p-6 space-y-4">
                {verificationResult.participant && (
                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-muted/20 p-4 rounded-xl border">
                    <ClickableAvatar
                      src={verificationResult.participant.photoUrl ?? undefined}
                      alt={verificationResult.participant.fullName}
                      fullName={verificationResult.participant.fullName}
                      participantCode={verificationResult.participant.participantCode}
                      fallback={verificationResult.participant.fullName.slice(0, 2).toUpperCase()}
                      className="h-24 w-24 rounded-xl border-2 border-primary/30 shadow-sm shrink-0"
                      fallbackClassName="text-xl"
                    />
                    <div className="space-y-1 text-center sm:text-left flex-1 min-w-0">
                      <h3 className="font-display text-lg font-bold text-foreground truncate">
                        {verificationResult.participant.fullName}
                      </h3>
                      <p className="font-mono text-xs font-semibold text-primary">
                        ID: {verificationResult.participant.participantCode}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {verificationResult.participant.email} • {verificationResult.participant.phone}
                      </p>
                      <Badge variant="outline" className="text-[10px] uppercase font-mono mt-1">
                        Status: {verificationResult.participant.verificationStatus}
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {verificationResult.valid ? (
                  <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
                    <Button
                      onClick={handleConfirmAttendance}
                      disabled={isConfirming}
                      className="w-full sm:flex-1 gap-2 font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md py-2.5 justify-center cursor-pointer ring-2 ring-emerald-400 ring-offset-2"
                    >
                      {isConfirming ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      <span>Confirm Attendance Now</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleScanNext}
                      className="w-full sm:w-auto gap-2 text-xs font-semibold justify-center"
                    >
                      <Camera className="h-3.5 w-3.5" /> Scan Again
                    </Button>
                  </div>
                ) : (
                  <div className="pt-2">
                    <Button
                      onClick={handleScanNext}
                      className="w-full gap-2 font-bold bg-primary text-primary-foreground shadow-sm justify-center cursor-pointer"
                    >
                      <Camera className="h-4 w-4" /> Scan Next Participant
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : isVerifying ? (
            /* ========================================================================= */
            /* STATE 3: VERIFYING TOKEN SPINNER */
            /* ========================================================================= */
            <div className="p-10 text-center space-y-3 bg-muted/20 rounded-2xl border">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
              <h3 className="font-display text-lg font-bold">Validating QR Token…</h3>
              <p className="text-xs text-muted-foreground">Checking participant approval and session validity.</p>
            </div>
          ) : (
            /* ========================================================================= */
            /* STATE 4: DIRECT CAMERA SCANNER VIEW */
            /* ========================================================================= */
            <div className="space-y-3">
              {/* Live Camera Viewport */}
              <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-primary/30 shadow-lg flex items-center justify-center min-h-[320px] sm:min-h-[400px]">
                {cameraLoading && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/85 text-white">
                    <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm font-medium">Opening camera video feed…</span>
                  </div>
                )}

                {cameraError ? (
                  <div className="p-6 text-center text-white space-y-3 max-w-sm z-10">
                    <AlertTriangle className="h-10 w-10 text-amber-400 mx-auto" />
                    <p className="text-sm font-semibold">{cameraError}</p>
                    <Button
                      size="sm"
                      onClick={() => void startCamera()}
                      className="gap-1.5 font-bold bg-primary text-primary-foreground"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Retry Camera
                    </Button>
                  </div>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full max-h-[420px] object-cover"
                    />

                    {/* Scanning Reticle Overlay */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                      <div className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-2xl border-2 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] max-w-[80vw] max-h-[80vw]">
                        <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400 -mt-1 -ml-1 rounded-tl" />
                        <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400 -mt-1 -mr-1 rounded-tr" />
                        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400 -mb-1 -ml-1 rounded-bl" />
                        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400 -mb-1 -mr-1 rounded-br" />
                        <div className="absolute inset-x-2 top-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse" />
                      </div>
                    </div>

                    {/* Top Right Controls: Flip Camera */}
                    <div className="absolute top-3 right-3 z-10">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={toggleFacingMode}
                        className="bg-black/60 hover:bg-black/80 text-white border border-white/20 text-xs gap-1.5 backdrop-blur-xs h-8 px-2.5 cursor-pointer"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Flip Camera</span>
                      </Button>
                    </div>

                    {/* Bottom Status Pill */}
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 w-[90%] sm:w-auto text-center">
                      <Badge className="bg-black/80 text-white backdrop-blur-sm border-white/20 text-xs px-3 py-1 font-medium">
                        Align attendee QR code inside the green reticle
                      </Badge>
                    </div>
                  </>
                )}
              </div>

              {/* Manual Backup Code Fallback Input */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 sm:p-3 rounded-xl bg-muted/40 border text-xs">
                <span className="font-semibold text-muted-foreground shrink-0">
                  Manual Backup Code:
                </span>
                <div className="relative flex-1">
                  <Input
                    placeholder="Enter 6-char backup code or paste token…"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void processToken(manualCode, true);
                    }}
                    className="font-mono text-xs w-full h-8"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void processToken(manualCode, true)}
                    disabled={isVerifying || isConfirming || !manualCode.trim()}
                    className="gap-1 font-bold text-xs h-8 px-3 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                    title="Verify code and immediately record attendance in 1 step"
                  >
                    {isVerifying || isConfirming ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UserCheck className="h-3.5 w-3.5" />
                    )}
                    Verify & Confirm
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void processToken(manualCode, false)}
                    disabled={isVerifying || isConfirming || !manualCode.trim()}
                    className="gap-1 text-xs h-8 px-2.5 shrink-0 cursor-pointer"
                    title="Review participant details before confirming attendance"
                  >
                    <Search className="h-3.5 w-3.5" /> Review
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

