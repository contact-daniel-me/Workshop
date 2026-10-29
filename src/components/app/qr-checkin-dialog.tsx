import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Camera, CheckCircle2, AlertTriangle, RefreshCw, KeyRound, UserCheck, Shield } from "lucide-react";
import { checkIn } from "@/lib/checkin.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requireSelfie?: boolean;
  userId?: string;
}

export function QrCheckinDialog({ open, onOpenChange, requireSelfie, userId }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"camera" | "code">("camera");
  const [shortCode, setShortCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Selfie capture state (when requireSelfie is true)
  const [selfieBlob, setSelfieBlob] = useState<Blob | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const handleSuccessfulCode = useCallback(
    async (code: string) => {
      if (busy) return;
      setBusy(true);

      try {
        let selfiePath: string | null = null;
        if (requireSelfie) {
          if (!selfieBlob || !userId) {
            toast.error("Please capture your live verification selfie first.");
            setBusy(false);
            return;
          }
          const path = `${userId}/selfie-${Date.now()}.jpg`;
          const uploadRes = await supabase.storage.from("selfies").upload(path, selfieBlob, {
            contentType: "image/jpeg",
          });
          if (uploadRes.error) {
            throw new Error(`Selfie upload failed: ${uploadRes.error.message}`);
          }
          selfiePath = path;
        }

        const res = await checkIn({ data: { code, selfiePath } });
        if (res.ok) {
          toast.success(res.message);
          await qc.invalidateQueries({ queryKey: ["my_attendance"] });
          await qc.invalidateQueries({ queryKey: ["admin_data"] });
          onOpenChange(false);
        } else {
          toast.error(res.message);
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Check-in failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, requireSelfie, selfieBlob, userId, qc, onOpenChange],
  );

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is not supported by your browser. Please use code entry.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: requireSelfie ? "user" : { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);

      // Check for BarcodeDetector API
      const BarcodeDetectorGlobal = (window as unknown as { BarcodeDetector?: new (options?: { formats: string[] }) => { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;

      if (!requireSelfie && BarcodeDetectorGlobal) {
        const detector = new BarcodeDetectorGlobal({ formats: ["qr_code"] });
        scanIntervalRef.current = window.setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length > 0 && codes[0]?.rawValue) {
              stopCamera();
              await handleSuccessfulCode(codes[0].rawValue);
            }
          } catch {
            // Frame detection skipped
          }
        }, 500);
      }
    } catch (err: unknown) {
      setCameraError(err instanceof Error ? err.message : "Could not start camera stream.");
      setCameraActive(false);
    }
  }, [requireSelfie, stopCamera, handleSuccessfulCode]);

  useEffect(() => {
    if (open && tab === "camera") {
      void startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [open, tab, startCamera, stopCamera]);

  const captureSelfieSnapshot = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setSelfieBlob(blob);
        setSelfiePreview(URL.createObjectURL(blob));
        toast.success("Selfie captured! Now scan QR or enter 6-character short code.");
      },
      "image/jpeg",
      0.85,
    );
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = shortCode.trim();
    if (!code) {
      toast.error("Please enter the short code.");
      return;
    }
    await handleSuccessfulCode(code);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) stopCamera();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <Camera className="h-5 w-5 text-primary" /> Daily Attendance Check-In
          </DialogTitle>
          <DialogDescription>
            Scan today's workshop QR code or enter the 6-character code shown on the presenter's screen.
          </DialogDescription>
        </DialogHeader>

        {requireSelfie && (
          <Alert className="border-warning/50 bg-warning/10 text-warning-foreground">
            <Shield className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>Identity Verification Enabled:</strong> You must capture a live photo before submitting attendance.
            </AlertDescription>
          </Alert>
        )}

        {/* Live Selfie Preview if captured */}
        {requireSelfie && selfiePreview && (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-2 text-xs">
            <img src={selfiePreview} alt="Selfie" className="h-14 w-14 rounded-md object-cover border" />
            <div className="flex-1">
              <p className="font-semibold text-success flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Verification Photo Ready
              </p>
              <p className="text-muted-foreground text-[11px]">Ready to submit with your attendance.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => {
                setSelfieBlob(null);
                setSelfiePreview(null);
              }}
            >
              Retake
            </Button>
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as "camera" | "code")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="camera" className="gap-1.5 text-xs">
              <Camera className="h-3.5 w-3.5" /> Camera Scanner
            </TabsTrigger>
            <TabsTrigger value="code" className="gap-1.5 text-xs">
              <KeyRound className="h-3.5 w-3.5" /> 6-Digit Code
            </TabsTrigger>
          </TabsList>

          <TabsContent value="camera" className="mt-4 space-y-3">
            <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-slate-950 flex items-center justify-center">
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />

              {!cameraActive && !cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-xs">Connecting to camera…</span>
                </div>
              )}

              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-destructive">
                  <AlertTriangle className="h-7 w-7 mb-1" />
                  <span className="text-xs">{cameraError}</span>
                  <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={() => void startCamera()}>
                    Retry Camera
                  </Button>
                </div>
              )}

              {cameraActive && !requireSelfie && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-40 w-40 rounded-lg border-2 border-dashed border-primary/80 animate-pulse" />
                </div>
              )}
            </div>

            {requireSelfie && cameraActive && (
              <Button
                type="button"
                className="w-full gap-2 font-semibold"
                onClick={captureSelfieSnapshot}
                disabled={busy}
              >
                <UserCheck className="h-4 w-4" /> Capture Verification Selfie
              </Button>
            )}

            <p className="text-center text-[11px] text-muted-foreground">
              Tip: Position the QR code inside the box, or switch to the 6-Digit Code tab if lighting is dim.
            </p>
          </TabsContent>

          <TabsContent value="code" className="mt-4 space-y-4">
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">6-Character Daily Code</label>
                <Input
                  value={shortCode}
                  onChange={(e) => setShortCode(e.target.value.toUpperCase())}
                  placeholder="e.g. 7X9K2P"
                  maxLength={10}
                  className="font-mono text-center text-lg tracking-widest uppercase font-bold"
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground">
                  The organizer displays this code alongside the QR code each morning.
                </p>
              </div>

              <Button type="submit" disabled={busy || !shortCode.trim()} className="w-full font-semibold">
                {busy ? "Validating attendance…" : "Submit Attendance"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

