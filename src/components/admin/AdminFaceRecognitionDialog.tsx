import { useState, useRef, useEffect, useCallback } from "react";
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
  ScanFace,
  Camera,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ArrowRight,
  Mail,
  Phone,
  Calendar,
  Users,
  Target,
} from "lucide-react";
import {
  adminVerifyFaceAttendance,
  type AdminFaceVerificationResult,
} from "@/lib/attendance-qr.server";

interface ApprovedParticipant {
  id: string;
  full_name: string;
  participant_code: string;
  email: string;
  phone: string;
  photo_path: string | null;
}

interface AdminFaceRecognitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAttendanceConfirmed?: () => void;
  workshopName?: string;
  approvedParticipants?: ApprovedParticipant[];
}

export function AdminFaceRecognitionDialog({
  open,
  onOpenChange,
  onAttendanceConfirmed,
  workshopName = "Event Management Portal",
  approvedParticipants = [],
}: AdminFaceRecognitionDialogProps) {
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("user");
  const [isVerifying, setIsVerifying] = useState(false);
  const [faceResult, setFaceResult] = useState<AdminFaceVerificationResult | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Stop camera stream cleanly
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraLoading(false);
  }, []);

  // Start face camera directly
  const startCamera = useCallback(
    async (mode = facingMode) => {
      stopCamera();
      setCameraError(null);
      setCameraLoading(true);
      setFaceResult(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access is not supported by your browser.");
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
            ? "Camera permission was denied for face verification. Please grant camera permission."
            : "Could not access camera for face verification.";
        setCameraError(message);
        setCameraLoading(false);
      }
    },
    [facingMode, stopCamera],
  );

  // Toggle front/rear camera
  const toggleFacingMode = () => {
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
    void startCamera(nextMode);
  };

  // Capture face from video and verify biometrics with backend
  const handleCaptureAndVerify = async () => {
    if (!videoRef.current || isVerifying) return;
    const video = videoRef.current;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }

    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Pre-flight image illumination check
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

    setIsVerifying(true);
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
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate([100, 50, 100]);
          } catch {
            // Ignore vibration failure
          }
        }
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
      setIsVerifying(false);
    }
  };

  // Reset result and restart camera for next attendee
  const handleResetFace = () => {
    setFaceResult(null);
    void startCamera();
  };

  // Manage camera lifecycle when dialog opens or closes
  useEffect(() => {
    if (open) {
      setFaceResult(null);
      void startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [open, facingMode, startCamera, stopCamera]);

  // Filter approved participants for 1-to-1 dropdown
  const filteredParticipants = approvedParticipants.filter((p) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(q) ||
      p.participant_code.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q)
    );
  });

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
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 shrink-0">
              <ScanFace className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold font-display text-foreground">
                Face Recognition Verification
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Align attendee's face within the oval guide to verify biometric identity and record attendance.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="pt-1 space-y-4">
          {/* ========================================================================= */}
          {/* STATE 1: VERIFYING BIOMETRICS SPINNER */}
          {/* ========================================================================= */}
          {isVerifying ? (
            <div className="p-10 text-center space-y-3 bg-muted/20 rounded-2xl border">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-purple-600" />
              <h3 className="font-display text-lg font-bold">Analyzing Facial Features…</h3>
              <p className="text-xs text-muted-foreground">
                Comparing live capture against enrolled biometric reference portraits and anti-spoofing checks.
              </p>
            </div>
          ) : faceResult ? (
            /* ========================================================================= */
            /* STATE 2: FACE VERIFICATION RESULT DOSSIER */
            /* ========================================================================= */
            <Card
              className={`border-2 shadow-md ${
                faceResult.ok && faceResult.resultCode === "VERIFIED_PRESENT"
                  ? "border-emerald-500 bg-card"
                  : faceResult.resultCode === "ALREADY_MARKED"
                  ? "border-amber-300 bg-amber-50/40 dark:bg-amber-950/20"
                  : "border-destructive/60 bg-destructive/5"
              }`}
            >
              {/* Status Header Banner */}
              <div
                className={`px-4 sm:px-6 py-3 border-b flex items-center justify-between flex-wrap gap-2 ${
                  faceResult.ok && faceResult.resultCode === "VERIFIED_PRESENT"
                    ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-200"
                    : faceResult.resultCode === "ALREADY_MARKED"
                    ? "bg-amber-100/70 text-amber-800 border-amber-200"
                    : "bg-destructive/10 text-destructive border-destructive/20"
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-sm">
                  {faceResult.ok && faceResult.resultCode === "VERIFIED_PRESENT" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  ) : faceResult.resultCode === "ALREADY_MARKED" ? (
                    <Clock className="h-5 w-5 text-amber-600 shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive shrink-0" />
                  )}
                  <span className="leading-snug">{faceResult.message}</span>
                </div>

                {faceResult.confidence !== undefined && (
                  <Badge
                    className={`font-mono text-xs shrink-0 ${
                      faceResult.ok && faceResult.resultCode === "VERIFIED_PRESENT"
                        ? "bg-emerald-600 text-white"
                        : faceResult.resultCode === "ALREADY_MARKED"
                        ? "bg-amber-600 text-white"
                        : "bg-destructive text-white"
                    }`}
                  >
                    Match: {faceResult.confidence}%
                  </Badge>
                )}
              </div>

              <CardContent className="p-4 sm:p-6 space-y-4">
                {faceResult.participant ? (
                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-muted/20 p-4 rounded-xl border">
                    <ClickableAvatar
                      src={faceResult.participant.photoUrl ?? undefined}
                      alt={faceResult.participant.fullName}
                      fullName={faceResult.participant.fullName}
                      participantCode={faceResult.participant.participantCode}
                      fallback={faceResult.participant.fullName.slice(0, 2).toUpperCase()}
                      className="h-24 w-24 rounded-xl border-2 border-purple-500/30 shadow-sm shrink-0"
                      fallbackClassName="text-xl"
                    />
                    <div className="space-y-1 text-center sm:text-left flex-1 min-w-0">
                      <h3 className="font-display text-lg font-bold text-foreground truncate">
                        {faceResult.participant.fullName}
                      </h3>
                      <p className="font-mono text-xs font-semibold text-purple-700 dark:text-purple-300">
                        ID: {faceResult.participant.participantCode}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {faceResult.participant.email} • {faceResult.participant.phone}
                      </p>
                      <div className="flex items-center gap-2 pt-1 justify-center sm:justify-start">
                        <Badge className="bg-purple-600 text-white text-[10px] font-mono">
                          FACE VERIFIED
                        </Badge>
                        {faceResult.attendance && (
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {new Date(faceResult.attendance.checkedInAt).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : faceResult.candidates?.length ? (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Multiple potential matches found. Please select a specific attendee or retry:
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {faceResult.candidates.map((cand) => (
                        <div key={cand.id} className="p-2.5 rounded-lg border bg-card flex items-center justify-between text-xs">
                          <div>
                            <p className="font-bold text-foreground">{cand.fullName}</p>
                            <p className="font-mono text-muted-foreground">{cand.participantCode}</p>
                          </div>
                          <Badge variant="outline" className="font-mono">
                            {cand.score}% Match
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center space-y-2">
                    <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
                    <p className="text-sm font-semibold text-foreground">
                      Face could not be recognized with sufficient confidence.
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      Ensure the attendee faces the camera squarely with adequate lighting.
                    </p>
                  </div>
                )}

                <div className="pt-2">
                  <Button
                    onClick={handleResetFace}
                    className="w-full gap-2 font-bold bg-purple-700 hover:bg-purple-800 text-white shadow-sm justify-center cursor-pointer"
                  >
                    <ScanFace className="h-4 w-4" /> Verify Next Attendee <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            /* ========================================================================= */
            /* STATE 3: DIRECT LIVE CAMERA FACE SCANNER */
            /* ========================================================================= */
            <div className="space-y-3">
              {/* Live Video Feed with Oval Reticle */}
              <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-purple-500/40 shadow-lg flex items-center justify-center min-h-[340px] sm:min-h-[420px]">
                {cameraLoading && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/85 text-white">
                    <RefreshCw className="h-8 w-8 animate-spin text-purple-400" />
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
                      className="gap-1.5 font-bold bg-purple-700 text-white"
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
                      className="w-full h-full max-h-[440px] object-cover"
                    />

                    {/* Face Oval Reticle Overlay */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                      <div className="relative w-52 h-68 sm:w-60 sm:h-76 rounded-[50%] border-2 border-purple-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] flex items-center justify-center max-w-[80vw]">
                        <div className="w-8 h-0.5 bg-purple-400/70 absolute left-2" />
                        <div className="w-8 h-0.5 bg-purple-400/70 absolute right-2" />
                        <div className="h-6 w-0.5 bg-purple-400/70 absolute top-2" />
                        <div className="h-6 w-0.5 bg-purple-400/70 absolute bottom-2" />
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

                    {/* Top Prompt Pill */}
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 w-[90%] sm:w-auto text-center pointer-events-none">
                      <Badge className="bg-black/75 text-white backdrop-blur-sm border-white/20 text-xs px-3 py-1 font-medium">
                        Align participant's face within the oval guide
                      </Badge>
                    </div>

                    {/* Centered Bottom Capture & Verify Trigger */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
                      <Button
                        size="lg"
                        onClick={handleCaptureAndVerify}
                        disabled={isVerifying}
                        className="gap-2.5 font-bold bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white shadow-2xl px-7 py-5 rounded-full text-sm sm:text-base transition-all duration-200 active:scale-95 border border-white/25 cursor-pointer"
                      >
                        <ScanFace className="h-5 w-5" />
                        <span>Capture & Verify Face</span>
                      </Button>
                    </div>
                  </>
                )}
              </div>

              {/* Matching Scope & Targeted Selection */}
              <div className="p-3 rounded-xl bg-muted/40 border text-xs space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5 text-purple-600" />
                    Matching Mode:
                  </span>
                  <div className="grid grid-cols-2 gap-1 p-0.5 bg-muted rounded-lg border">
                    <button
                      type="button"
                      onClick={() => setSelectedParticipantId("")}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        !selectedParticipantId
                          ? "bg-purple-700 text-white shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Auto Match (1-to-N)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (approvedParticipants.length && !selectedParticipantId) {
                          setSelectedParticipantId(approvedParticipants[0]?.id || "");
                        }
                      }}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        selectedParticipantId
                          ? "bg-purple-700 text-white shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Specific Attendee (1-to-1)
                    </button>
                  </div>
                </div>

                {selectedParticipantId !== "" && (
                  <div className="grid gap-2 sm:grid-cols-2 pt-1 border-t">
                    <Input
                      placeholder="Search attendee by name or code…"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="text-xs font-mono h-8"
                    />
                    <select
                      value={selectedParticipantId}
                      onChange={(e) => setSelectedParticipantId(e.target.value)}
                      className="text-xs font-medium rounded-md border bg-background px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-purple-600 w-full h-8"
                    >
                      {filteredParticipants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name} ({p.participant_code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

