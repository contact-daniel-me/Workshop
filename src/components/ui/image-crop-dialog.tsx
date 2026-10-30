import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Crop,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  RefreshCw,
  Check,
  X,
  Sparkles,
} from "lucide-react";
import { getCroppedImg, blobToFile } from "@/lib/crop-image";
import { toast } from "sonner";

interface Props {
  open: boolean;
  imageSrc: string | null;
  fileName?: string;
  onConfirm: (croppedFile: File) => void;
  onCancel: () => void;
}

export function ImageCropDialog({
  open,
  imageSrc,
  fileName = "profile_photo.jpg",
  onConfirm,
  onCancel,
}: Props) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropComplete = useCallback((_croppedArea: Area, pixelCrop: Area) => {
    setCroppedAreaPixels(pixelCrop);
  }, []);

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  };

  const handleRotateLeft = () => {
    setRotation((prev) => (prev - 90 + 360) % 360);
  };

  const handleRotateRight = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleConfirm = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setProcessing(true);

    try {
      const croppedBlob = await getCroppedImg(
        imageSrc,
        croppedAreaPixels,
        rotation,
        "image/jpeg",
        0.92
      );

      // Preserve clean filename with .jpg extension
      const safeName = fileName.replace(/\.[^/.]+$/, "") + ".jpg";
      const file = blobToFile(croppedBlob, safeName);

      onConfirm(file);
      handleReset();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to crop photograph.";
      toast.error(msg);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          handleReset();
          onCancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-xl max-w-[95vw] p-0 overflow-hidden gap-0">
        <DialogHeader className="p-4 sm:p-5 border-b bg-muted/30">
          <DialogTitle className="flex items-center gap-2 font-display text-lg">
            <Crop className="h-5 w-5 text-primary" /> Crop Profile Photograph
          </DialogTitle>
          <DialogDescription className="text-xs">
            Drag to position your face within the square crop. Use zoom and rotation controls to adjust.
          </DialogDescription>
        </DialogHeader>

        {/* Cropper Viewport Area */}
        <div className="relative w-full h-72 sm:h-80 bg-slate-950 overflow-hidden select-none">
          {imageSrc ? (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={1}
              showGrid={true}
              cropShape="rect"
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
              classes={{
                containerClassName: "relative w-full h-full",
                cropAreaClassName: "border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] rounded-2xl",
              }}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 text-xs">
              No image source available.
            </div>
          )}
        </div>

        {/* Controls Toolbar */}
        <div className="p-4 sm:p-5 space-y-4 bg-card border-t">
          {/* Zoom Control */}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setZoom((z) => Math.max(1, z - 0.2))}
              disabled={zoom <= 1}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              title="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.05}
              onValueChange={([z]) => setZoom(z)}
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
              disabled={zoom >= 3}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              title="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <span className="font-mono text-xs text-muted-foreground w-12 text-right">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          {/* Rotation & Reset Actions */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRotateLeft}
                className="h-8 text-xs gap-1.5"
                title="Rotate 90 degrees counter-clockwise"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Rotate -90°
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRotateRight}
                className="h-8 text-xs gap-1.5"
                title="Rotate 90 degrees clockwise"
              >
                <RotateCw className="h-3.5 w-3.5" /> Rotate +90°
              </Button>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5"
            >
              <RefreshCw className="h-3 w-3" /> Reset Crop
            </Button>
          </div>
        </div>

        {/* Dialog Footer Actions */}
        <DialogFooter className="p-4 sm:p-5 border-t bg-muted/20 gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              handleReset();
              onCancel();
            }}
            disabled={processing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={processing || !imageSrc}
            className="gap-2 font-bold bg-primary text-primary-foreground shadow-xs"
          >
            {processing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" /> Processing…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" /> Confirm Crop
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

