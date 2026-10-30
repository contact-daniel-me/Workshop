import { useState, useRef, useEffect, useCallback } from "react";
import jsQR from "jsqr";
import {
  verifyParticipantQr,
  confirmParticipantAttendance,
  adminVerifyFaceAttendance,
  type QrVerificationResult,
  type ConfirmAttendanceResult,
  type AdminFaceVerificationResult,
} from "@/lib/attendance-qr.server";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ClickableAvatar } from "@/components/ui/profile-photo-lightbox";
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
  ScanLine,
  ScanFace,
  Users,
  Target,
  UserCheck,
  Check,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  workshopName?: string;
  onAttendanceConfirmed?: () => void;
  approvedParticipants?: Array<{
    id: string;
    full_name: string;
    participant_code: string;
    email: string;
    phone: string;
    photo_path: string | null;
  }>;
}

export function AdminQrScannerTab({
  workshopName = "SmartAttend Workshop",
  onAttendanceConfirmed,
  approvedParticipants = [],
}: Props) {
  // Verification Mode: QR Scanner (Option A) vs Face Recognition (Option B)
  const [activeMode, setActiveMode] = useState<"qr" | "face">("qr");

  // =========================================================================
  // OPTION A: QR SCANNER STATE
  // =========================================================================
  const [qrScannerActive, setQrScannerActive] = useState(false);
  const [qrCameraLoading, setQrCameraLoading] = useState(false);
  const [qrCameraError, setQrCameraError] = useState<string | null>(null);
  const [qrFacingMode, setQrFacingMode] = useState<"environment" | "user">("environment");
  const [manualCode, setManualCode] = useState("");
  const [qrVerifying, setQrVerifying] = useState(false);
  const [qrVerificationResult, setQrVerificationResult] = useState<QrVerificationResult | null>(null);
  const [qrConfirming, setQrConfirming] = useState(false);
  const [qrConfirmedResult, setQrConfirmedResult] = useState<ConfirmAttendanceResult | null>(null);

  const qrVideoRef = useRef<HTMLVideoElement | null>(null);
  const qrStreamRef = useRef<MediaStream | null>(null);
  const qrAnimationFrameRef = useRef<number | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // =========================================================================
  // OPTION B: FACE RECOGNITION STATE
  // =========================================================================
  const [faceCameraActive, setFaceCameraActive] = useState(false);
  const [faceCameraLoading, setFaceCameraLoading] = useState(false);
  const [faceCameraError, setFaceCameraError] = useState<string | null>(null);
  const [faceFacingMode, setFaceFacingMode] = useState<"environment" | "user">("environment");
  const [faceVerifying, setFaceVerifying] = useState(false);
  const [faceResult, setFaceResult] = useState<AdminFaceVerificationResult | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>("");
  const [faceSearchTerm, setFaceSearchTerm] = useState("");

  const faceVideoRef = useRef<HTMLVideoElement | null>(null);
  const faceStreamRef = useRef<MediaStream | null>(null);
  const faceCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Clean stop for QR camera
  const stopQrCamera = useCallback(() => {
    if (qrAnimationFrameRef.current) {
      cancelAnimationFrame(qrAnimationFrameRef.current);
      qrAnimationFrameRef.current = null;
    }
    if (qrStreamRef.current) {
      qrStreamRef.current.getTracks().forEach((track) => track.stop());
      qrStreamRef.current = null;
    }
    setQrScannerActive(false);
    setQrCameraLoading(false);
  }, []);

  // Clean stop for Face camera
  const stopFaceCamera = useCallback(() => {
    if (faceStreamRef.current) {
      faceStreamRef.current.getTracks().forEach((track) => track.stop());
      faceStreamRef.current = null;
    }
    setFaceCameraActive(false);
    setFaceCameraLoading(false);
  }, []);

  // Cleanup on unmount or tab change
  useEffect(() => {
    return () => {
      stopQrCamera();
      stopFaceCamera();
    };
  }, [stopQrCamera, stopFaceCamera]);

  // Handle mode change
  const handleModeChange = (mode: "qr" | "face") => {
    stopQrCamera();
    stopFaceCamera();
    setActiveMode(mode);
    setQrVerificationResult(null);
    setQrConfirmedResult(null);
    setFaceResult(null);
  };

  // =========================================================================
  // QR SCANNER LOGIC
  // =========================================================================
  const processToken = useCallback(
    async (rawToken: string) => {
      if (qrVerifying || qrConfirming) return;
      const clean = rawToken.trim();
      if (!clean) return;

      stopQrCamera();
      setQrVerifying(true);
      setQrVerificationResult(null);
      setQrConfirmedResult(null);

      try {
        const res = await verifyParticipantQr({ data: { token: clean } });
        setQrVerificationResult(res);

        if (res.valid) {
          toast.success("Valid QR detected! Review details and confirm attendance.");
        } else {
          toast.warning(res.resultMessage || "QR verification returned an issue.");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Verification request failed";
        setQrVerificationResult({
          valid: false,
          resultCode: "VERIFICATION_FAILED",
          resultMessage: msg,
        });
        toast.error(msg);
      } finally {
        setQrVerifying(false);
      }
    },
    [qrVerifying, qrConfirming, stopQrCamera],
  );

  const scanFrame = useCallback(() => {
    if (!qrVideoRef.current || qrVideoRef.current.readyState < 2) {
      qrAnimationFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const video = qrVideoRef.current;
    if (!qrCanvasRef.current) {
      qrCanvasRef.current = document.createElement("canvas");
    }

    const canvas = qrCanvasRef.current;
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
        void processToken(code.data);
        return;
      }
    }

    qrAnimationFrameRef.current = requestAnimationFrame(scanFrame);
  }, [processToken]);

  const startQrCamera = async (mode = qrFacingMode) => {
    stopQrCamera();
    setQrCameraError(null);
    setQrCameraLoading(true);
    setQrVerificationResult(null);
    setQrConfirmedResult(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setQrCameraError("Camera access is not supported by your browser. Please enter code manually.");
      setQrCameraLoading(false);
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

      qrStreamRef.current = stream;
      setQrScannerActive(true);

      setTimeout(() => {
        if (qrVideoRef.current) {
          qrVideoRef.current.srcObject = stream;
          qrVideoRef.current
            .play()
            .then(() => {
              qrAnimationFrameRef.current = requestAnimationFrame(scanFrame);
            })
            .catch(() => {});
        }
        setQrCameraLoading(false);
      }, 100);
    } catch (err: unknown) {
      stopQrCamera();
      const message =
        err instanceof Error && err.name === "NotAllowedError"
          ? "Camera permission was denied. Please allow camera permissions or enter the token manually."
          : "Could not access camera. Please enter the token manually.";
      setQrCameraError(message);
      setQrCameraLoading(false);
    }
  };

  const toggleQrCameraFacing = () => {
    const nextMode = qrFacingMode === "environment" ? "user" : "environment";
    setQrFacingMode(nextMode);
    if (qrScannerActive) {
      void startQrCamera(nextMode);
    }
  };

  const handleConfirmAttendance = async () => {
    if (!qrVerificationResult?.session?.token) return;
    setQrConfirming(true);

    try {
      const res = await confirmParticipantAttendance({
        data: { token: qrVerificationResult.session.token },
      });

      setQrConfirmedResult(res);

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
      setQrConfirming(false);
    }
  };

  const handleResetQr = () => {
    setQrVerificationResult(null);
    setQrConfirmedResult(null);
    setManualCode("");
    void startQrCamera();
  };

  // =========================================================================
  // FACE RECOGNITION LOGIC
  // =========================================================================
  const startFaceCamera = async (mode = faceFacingMode) => {
    stopFaceCamera();
    setFaceCameraError(null);
    setFaceCameraLoading(true);
    setFaceResult(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setFaceCameraError("Camera access is not supported by your browser.");
      setFaceCameraLoading(false);
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

      faceStreamRef.current = stream;
      setFaceCameraActive(true);

      setTimeout(() => {
        if (faceVideoRef.current) {
          faceVideoRef.current.srcObject = stream;
          faceVideoRef.current.play().catch(() => {});
        }
        setFaceCameraLoading(false);
      }, 100);
    } catch (err: unknown) {
      stopFaceCamera();
      const message =
        err instanceof Error && err.name === "NotAllowedError"
          ? "Camera permission was denied for face verification. Please grant camera permission."
          : "Could not access camera for face verification.";
      setFaceCameraError(message);
      setFaceCameraLoading(false);
    }
  };

  const toggleFaceCameraFacing = () => {
    const nextMode = faceFacingMode === "environment" ? "user" : "environment";
    setFaceFacingMode(nextMode);
    if (faceCameraActive) {
      void startFaceCamera(nextMode);
    }
  };

  // Capture face and submit to backend verification function
  const handleCaptureAndVerifyFace = async () => {
    if (!faceVideoRef.current || faceVerifying) return;
    const video = faceVideoRef.current;

    if (!faceCanvasRef.current) {
      faceCanvasRef.current = document.createElement("canvas");
    }

    const canvas = faceCanvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Pre-flight image quality check: Illumination variance
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let totalLuminance = 0;
    const pixelCount = imgData.width * imgData.height;
    for (let i = 0; i < imgData.data.length; i += 16) {
      const r = imgData.data[i] ?? 0;
      const g = imgData.data[i + 1] ?? 0;
      const b = imgData.data[i + 2] ?? 0;
      totalLuminance += 0.299 * r + 0.587 * g + 0.114 * b;
    }
    const avgBrightness = totalLuminance / (pixelCount / 4);

    if (avgBrightness < 25) {
      toast.warning("Lighting is too dark. Please ensure participant's face is well illuminated.");
    }

    const imageBase64 = canvas.toDataURL("image/jpeg", 0.92);

    setFaceVerifying(true);
    setFaceResult(null);

    try {
      const res = await adminVerifyFaceAttendance({
        data: {
          imageBase64,
          participantId: selectedParticipantId || undefined,
        },
      });

      setFaceResult(res);

      if (res.ok) {
        if (res.resultCode === "VERIFIED_PRESENT") {
          toast.success("Attendance Marked Successfully — Face Verified!");
          onAttendanceConfirmed?.();
        } else if (res.resultCode === "ALREADY_MARKED") {
          toast.info(res.message);
        }
      } else {
        if (res.resultCode === "FACE_NOT_RECOGNIZED") {
          toast.warning(res.message);
        } else {
          toast.error(res.message);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Face verification failed.";
      toast.error(msg);
      setFaceResult({
        ok: false,
        resultCode: "ERROR",
        message: msg,
      });
    } finally {
      setFaceVerifying(false);
    }
  };

  const handleResetFace = () => {
    setFaceResult(null);
    void startFaceCamera();
  };

  // Filter approved participants for 1-to-1 dropdown
  const filteredApproved = approvedParticipants.filter((p) => {
    if (!faceSearchTerm) return true;
    const q = faceSearchTerm.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(q) ||
      p.participant_code.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* UNIFIED VERIFICATION CONSOLE HEADER & METHOD SELECTOR */}
      {/* ========================================================================= */}
      <Card className="border-2 border-primary/25 shadow-sm overflow-hidden">
        <CardHeader className="pb-3 bg-muted/20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-6 w-6 text-primary" />
                <CardTitle className="font-display text-xl font-bold">
                  Attendance Verification Console
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-mono border-primary/40 text-primary">
                  ADMIN CONSOLE
                </Badge>
              </div>
              <CardDescription className="mt-1">
                Independent verification methods: mark attendance by <strong>QR Code</strong> OR{" "}
                <strong>Face Recognition</strong>. Either successful method confirms presence.
              </CardDescription>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex items-center p-1 bg-muted rounded-xl border shrink-0">
              <Button
                size="sm"
                variant={activeMode === "qr" ? "default" : "ghost"}
                onClick={() => handleModeChange("qr")}
                className={`gap-2 text-xs font-bold rounded-lg transition-all ${
                  activeMode === "qr" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground"
                }`}
              >
                <QrCode className="h-4 w-4" /> Option A: QR Code
              </Button>
              <Button
                size="sm"
                variant={activeMode === "face" ? "default" : "ghost"}
                onClick={() => handleModeChange("face")}
                className={`gap-2 text-xs font-bold rounded-lg transition-all ${
                  activeMode === "face"
                    ? "bg-purple-700 hover:bg-purple-800 text-white shadow-xs"
                    : "text-muted-foreground"
                }`}
              >
                <ScanFace className="h-4 w-4" /> Option B: Face Recognition
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* ========================================================================= */}
      {/* OPTION A: QR CODE VERIFICATION PANEL */}
      {/* ========================================================================= */}
      {activeMode === "qr" && (
        <div className="space-y-6">
          <Card className="shadow-sm border">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="font-display text-lg font-bold flex items-center gap-2">
                    <QrCode className="h-5 w-5 text-primary" /> QR Code Verification
                  </CardTitle>
                  <CardDescription>
                    Scan participant's daily rotating QR code or enter their 6-character backup token.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  {qrScannerActive ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={toggleQrCameraFacing}
                        className="gap-1.5 text-xs font-semibold"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Flip Camera
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={stopQrCamera}
                        className="gap-1.5 text-xs font-semibold"
                      >
                        Stop Scanner
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => void startQrCamera()}
                      className="gap-2 font-bold bg-primary text-primary-foreground shadow-xs"
                    >
                      <Camera className="h-4 w-4" /> Start QR Scanner
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-1">
              {/* Manual Token / Short Code Fallback */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 rounded-xl bg-muted/40 border">
                <span className="text-xs font-semibold text-muted-foreground sm:w-44 shrink-0">
                  Manual Token / Backup Code:
                </span>
                <div className="relative flex-1">
                  <Input
                    placeholder="Paste QR token string or 6-char backup code…"
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
                  disabled={qrVerifying || !manualCode.trim()}
                  className="gap-1.5 font-bold text-xs"
                >
                  {qrVerifying ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  Verify Code
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* QR Camera Video Window */}
          {qrScannerActive && (
            <Card className="overflow-hidden border-2 border-primary/40 shadow-lg">
              <div className="relative bg-black flex flex-col items-center justify-center min-h-[340px] md:min-h-[420px]">
                {qrCameraLoading && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/80 text-white">
                    <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm font-medium">Opening camera video feed…</span>
                  </div>
                )}

                <video
                  ref={qrVideoRef}
                  playsInline
                  muted
                  className="w-full h-full max-h-[500px] object-cover"
                />

                {/* Target Reticle Overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                  <div className="relative w-64 h-64 md:w-80 md:h-80 rounded-2xl border-2 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400 -mt-1 -ml-1 rounded-tl" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400 -mt-1 -mr-1 rounded-tr" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400 -mb-1 -ml-1 rounded-bl" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400 -mb-1 -mr-1 rounded-br" />
                    <div className="absolute inset-x-2 top-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse" />
                  </div>
                </div>

                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
                  <Badge className="bg-black/75 text-white backdrop-blur-sm border-white/20 text-xs px-3 py-1">
                    Align attendee QR code inside the green reticle
                  </Badge>
                </div>
              </div>
            </Card>
          )}

          {/* QR Camera Error Alert */}
          {qrCameraError && (
            <Card className="border-destructive/30 bg-destructive/10 p-4">
              <div className="flex items-start gap-3 text-destructive">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-bold">QR Camera Unavailable</p>
                  <p className="text-xs leading-relaxed">{qrCameraError}</p>
                </div>
              </div>
            </Card>
          )}

          {/* QR Verifying Spinner */}
          {qrVerifying && (
            <Card className="p-8 text-center space-y-3">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
              <h3 className="font-display text-lg font-bold">Validating QR Token…</h3>
              <p className="text-xs text-muted-foreground">Checking participant approval and session validity.</p>
            </Card>
          )}

          {/* QR CONFIRMED SUCCESS VIEW */}
          {qrConfirmedResult?.ok && qrConfirmedResult.attendance && (
            <Card className="border-2 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-md">
              <CardContent className="p-6 sm:p-8 flex flex-col items-center text-center space-y-4">
                <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8" />
                </div>

                <div className="space-y-1">
                  <Badge className="bg-emerald-600 text-white font-mono text-[11px] mb-1">
                    QR VERIFIED • ATTENDANCE RECORDED
                  </Badge>
                  <h2 className="font-display text-2xl font-bold text-foreground">
                    Attendance Marked Successfully — QR Verified.
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Participant presence is officially confirmed and recorded in the database.
                  </p>
                </div>

                {/* Confirmed Dossier Pill */}
                <div className="flex items-center gap-4 bg-card p-4 rounded-2xl border shadow-xs max-w-md w-full justify-center">
                  <ClickableAvatar
                    src={qrConfirmedResult.participant?.photoUrl ?? undefined}
                    alt={qrConfirmedResult.participant?.fullName}
                    fullName={qrConfirmedResult.participant?.fullName}
                    participantCode={qrConfirmedResult.participant?.participantCode}
                    fallback={qrConfirmedResult.participant?.fullName?.slice(0, 2).toUpperCase() ?? "SA"}
                    className="h-20 w-20 border-2 border-emerald-500/40 shadow-xs"
                    fallbackClassName="text-base"
                  />
                  <div className="text-left space-y-1">
                    <p className="font-bold text-base text-foreground">{qrConfirmedResult.participant?.fullName}</p>
                    <p className="text-xs font-mono text-muted-foreground">{qrConfirmedResult.participant?.participantCode}</p>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono bg-emerald-500/10 text-emerald-700 border-emerald-200">
                      Method: QR Code
                    </Badge>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      Timestamp: {new Date(qrConfirmedResult.attendance.checkedInAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                <div className="pt-2">
                  <Button onClick={handleResetQr} className="gap-2 font-bold bg-primary text-primary-foreground shadow-md px-6">
                    <Camera className="h-4 w-4" /> Next Participant <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* QR PRE-CONFIRMATION RESULT CARD */}
          {!qrConfirmedResult?.ok && qrVerificationResult && (
            <Card
              className={`border-2 shadow-md transition-all ${
                qrVerificationResult.valid
                  ? "border-emerald-500 bg-card"
                  : qrVerificationResult.resultCode === "ATTENDANCE_ALREADY_MARKED"
                  ? "border-slate-300 bg-slate-50/50 dark:bg-slate-900/30"
                  : "border-destructive/60 bg-destructive/5"
              }`}
            >
              {/* Status Header Banner */}
              <div
                className={`px-6 py-3.5 border-b flex items-center justify-between flex-wrap gap-2 ${
                  qrVerificationResult.valid
                    ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-200"
                    : qrVerificationResult.resultCode === "ATTENDANCE_ALREADY_MARKED"
                    ? "bg-slate-200/60 text-slate-800 border-slate-300"
                    : "bg-destructive/10 text-destructive border-destructive/20"
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm">
                  {qrVerificationResult.valid ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : qrVerificationResult.resultCode === "ATTENDANCE_ALREADY_MARKED" ? (
                    <Clock className="h-5 w-5 text-slate-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive" />
                  )}
                  <span>{qrVerificationResult.resultMessage}</span>
                </div>

                <Badge
                  className={`uppercase font-mono text-[10px] ${
                    qrVerificationResult.valid
                      ? "bg-emerald-600 text-white"
                      : qrVerificationResult.resultCode === "ATTENDANCE_ALREADY_MARKED"
                      ? "bg-slate-600 text-white"
                      : "bg-destructive text-white"
                  }`}
                >
                  {qrVerificationResult.resultCode.replace(/_/g, " ")}
                </Badge>
              </div>

              <CardContent className="p-6 space-y-6">
                {qrVerificationResult.participant ? (
                  <div className="grid gap-6 md:grid-cols-3">
                    <div className="flex flex-col items-center justify-center p-4 rounded-xl border bg-muted/20 space-y-3 text-center">
                      <div className="relative">
                        <ClickableAvatar
                          src={qrVerificationResult.participant.photoUrl ?? undefined}
                          alt={qrVerificationResult.participant.fullName}
                          fullName={qrVerificationResult.participant.fullName}
                          participantCode={qrVerificationResult.participant.participantCode}
                          verificationStatus={qrVerificationResult.participant.verificationStatus}
                          fallback={qrVerificationResult.participant.fullName.slice(0, 2).toUpperCase()}
                          className="h-28 w-28 sm:h-32 sm:w-32 rounded-2xl border-4 border-primary/20 shadow-md"
                          fallbackClassName="text-2xl"
                        />
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 pointer-events-none">
                          <Badge className="bg-primary text-primary-foreground text-[10px] uppercase font-mono px-2">
                            Official Portrait
                          </Badge>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground pt-1">
                        Click photograph to view full size
                      </p>
                    </div>

                    <div className="md:col-span-2 space-y-3.5">
                      <div className="flex items-center justify-between border-b pb-2">
                        <div>
                          <h3 className="font-display text-xl font-bold text-foreground">
                            {qrVerificationResult.participant.fullName}
                          </h3>
                          <p className="font-mono text-xs font-semibold text-primary">
                            ID: {qrVerificationResult.participant.participantCode}
                          </p>
                        </div>
                        <Badge
                          className={
                            qrVerificationResult.participant.verificationStatus === "verified"
                              ? "bg-success text-success-foreground text-xs"
                              : "bg-warning text-warning-foreground text-xs"
                          }
                        >
                          {qrVerificationResult.participant.verificationStatus.toUpperCase()}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="p-2.5 rounded-lg border bg-card space-y-1">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3.5 w-3.5 text-primary" /> Registered Email
                          </span>
                          <p className="font-semibold text-foreground truncate">
                            {qrVerificationResult.participant.email}
                          </p>
                        </div>

                        <div className="p-2.5 rounded-lg border bg-card space-y-1">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5 text-primary" /> Mobile Phone
                          </span>
                          <p className="font-semibold text-foreground font-mono">
                            {qrVerificationResult.participant.phone}
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
                            <Clock className="h-3.5 w-3.5 text-primary" /> Session Date
                          </span>
                          <p className="font-semibold text-foreground font-mono">
                            {qrVerificationResult.session?.dayDate || "Today"}
                          </p>
                        </div>
                      </div>

                      {qrVerificationResult.attendance && (
                        <div className="p-3 rounded-lg border border-slate-300 bg-slate-100/70 text-slate-800 text-xs flex items-center justify-between">
                          <span className="font-medium">
                            Existing Check-in: {new Date(qrVerificationResult.attendance.checkedInAt).toLocaleTimeString()} ({qrVerificationResult.attendance.method})
                          </span>
                          <Badge className="bg-slate-600 text-white text-[10px] uppercase">
                            ALREADY RECORDED
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center text-sm text-muted-foreground space-y-2">
                    <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
                    <p className="font-medium text-foreground">No participant details available for this code.</p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t flex-wrap gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetQr}
                    className="text-xs gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Next Participant
                  </Button>

                  {qrVerificationResult.valid && (
                    <Button
                      size="default"
                      onClick={handleConfirmAttendance}
                      disabled={qrConfirming}
                      className="gap-2 font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md text-sm px-6"
                    >
                      {qrConfirming ? (
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
      )}

      {/* ========================================================================= */}
      {/* OPTION B: FACE RECOGNITION VERIFICATION PANEL */}
      {/* ========================================================================= */}
      {activeMode === "face" && (
        <div className="space-y-6">
          <Card className="shadow-sm border">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="font-display text-lg font-bold flex items-center gap-2">
                    <ScanFace className="h-5 w-5 text-purple-600" /> Face Recognition Verification
                  </CardTitle>
                  <CardDescription>
                    Capture attendee's face using the live camera to match against enrolled reference photos.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  {faceCameraActive ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={toggleFaceCameraFacing}
                        className="gap-1.5 text-xs font-semibold"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Flip Camera
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={stopFaceCamera}
                        className="gap-1.5 text-xs font-semibold"
                      >
                        Stop Camera
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => void startFaceCamera()}
                      className="gap-2 font-bold bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white shadow-md hover:shadow-lg rounded-xl transition-all duration-200 active:scale-95 px-4 py-2"
                    >
                      <ScanFace className="h-4 w-4 text-purple-100" /> Start Face Camera
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-1">
              {/* Optional 1-to-1 Targeted Participant Selector */}
              <div className="p-3.5 rounded-2xl bg-muted/30 border border-muted-foreground/15 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="h-7 w-7 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center shrink-0">
                      <ScanFace className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-foreground">Matching Scope</span>
                      <p className="text-[11px] text-muted-foreground">Select candidate matching criteria</p>
                    </div>
                  </div>

                  <div className="flex items-center p-1 bg-muted/80 rounded-xl border border-muted-foreground/10 shrink-0 gap-1.5 flex-wrap sm:flex-nowrap">
                    <button
                      type="button"
                      onClick={() => setSelectedParticipantId("")}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer ${
                        !selectedParticipantId
                          ? "bg-purple-700 text-white shadow-xs font-bold"
                          : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                      }`}
                    >
                      <Users className="h-3.5 w-3.5 shrink-0" />
                      <span>1-to-N Auto Match</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (approvedParticipants.length && !selectedParticipantId) {
                          setSelectedParticipantId(approvedParticipants[0]?.id || "");
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer ${
                        selectedParticipantId
                          ? "bg-purple-700 text-white shadow-xs font-bold"
                          : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                      }`}
                    >
                      <Target className="h-3.5 w-3.5 shrink-0" />
                      <span>1-to-1 Specific Attendee</span>
                    </button>
                  </div>
                </div>

                {selectedParticipantId !== "" && (
                  <div className="grid gap-2 sm:grid-cols-2 pt-2 border-t">
                    <Input
                      placeholder="Search attendee by name or code…"
                      value={faceSearchTerm}
                      onChange={(e) => setFaceSearchTerm(e.target.value)}
                      className="text-xs font-mono h-8"
                    />
                    <select
                      value={selectedParticipantId}
                      onChange={(e) => setSelectedParticipantId(e.target.value)}
                      className="text-xs font-medium rounded-md border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {filteredApproved.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name} ({p.participant_code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Face Camera Video Window */}
          {faceCameraActive && (
            <Card className="overflow-hidden border-2 border-purple-500/40 shadow-lg">
              <div className="relative bg-black flex flex-col items-center justify-center min-h-[380px] md:min-h-[460px]">
                {faceCameraLoading && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/80 text-white">
                    <RefreshCw className="h-8 w-8 animate-spin text-purple-400" />
                    <span className="text-sm font-medium">Initializing camera feed…</span>
                  </div>
                )}

                <video
                  ref={faceVideoRef}
                  playsInline
                  muted
                  className="w-full h-full max-h-[520px] object-cover"
                />

                {/* Face Oval Reticle Overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                  <div className="relative w-64 h-80 md:w-72 md:h-96 rounded-[50%] border-2 border-purple-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] flex items-center justify-center">
                    {/* Guidance marks */}
                    <div className="w-12 h-0.5 bg-purple-400/60 absolute left-2" />
                    <div className="w-12 h-0.5 bg-purple-400/60 absolute right-2" />
                    <div className="h-8 w-0.5 bg-purple-400/60 absolute top-2" />
                    <div className="h-8 w-0.5 bg-purple-400/60 absolute bottom-2" />
                  </div>
                </div>

                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                  <Badge className="bg-black/75 text-white backdrop-blur-sm border-white/20 text-xs px-3 py-1">
                    Align participant's face within the oval guide
                  </Badge>
                </div>

                {/* Camera Action Control */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3">
                  <Button
                    size="lg"
                    onClick={handleCaptureAndVerifyFace}
                    disabled={faceVerifying}
                    className="gap-2.5 font-bold bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white shadow-2xl px-8 py-6 rounded-full text-base transition-all duration-200 active:scale-95 border border-white/20"
                  >
                    {faceVerifying ? (
                      <>
                        <RefreshCw className="h-5 w-5 animate-spin" /> Verifying Biometrics…
                      </>
                    ) : (
                      <>
                        <ScanFace className="h-5 w-5" /> Capture & Verify Face
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Face Camera Error Alert */}
          {faceCameraError && (
            <Card className="border-destructive/30 bg-destructive/10 p-4">
              <div className="flex items-start gap-3 text-destructive">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-bold">Camera Unavailable</p>
                  <p className="text-xs leading-relaxed">{faceCameraError}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Face Verifying Spinner */}
          {faceVerifying && (
            <Card className="p-8 text-center space-y-3">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-purple-600" />
              <h3 className="font-display text-lg font-bold">Analyzing Facial Features…</h3>
              <p className="text-xs text-muted-foreground">
                Comparing live capture against enrolled biometric reference photos and anti-spoofing checks.
              </p>
            </Card>
          )}

          {/* FACE VERIFICATION RESULT CARD */}
          {faceResult && (
            <Card
              className={`border-2 shadow-md transition-all ${
                faceResult.ok && faceResult.resultCode === "VERIFIED_PRESENT"
                  ? "border-emerald-500 bg-card"
                  : faceResult.resultCode === "ALREADY_MARKED"
                  ? "border-slate-300 bg-slate-50/50 dark:bg-slate-900/30"
                  : faceResult.resultCode === "UNCERTAIN_MATCH_PENDING_REVIEW"
                  ? "border-amber-400 bg-amber-50/20"
                  : "border-destructive/60 bg-destructive/5"
              }`}
            >
              {/* Status Header Banner */}
              <div
                className={`px-6 py-3.5 border-b flex items-center justify-between flex-wrap gap-2 ${
                  faceResult.ok && faceResult.resultCode === "VERIFIED_PRESENT"
                    ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-200"
                    : faceResult.resultCode === "ALREADY_MARKED"
                    ? "bg-slate-200/60 text-slate-800 border-slate-300"
                    : faceResult.resultCode === "UNCERTAIN_MATCH_PENDING_REVIEW"
                    ? "bg-amber-100/60 text-amber-900 border-amber-200"
                    : "bg-destructive/10 text-destructive border-destructive/20"
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm">
                  {faceResult.ok && faceResult.resultCode === "VERIFIED_PRESENT" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : faceResult.resultCode === "ALREADY_MARKED" ? (
                    <Clock className="h-5 w-5 text-slate-600" />
                  ) : faceResult.resultCode === "UNCERTAIN_MATCH_PENDING_REVIEW" ? (
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive" />
                  )}
                  <span>{faceResult.message}</span>
                </div>

                {faceResult.confidence !== undefined && (
                  <Badge
                    className={`font-mono text-xs ${
                      faceResult.ok && faceResult.resultCode === "VERIFIED_PRESENT"
                        ? "bg-emerald-600 text-white"
                        : faceResult.resultCode === "ALREADY_MARKED"
                        ? "bg-slate-600 text-white"
                        : "bg-destructive text-white"
                    }`}
                  >
                    Match Confidence: {faceResult.confidence}%
                  </Badge>
                )}
              </div>

              <CardContent className="p-6 space-y-6">
                {/* Matched Participant Dossier */}
                {faceResult.participant ? (
                  <div className="grid gap-6 md:grid-cols-3">
                    <div className="flex flex-col items-center justify-center p-4 rounded-xl border bg-muted/20 space-y-3 text-center">
                      <div className="relative">
                        <ClickableAvatar
                          src={faceResult.participant.photoUrl ?? undefined}
                          alt={faceResult.participant.fullName}
                          fullName={faceResult.participant.fullName}
                          participantCode={faceResult.participant.participantCode}
                          verificationStatus={faceResult.participant.verificationStatus}
                          fallback={faceResult.participant.fullName.slice(0, 2).toUpperCase()}
                          className="h-28 w-28 sm:h-32 sm:w-32 rounded-2xl border-4 border-purple-500/30 shadow-md"
                          fallbackClassName="text-2xl"
                        />
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 pointer-events-none">
                          <Badge className="bg-purple-700 text-white text-[10px] uppercase font-mono px-2">
                            Enrolled Biometric Face
                          </Badge>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground pt-1">
                        Click photograph to view full size
                      </p>
                    </div>

                    <div className="md:col-span-2 space-y-3.5">
                      <div className="flex items-center justify-between border-b pb-2">
                        <div>
                          <h3 className="font-display text-xl font-bold text-foreground">
                            {faceResult.participant.fullName}
                          </h3>
                          <p className="font-mono text-xs font-semibold text-primary">
                            ID: {faceResult.participant.participantCode}
                          </p>
                        </div>
                        <Badge className="bg-purple-600 text-white text-xs font-mono">
                          FACE VERIFIED
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="p-2.5 rounded-lg border bg-card space-y-1">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3.5 w-3.5 text-primary" /> Registered Email
                          </span>
                          <p className="font-semibold text-foreground truncate">
                            {faceResult.participant.email}
                          </p>
                        </div>

                        <div className="p-2.5 rounded-lg border bg-card space-y-1">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5 text-primary" /> Mobile Phone
                          </span>
                          <p className="font-semibold text-foreground font-mono">
                            {faceResult.participant.phone}
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
                            <Clock className="h-3.5 w-3.5 text-primary" /> Session Date
                          </span>
                          <p className="font-semibold text-foreground font-mono">
                            {faceResult.attendance?.dayDate || "Today"}
                          </p>
                        </div>
                      </div>

                      {/* Attendance Confirmation Pill */}
                      {faceResult.attendance && (
                        <div className="p-3.5 rounded-xl border bg-muted/30 flex items-center justify-between flex-wrap gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground font-semibold">Attendance Record: </span>
                            <span className="font-bold text-foreground">
                              {faceResult.attendance.status.toUpperCase()} at{" "}
                              {new Date(faceResult.attendance.checkedInAt).toLocaleTimeString()}
                            </span>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Method: {faceResult.attendance.method === "qr_selfie" ? "Face Recognition" : faceResult.attendance.method === "qr" ? "QR Code" : faceResult.attendance.method}
                            </p>
                          </div>
                          <Badge className="bg-emerald-600 text-white font-mono text-[10px]">
                            PRESENT
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                ) : faceResult.candidates?.length ? (
                  /* Uncertain Match Multiple Candidates Display */
                  <div className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                      The following participants had close similarity scores. For security, please verify participant manually or scan their QR code:
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {faceResult.candidates.map((cand) => (
                        <div key={cand.id} className="p-3 rounded-xl border bg-card flex items-center justify-between">
                          <div>
                            <p className="font-bold text-sm text-foreground">{cand.fullName}</p>
                            <p className="text-xs font-mono text-muted-foreground">{cand.participantCode}</p>
                          </div>
                          <Badge variant="outline" className="font-mono text-xs">
                            {cand.score}% Match
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Face Not Recognized Fallback */
                  <div className="py-6 text-center text-sm text-muted-foreground space-y-3">
                    <AlertTriangle className="h-10 w-10 text-warning mx-auto" />
                    <p className="font-medium text-foreground">Face could not be recognized with sufficient confidence.</p>
                    <p className="text-xs max-w-md mx-auto">
                      Ensure the participant is facing the camera directly with good lighting, or use the alternative QR code scan method.
                    </p>
                  </div>
                )}

                {/* Bottom Action Bar */}
                <div className="flex items-center justify-between pt-4 border-t flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleResetFace}
                      className="text-xs gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Next Participant
                    </Button>

                    {!faceResult.ok && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          handleModeChange("qr");
                          void startQrCamera();
                        }}
                        className="text-xs gap-1.5 font-bold"
                      >
                        <QrCode className="h-3.5 w-3.5" /> Switch to QR Verification
                      </Button>
                    )}
                  </div>

                  {faceResult.ok && (
                    <Button
                      size="sm"
                      onClick={handleResetFace}
                      className="gap-2 font-bold bg-primary text-primary-foreground shadow-md text-xs px-5"
                    >
                      <Camera className="h-4 w-4" /> Next Participant <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export { AdminQrScannerTab as VerificationConsoleTab };
