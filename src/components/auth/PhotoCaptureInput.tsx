import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Camera,
  Upload,
  RefreshCw,
  Trash2,
  Check,
  AlertCircle,
  X,
  Sparkles,
  Crop,
  ZoomIn,
} from "lucide-react";
import { validateClientImageFile, optimizeImageFile } from "@/lib/image-validation";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { ProfilePhotoLightbox } from "@/components/ui/profile-photo-lightbox";
import { toast } from "sonner";

export interface PhotoCaptureInputProps {
  value: File | null;
  onChange: (file: File | null) => void;
  error?: string;
  disabled?: boolean;
}

export function PhotoCaptureInput({
  value,
  onChange,
  error,
  disabled = false,
}: PhotoCaptureInputProps) {
  const [mode, setMode] = useState<"idle" | "camera">("idle");
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Crop Editor State
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropFileName, setCropFileName] = useState("profile_photo.jpg");
  const [cropSourceMode, setCropSourceMode] = useState<"camera" | "upload" | "recrop">("upload");

  // Lightbox preview of selected photo
  const [previewLightboxOpen, setPreviewLightboxOpen] = useState(false);

  // Selected file preview URL
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream>(null);

  // Update preview URL when value changes
  useEffect(() => {
    if (value) {
      const url = URL.createObjectURL(value);
      setFilePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setFilePreviewUrl(null);
    }
  }, [value]);

  // Clean up crop object URL
  useEffect(() => {
    return () => {
      if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    };
  }, [cropImageSrc]);

  // Stop camera tracks cleanly
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraLoading(false);
  }, []);

  // Ensure camera is stopped on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Start front-facing camera
  const startCamera = async () => {
    setCameraError(null);
    setCameraLoading(true);
    setMode("camera");

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Camera access is not supported by this browser. Please use 'Upload Photo' instead."
      );
      setCameraLoading(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setCameraLoading(false);
      }, 100);
    } catch (err: unknown) {
      stopCamera();
      const message =
        err instanceof Error && err.name === "NotAllowedError"
          ? "Camera permission was denied. Please allow camera permissions in your browser or use 'Upload Photo'."
          : err instanceof Error && err.name === "NotFoundError"
          ? "No camera device found on this system. Please use 'Upload Photo' instead."
          : "Could not access camera. Please use 'Upload Photo' to select an image.";
      setCameraError(message);
      setCameraLoading(false);
    }
  };

  // Capture current video frame and immediately open crop editor
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 640;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirror image for natural selfie feel
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          stopCamera();
          const preview = URL.createObjectURL(blob);
          setCropImageSrc(preview);
          setCropFileName(`selfie_${Date.now()}.jpg`);
          setCropSourceMode("camera");
          setCropModalOpen(true);
        }
      },
      "image/jpeg",
      0.95
    );
  };

  // Cancel camera & return to idle
  const handleCancelCamera = () => {
    stopCamera();
    setCameraError(null);
    setMode("idle");
  };

  // Handle file picker selection and immediately open crop editor
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.size > 20 * 1024 * 1024) {
        throw new Error("Selected image exceeds 20 MB. Please select a smaller photo.");
      }
      const preview = URL.createObjectURL(file);
      setCropImageSrc(preview);
      setCropFileName(file.name);
      setCropSourceMode("upload");
      setCropModalOpen(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Invalid photograph.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Confirm crop from the ImageCropDialog
  const handleCropConfirmed = async (croppedFile: File) => {
    try {
      await validateClientImageFile(croppedFile);
      onChange(croppedFile);
      setCropModalOpen(false);
      setMode("idle");
      toast.success("Photograph cropped and ready!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Invalid photograph.");
    } finally {
      if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
      setCropImageSrc(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Cancel crop
  const handleCropCancelled = () => {
    setCropModalOpen(false);
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropImageSrc(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (cropSourceMode === "camera") {
      void startCamera();
    } else {
      setMode("idle");
    }
  };

  // Allow re-cropping current photo
  const handleRecrop = () => {
    if (!value) return;
    const preview = URL.createObjectURL(value);
    setCropImageSrc(preview);
    setCropFileName(value.name || "profile_photo.jpg");
    setCropSourceMode("recrop");
    setCropModalOpen(true);
  };

  const handleRemovePhoto = () => {
    onChange(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileInputChange}
        disabled={disabled}
        className="hidden"
      />

      {/* 1. Camera Active View */}
      {mode === "camera" && (
        <div className="rounded-xl border bg-card p-3 space-y-3 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5 text-primary">
              <Camera className="h-4 w-4" /> Live Camera Selfie
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancelCamera}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {cameraError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 space-y-2.5 text-xs text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="leading-relaxed">{cameraError}</p>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 text-xs gap-1.5"
                >
                  <Upload className="h-3.5 w-3.5" /> Upload Photo Instead
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={startCamera}
                  className="h-8 text-xs gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Try Again
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative mx-auto w-full max-w-xs aspect-square rounded-2xl overflow-hidden bg-black flex items-center justify-center border-2 border-primary/30 shadow-md">
                {cameraLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white bg-black/70 z-10">
                    <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-xs font-medium">Starting camera…</span>
                  </div>
                )}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
                {/* Oval/Square Guide Overlay */}
                <div className="absolute inset-4 rounded-2xl border-2 border-white/50 pointer-events-none" />
              </div>

              <div className="flex justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCancelCamera}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={capturePhoto}
                  disabled={cameraLoading}
                  className="gap-1.5 font-bold bg-primary text-primary-foreground shadow-xs"
                >
                  <Camera className="h-4 w-4" /> Capture & Crop
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. Selected Photograph Ready State */}
      {mode === "idle" && value && filePreviewUrl && (
        <div
          className={`rounded-2xl border bg-card p-3.5 flex items-center gap-3.5 shadow-xs transition-all ${
            error ? "border-destructive bg-destructive/5" : "border-border"
          }`}
        >
          {/* Clickable Image Preview with Hover Zoom */}
          <div
            className="relative group cursor-pointer shrink-0 rounded-2xl overflow-hidden border-2 border-primary/20 shadow-xs"
            onClick={() => setPreviewLightboxOpen(true)}
            title="Click to view full-size photo"
          >
            <Avatar className="h-20 w-20 rounded-2xl">
              <AvatarImage
                src={filePreviewUrl}
                alt="Photograph Preview"
                className="object-cover group-hover:scale-105 transition-transform duration-200"
              />
              <AvatarFallback className="font-bold text-xs bg-primary/10 text-primary">
                PIC
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <ZoomIn className="h-5 w-5 text-white" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-foreground truncate">
                {value.name || "profile_photo.jpg"}
              </p>
              <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0 h-4">
                Cropped & Ready
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
              {(value.size / 1024).toFixed(1)} KB • Click photo to expand
            </p>

            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRecrop}
                disabled={disabled}
                className="h-7 text-xs gap-1 font-semibold"
                title="Adjust photo crop"
              >
                <Crop className="h-3 w-3 text-primary" /> Recrop
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="h-7 text-xs gap-1 font-semibold"
              >
                <Upload className="h-3 w-3" /> Change
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={startCamera}
                disabled={disabled}
                className="h-7 text-xs gap-1 font-semibold text-primary"
              >
                <Camera className="h-3 w-3" /> Retake
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemovePhoto}
                disabled={disabled}
                className="h-7 text-xs text-destructive hover:text-destructive p-1"
                title="Remove photo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Default Two-Option Upload Component (Take Photo | Upload Photo) */}
      {mode === "idle" && !value && (
        <div
          className={`rounded-2xl border p-4 text-center transition-all bg-muted/20 ${
            error
              ? "border-destructive bg-destructive/5"
              : "border-dashed border-border hover:border-primary/50"
          }`}
        >
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
            {/* Take Photo Button */}
            <Button
              type="button"
              variant="outline"
              onClick={startCamera}
              disabled={disabled}
              className="w-full sm:w-auto h-10 gap-2 font-semibold border-primary/30 text-primary hover:bg-primary/10 shadow-xs"
            >
              <Camera className="h-4 w-4 text-primary" />
              <span>Take Photo</span>
            </Button>

            <span className="text-xs text-muted-foreground font-medium hidden sm:inline">
              or
            </span>

            {/* Upload Photo Button */}
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="w-full sm:w-auto h-10 gap-2 font-semibold border-border hover:bg-accent shadow-xs"
            >
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span>Upload Photo</span>
            </Button>
          </div>

          <p className="mt-2.5 text-[11px] text-muted-foreground leading-relaxed">
            Upload a recent, front-facing photograph or capture a selfie. You can crop, zoom, and rotate before saving. JPG, PNG, or WEBP; maximum 20 MB.
          </p>
        </div>
      )}

      {/* Validation Error Message */}
      {error && (
        <p className="text-xs text-destructive font-medium flex items-center gap-1 mt-1">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}

      {/* Image Crop Dialog Modal */}
      <ImageCropDialog
        open={cropModalOpen}
        imageSrc={cropImageSrc}
        fileName={cropFileName}
        onConfirm={handleCropConfirmed}
        onCancel={handleCropCancelled}
      />

      {/* Selected Photo Lightbox Preview */}
      {filePreviewUrl && (
        <ProfilePhotoLightbox
          open={previewLightboxOpen}
          onClose={() => setPreviewLightboxOpen(false)}
          src={filePreviewUrl}
          alt={value?.name || "Selected Photograph"}
          fullName="Selected Profile Photograph"
        />
      )}
    </div>
  );
}
