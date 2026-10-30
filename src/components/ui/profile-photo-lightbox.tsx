import { useState, useEffect, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { X, ZoomIn, Download, ExternalLink, User } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProfilePhotoLightboxProps {
  open: boolean;
  onClose: () => void;
  src?: string | null;
  alt?: string;
  fullName?: string;
  participantCode?: string;
  verificationStatus?: string;
}

/**
 * Full-screen lightbox modal for viewing high-resolution profile photographs
 */
export function ProfilePhotoLightbox({
  open,
  onClose,
  src,
  alt = "Profile Photograph",
  fullName,
  participantCode,
  verificationStatus,
}: ProfilePhotoLightboxProps) {
  // Prevent background scrolling while lightbox is active
  useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open]);

  // Handle Escape key to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open || !src) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Full size profile photograph preview"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Top Floating Action Bar */}
      <div
        className="w-full max-w-4xl flex items-center justify-between pb-3 text-white z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 truncate">
          <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0">
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-sm sm:text-base font-bold truncate text-white">
              {fullName || alt}
            </h3>
            {participantCode && (
              <span className="font-mono text-xs text-white/70">{participantCode}</span>
            )}
          </div>
          {verificationStatus && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] uppercase font-semibold border-white/20 ml-2 hidden sm:inline-flex",
                verificationStatus === "verified"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : "bg-amber-500/20 text-amber-300 border-amber-500/40"
              )}
            >
              {verificationStatus}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Open in new tab action */}
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shadow-sm"
            title="Open original high-res image in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </a>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-white"
            title="Close preview (Esc)"
            aria-label="Close photograph preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Centered High-Resolution Image Viewport */}
      <div
        className="relative flex items-center justify-center max-w-4xl max-h-[82vh] w-full select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={fullName || alt}
          className="max-h-[80vh] max-w-[92vw] w-auto h-auto object-contain rounded-2xl shadow-2xl border border-white/10"
        />
      </div>

      {/* Floating Bottom Hint */}
      <p className="mt-3 text-xs text-white/60 font-medium select-none text-center">
        Click anywhere outside or press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[11px]">Esc</kbd> to close
      </p>
    </div>
  );
}

export interface ClickableAvatarProps {
  src?: string | null | undefined;
  alt?: string | undefined;
  fallback?: string | undefined;
  className?: string | undefined;
  imageClassName?: string | undefined;
  fallbackClassName?: string | undefined;
  fullName?: string | undefined;
  participantCode?: string | undefined;
  verificationStatus?: string | undefined;
  disabled?: boolean | undefined;
}

/**
 * Clickable profile photograph avatar that communicates interactive zoom
 * on hover and opens the high-resolution lightbox preview on click.
 */
export function ClickableAvatar({
  src,
  alt = "Profile Photograph",
  fallback = "SA",
  className,
  imageClassName,
  fallbackClassName,
  fullName,
  participantCode,
  verificationStatus,
  disabled = false,
}: ClickableAvatarProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    if (disabled || !src) return;
    e.stopPropagation();
    setLightboxOpen(true);
  };

  const isClickable = !disabled && Boolean(src);

  return (
    <>
      <div
        className={cn(
          "relative group inline-block shrink-0 rounded-2xl select-none",
          isClickable && "cursor-pointer"
        )}
        onClick={handleClick}
        title={isClickable ? "Click to view full-size photograph" : undefined}
      >
        <Avatar
          className={cn(
            "rounded-2xl border-2 border-primary/20 shadow-xs overflow-hidden transition-all duration-200",
            isClickable && "group-hover:border-primary group-hover:shadow-md",
            className
          )}
        >
          <AvatarImage
            src={src ?? undefined}
            alt={alt}
            className={cn(
              "object-cover transition-transform duration-300",
              isClickable && "group-hover:scale-105",
              imageClassName
            )}
          />
          <AvatarFallback
            className={cn(
              "font-bold text-xs bg-primary/10 text-primary uppercase",
              fallbackClassName
            )}
          >
            {fallback}
          </AvatarFallback>
        </Avatar>

        {/* Hover Zoom Icon Overlay Indicator */}
        {isClickable && (
          <div className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center pointer-events-none">
            <div className="h-7 w-7 rounded-full bg-white/25 backdrop-blur-xs flex items-center justify-center text-white shadow-sm">
              <ZoomIn className="h-3.5 w-3.5" />
            </div>
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {isClickable && (
        <ProfilePhotoLightbox
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          src={src}
          alt={alt}
          fullName={fullName}
          participantCode={participantCode}
          verificationStatus={verificationStatus}
        />
      )}
    </>
  );
}

