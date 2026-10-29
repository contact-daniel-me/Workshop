import { useState, useRef, useEffect, useCallback } from "react";
import jsQR from "jsqr";
import {
  verifyParticipantQr,
  confirmParticipantAttendance,
  type QrVerificationResult,
  type ConfirmAttendanceResult,
} from "@/lib/attendance-qr.server";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Camera,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  User,
  Phone,
  Mail,
  Calendar,
  Clock,
  Sparkles,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  workshopName?: string;
  onAttendanceConfirmed?: () => void;
}

export function AdminQrScannerTab({ workshopName = "SmartAttend Workshop", onAttendanceConfirmed }: Props) {
  // Scanner state
  const [scannerActive, setScannerActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  // Manual code entry
  const [manualCode, setManualCode] = useState("");

  // Verification state
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<QrVerificationResult | null>(null);

  // Confirmation state
  const [confirming, setConfirming] = useState(false);
  const [confirmedResult, setConfirmedResult] = useState<ConfirmAttendanceResult | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Stop camera tracks cleanly
  const stopCamera = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setScannerActive(false);
    setCameraLoading(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Handle incoming token from scanner or manual input
  const processToken = useCallback(
    async (rawToken: string) => {
      if (verifying || confirming) return;
      const clean = rawToken.trim();
      if (!clean) return;

      // Pause scanner while verifying
      stopCamera();
      setVerifying(true);
      setVerificationResult(null);
      setConfirmedResult(null);

      try {
        const res = await verifyParticipantQr({ data: { token: clean } });
        setVerificationResult(res);

        if (res.valid) {
          toast.success("Valid QR detected! Review details and confirm attendance.");
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
        setVerifying(false);
      }
    },
    [verifying, confirming, stopCamera],
  );

  // Scan frame loop using jsQR
  const scanFrame = useCallback(() => {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(scanFrame);
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
        // Successful decode!
        void processToken(code.data);
        return;
      }
    }

    animationFrameRef.current = requestAnimationFrame(scanFrame);
  }, [processToken]);

  // Start device camera
  const startCamera = async (mode = facingMode) => {
    stopCamera();
    setCameraError(null);
    setCameraLoading(true);
    setVerificationResult(null);
    setConfirmedResult(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not supported by your browser. Please enter code manually.");
      setCameraLoading(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setScannerActive(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current
            .play()
            .then(() => {
              animationFrameRef.current = requestAnimationFrame(scanFrame);
            })
            .catch(() => {
              // Video playback failed
            });
        }
        setCameraLoading(false);
      }, 100);
    } catch (err: unknown) {
      stopCamera();
      const message =
        err instanceof Error && err.name === "NotAllowedError"
          ? "Camera permission was denied. Please allow camera permissions or enter the token manually."
          : err instanceof Error && err.name === "NotFoundError"
          ? "No suitable camera device found on this system. Use manual token entry."
          : "Could not access camera. Please enter the token manually.";
      setCameraError(message);
      setCameraLoading(false);
    }
  };

  // Toggle between front and rear cameras
  const toggleCameraFacing = () => {
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
    if (scannerActive) {
      void startCamera(nextMode);
    }
  };

  // Confirm attendance action
  const handleConfirmAttendance = async () => {
    if (!verificationResult?.session?.token) return;
    setConfirming(true);

    try {
      const res = await confirmParticipantAttendance({
        data: { token: verificationResult.session.token },
      });

      setConfirmedResult(res);

      if (res.ok) {
        toast.success(`Attendance marked successfully for ${res.participant?.fullName ?? "Participant"}!`);
        onAttendanceConfirmed?.();
      } else {
        toast.error(res.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to confirm attendance.";
      toast.error(msg);
    } finally {
      setConfirming(false);
    }
  };

  // Reset and prepare for next scan
  const handleResetForNext = () => {
    setVerificationResult(null);
    setConfirmedResult(null);
    setManualCode("");
    void startCamera();
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <Card className="shadow-sm border-2 border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="font-display text-xl font-bold flex items-center gap-2">
                <Camera className="h-5 w-5 text-primary" /> Scan QR Attendance
              </CardTitle>
              <CardDescription>
                Scan an attendee's daily QR code or enter their code manually to verify identity and record attendance.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              {scannerActive ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={toggleCameraFacing}
                    className="gap-1.5 text-xs font-semibold"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Flip Camera
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={stopCamera}
                    className="gap-1.5 text-xs font-semibold"
                  >
                    Stop Scanner
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={() => void startCamera()}
                  className="gap-2 font-bold bg-primary text-primary-foreground shadow-xs"
                >
                  <Camera className="h-4 w-4" /> Start Camera Scanner
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-2">
          {/* Manual Token / Short Code Fallback Input */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 rounded-xl bg-muted/40 border">
            <span className="text-xs font-semibold text-muted-foreground sm:w-40 shrink-0">
              Manual Token / Code:
            </span>
            <div className="relative flex-1">
              <Input
                placeholder="Paste QR token string or 6-char backup short code"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void processToken(manualCode);
                }}
                className="font-mono text-xs pr-20"
              />
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => void processToken(manualCode)}
              disabled={verifying || !manualCode.trim()}
              className="gap-1.5 font-bold text-xs"
            >
              {verifying ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Verify Code
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Camera Live View Window (When Active) */}
      {scannerActive && (
        <Card className="overflow-hidden border-2 border-primary/40 shadow-lg">
          <div className="relative bg-black flex flex-col items-center justify-center min-h-[340px] md:min-h-[420px]">
            {cameraLoading && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/80 text-white">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm font-medium">Opening camera video feed…</span>
              </div>
            )}

            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full max-h-[500px] object-cover"
            />

            {/* Target Reticle Overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
              <div className="relative w-64 h-64 md:w-80 md:h-80 rounded-2xl border-2 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                {/* Corner markers */}
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400 -mt-1 -ml-1 rounded-tl" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400 -mt-1 -mr-1 rounded-tr" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400 -mb-1 -ml-1 rounded-bl" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400 -mb-1 -mr-1 rounded-br" />

                {/* Animated scanline */}
                <div className="absolute inset-x-2 top-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse" />
              </div>
            </div>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
              <Badge className="bg-black/75 text-white backdrop-blur-sm border-white/20 text-xs px-3 py-1">
                Align attendee's QR code within the frame
              </Badge>
            </div>
          </div>
        </Card>
      )}

      {/* Camera Error Alert */}
      {cameraError && (
        <Card className="border-destructive/30 bg-destructive/10 p-4">
          <div className="flex items-start gap-3 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-bold">Camera Unavailable</p>
              <p className="text-xs leading-relaxed">{cameraError}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Loading Indicator */}
      {verifying && (
        <Card className="p-8 text-center space-y-3">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
          <h3 className="font-display text-lg font-bold">Verifying QR Token…</h3>
          <p className="text-xs text-muted-foreground">Checking participant approval, session date, and attendance status.</p>
        </Card>
      )}

      {/* CONFIRMED ATTENDANCE SUCCESS VIEW */}
      {confirmedResult?.ok && confirmedResult.attendance && (
        <Card className="border-2 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-md">
          <CardContent className="p-6 sm:p-8 flex flex-col items-center text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div className="space-y-1">
              <Badge className="bg-emerald-600 text-white font-mono text-[11px] mb-1">
                ATTENDANCE MARKED
              </Badge>
              <h2 className="font-display text-2xl font-bold text-foreground">
                Attendance Marked Successfully!
              </h2>
              <p className="text-sm text-muted-foreground">
                Participant presence is officially confirmed and recorded in the database.
              </p>
            </div>

            {/* Confirmed Details Pill */}
            <div className="flex items-center gap-3 bg-card p-3 rounded-xl border shadow-xs max-w-md w-full justify-center">
              <Avatar className="h-12 w-12 border-2 border-emerald-500/40">
                <AvatarImage src={confirmedResult.participant?.photoUrl ?? undefined} alt={confirmedResult.participant?.fullName} />
                <AvatarFallback className="font-bold text-xs bg-primary/10 text-primary">
                  {confirmedResult.participant?.fullName?.slice(0, 2).toUpperCase() ?? "SA"}
                </AvatarFallback>
              </Avatar>
              <div className="text-left">
                <p className="font-bold text-sm text-foreground">{confirmedResult.participant?.fullName}</p>
                <p className="text-xs font-mono text-muted-foreground">{confirmedResult.participant?.participantCode}</p>
                <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                  Time: {new Date(confirmedResult.attendance.checkedInAt).toLocaleTimeString()} • Method: QR Scan
                </p>
              </div>
            </div>

            <div className="pt-2">
              <Button onClick={handleResetForNext} className="gap-2 font-bold bg-primary text-primary-foreground">
                <Camera className="h-4 w-4" /> Scan Next Participant <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* VERIFICATION RESULT PANEL (Pre-confirmation) */}
      {!confirmedResult?.ok && verificationResult && (
        <Card
          className={`border-2 shadow-md transition-all ${
            verificationResult.valid
              ? "border-emerald-500 bg-card"
              : verificationResult.resultCode === "ATTENDANCE_ALREADY_MARKED"
              ? "border-amber-400 bg-amber-50/30"
              : "border-destructive/60 bg-destructive/5"
          }`}
        >
          {/* Status Header Banner */}
          <div
            className={`px-6 py-3.5 border-b flex items-center justify-between flex-wrap gap-2 ${
              verificationResult.valid
                ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-200"
                : verificationResult.resultCode === "ATTENDANCE_ALREADY_MARKED"
                ? "bg-amber-100/60 text-amber-900 border-amber-200"
                : "bg-destructive/10 text-destructive border-destructive/20"
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-sm">
              {verificationResult.valid ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : verificationResult.resultCode === "ATTENDANCE_ALREADY_MARKED" ? (
                <Clock className="h-5 w-5 text-amber-600" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              <span>{verificationResult.resultMessage}</span>
            </div>

            <Badge
              className={`uppercase font-mono text-[10px] ${
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

          <CardContent className="p-6 space-y-6">
            {/* If participant profile found, show complete verified dossier */}
            {verificationResult.participant ? (
              <div className="grid gap-6 md:grid-cols-3">
                {/* Profile Photo Display (Authenticated signed URL from private photos bucket) */}
                <div className="flex flex-col items-center justify-center p-4 rounded-xl border bg-muted/20 space-y-3 text-center">
                  <div className="relative">
                    <Avatar className="h-28 w-28 rounded-2xl border-4 border-primary/20 shadow-md">
                      <AvatarImage
                        src={verificationResult.participant.photoUrl ?? undefined}
                        alt={verificationResult.participant.fullName}
                        className="object-cover"
                      />
                      <AvatarFallback className="font-bold text-2xl bg-primary/10 text-primary">
                        {verificationResult.participant.fullName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground text-[10px] uppercase font-mono px-2">
                        Official Portrait
                      </Badge>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-1">
                    Compare face against registered portrait
                  </p>
                </div>

                {/* Participant Details */}
                <div className="md:col-span-2 space-y-3.5">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div>
                      <h3 className="font-display text-xl font-bold text-foreground">
                        {verificationResult.participant.fullName}
                      </h3>
                      <p className="font-mono text-xs font-semibold text-primary">
                        ID: {verificationResult.participant.participantCode}
                      </p>
                    </div>
                    <Badge
                      className={
                        verificationResult.participant.verificationStatus === "verified"
                          ? "bg-success text-success-foreground text-xs"
                          : "bg-warning text-warning-foreground text-xs"
                      }
                    >
                      {verificationResult.participant.verificationStatus.toUpperCase()}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-2.5 rounded-lg border bg-card space-y-1">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5 text-primary" /> Email Address
                      </span>
                      <p className="font-semibold text-foreground truncate">
                        {verificationResult.participant.email}
                      </p>
                    </div>

                    <div className="p-2.5 rounded-lg border bg-card space-y-1">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5 text-primary" /> Mobile Number
                      </span>
                      <p className="font-semibold text-foreground font-mono">
                        {verificationResult.participant.phone}
                      </p>
                    </div>

                    <div className="p-2.5 rounded-lg border bg-card space-y-1">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-primary" /> Workshop Session
                      </span>
                      <p className="font-semibold text-foreground truncate">
                        {workshopName}
                      </p>
                    </div>

                    <div className="p-2.5 rounded-lg border bg-card space-y-1">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-primary" /> Official Date
                      </span>
                      <p className="font-semibold text-foreground font-mono">
                        {verificationResult.session?.dayDate || "Today"}
                      </p>
                    </div>
                  </div>

                  {/* Existing attendance record if already marked */}
                  {verificationResult.attendance && (
                    <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs flex items-center justify-between">
                      <span className="font-medium">
                        Existing check-in: {new Date(verificationResult.attendance.checkedInAt).toLocaleTimeString()}
                      </span>
                      <Badge className="bg-amber-600 text-white text-[10px] uppercase">
                        {verificationResult.attendance.status}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* If no participant details found for invalid token */
              <div className="py-6 text-center text-sm text-muted-foreground space-y-2">
                <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
                <p className="font-medium text-foreground">No participant details available for this code.</p>
                <p className="text-xs">Security policy restricts participant details for invalid or unapproved tokens.</p>
              </div>
            )}

            {/* Bottom Actions Bar */}
            <div className="flex items-center justify-between pt-4 border-t flex-wrap gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetForNext}
                className="text-xs gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Scan Again / Reset
              </Button>

              {/* Requirement 5: Confirm Attendance Button */}
              {verificationResult.valid && (
                <Button
                  size="default"
                  onClick={handleConfirmAttendance}
                  disabled={confirming}
                  className="gap-2 font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md text-sm px-6"
                >
                  {confirming ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" /> Recording…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-5 w-5" /> Confirm Attendance
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
