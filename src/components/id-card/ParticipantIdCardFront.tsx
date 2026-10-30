import React from "react";
import { Badge } from "@/components/ui/badge";
import { ClickableAvatar } from "@/components/ui/profile-photo-lightbox";
import { ShieldCheck, CalendarDays, RotateCw, Copy, Check } from "lucide-react";
import { toast } from "sonner";

export interface ParticipantIdCardData {
  id: string;
  fullName: string;
  participantCode: string;
  email: string;
  phone: string;
  photoUrl?: string | null;
  photoPath?: string | null;
  verificationStatus: "verified" | "pending" | "rejected" | string;
  workshopName: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  institutionName?: string;
}

interface Props {
  data: ParticipantIdCardData;
  onFlip?: () => void;
  showFlipPrompt?: boolean;
}

export function ParticipantIdCardFront({ data, onFlip, showFlipPrompt = true }: Props) {
  const [copied, setCopied] = React.useState(false);

  const handleCopyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(data.participantCode);
    setCopied(true);
    toast.success(`Copied ID: ${data.participantCode}`);
    setTimeout(() => setCopied(false), 2000);
  };

  const isVerified = data.verificationStatus === "verified";
  const isRejected = data.verificationStatus === "rejected";

  return (
    <div className="relative w-full max-w-[360px] sm:max-w-[380px] min-h-[560px] sm:min-h-[580px] rounded-3xl bg-gradient-to-br from-slate-950 via-[#072421] to-[#04332c] text-white border-2 border-emerald-500/40 shadow-2xl p-6 flex flex-col justify-between overflow-hidden select-none">
      {/* Background Micro-patterns & Glow */}
      <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
      <div className="absolute -top-20 -left-20 w-52 h-52 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-52 h-52 bg-teal-400/15 rounded-full blur-3xl pointer-events-none" />

      {/* Top Lanyard Clip Cutout & Header Bar */}
      <div className="relative z-10 space-y-4">
        {/* Lanyard Hole Mock */}
        <div className="w-14 h-2.5 rounded-full bg-slate-900 border border-slate-700/60 mx-auto shadow-inner" />

        {/* Brand Bar */}
        <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shadow-xs">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <span className="font-display font-extrabold text-sm tracking-tight text-white block leading-none">
                SmartAttend
              </span>
              <span className="text-[9px] uppercase tracking-wider text-emerald-400 font-mono font-semibold">
                Digital Pass
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 text-[9px] font-mono tracking-wider uppercase px-2 py-0.5">
              GrowIOTA
            </Badge>
          </div>
        </div>
      </div>

      {/* Center Body: Portrait, Name & Unique Code */}
      <div className="relative z-10 flex flex-col items-center text-center my-auto py-2 space-y-3.5">
        {/* Metallic Smartchip Accent */}
        <div className="w-full flex justify-end pr-2 -mb-6">
          <div className="w-10 h-8 rounded-md bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 border border-amber-300/80 p-1 shadow-sm opacity-90">
            <div className="w-full h-full border border-amber-700/40 rounded flex flex-col justify-between py-0.5">
              <div className="h-0.5 bg-amber-800/40 w-full" />
              <div className="h-0.5 bg-amber-800/40 w-full" />
            </div>
          </div>
        </div>

        {/* Large Framed Profile Photograph */}
        <div className="relative group">
          <div className="p-1 rounded-2xl bg-gradient-to-b from-emerald-400/60 via-teal-500/30 to-emerald-600/60 shadow-lg">
            <ClickableAvatar
              src={data.photoUrl ?? undefined}
              alt={data.fullName}
              fullName={data.fullName}
              participantCode={data.participantCode}
              verificationStatus={data.verificationStatus}
              fallback={data.fullName.slice(0, 2).toUpperCase()}
              className="h-28 w-28 sm:h-32 sm:w-32 rounded-2xl border-2 border-slate-900 shadow-md shrink-0"
              fallbackClassName="text-2xl font-display font-bold text-slate-800"
            />
          </div>

          {/* Status Badge Pip */}
          <div className="absolute -bottom-1.5 -right-1.5">
            <span
              className={`flex h-4 w-4 relative items-center justify-center rounded-full border-2 border-slate-950 ${
                isVerified
                  ? "bg-emerald-500 text-white"
                  : isRejected
                  ? "bg-rose-500 text-white"
                  : "bg-amber-500 text-white"
              }`}
            >
              {isVerified && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
            </span>
          </div>
        </div>

        {/* Participant Name & Identity */}
        <div className="space-y-1 max-w-[280px]">
          <h3 className="font-display text-xl sm:text-2xl font-black text-white tracking-tight leading-snug">
            {data.fullName}
          </h3>

          {/* Participant Unique ID Pill with Click-to-copy */}
          <button
            type="button"
            onClick={handleCopyCode}
            className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-emerald-300 bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-500/40 px-3 py-1 rounded-full shadow-xs transition-all cursor-pointer active:scale-95"
            title="Click to copy Participant ID"
          >
            <span>ID: {data.participantCode}</span>
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-emerald-400/80" />}
          </button>
        </div>

        {/* Status Pill */}
        <div>
          <Badge
            className={`font-mono text-[10px] uppercase tracking-wider px-3 py-0.5 ${
              isVerified
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                : isRejected
                ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                : "bg-amber-500/20 text-amber-300 border-amber-500/40"
            }`}
          >
            {isVerified ? "Verified Attendee" : isRejected ? "Registration Rejected" : "Registration Pending"}
          </Badge>
        </div>
      </div>

      {/* Event Identity & Card Footer */}
      <div className="relative z-10 space-y-3 pt-3 border-t border-emerald-500/20">
        <div className="flex items-center justify-between text-left">
          <div className="space-y-0.5 max-w-[220px]">
            <p className="text-xs font-bold text-slate-100 truncate">{data.workshopName}</p>
            <p className="text-[10px] text-slate-400 font-medium">{data.institutionName || "GrowIOTA Innovations"}</p>
          </div>

          <div className="text-right space-y-0.5">
            <span className="text-[9px] uppercase font-mono tracking-wider text-slate-400 block">Session Span</span>
            <div className="flex items-center gap-1 text-[10px] text-emerald-300 font-mono">
              <CalendarDays className="h-3 w-3 text-emerald-400" />
              <span>{data.durationDays} Days</span>
            </div>
          </div>
        </div>

        {/* Micro Barcode & Flip Prompt */}
        <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400 font-mono">
          <div className="flex items-center gap-1">
            <div className="h-3.5 w-12 bg-gradient-to-r from-white via-slate-300 to-white opacity-40 rounded-xs flex items-center justify-around px-0.5">
              <div className="h-full w-0.5 bg-black" />
              <div className="h-full w-1 bg-black" />
              <div className="h-full w-0.5 bg-black" />
              <div className="h-full w-1 bg-black" />
            </div>
            <span className="text-[9px] tracking-widest text-slate-500">{data.startDate}</span>
          </div>

          {showFlipPrompt && onFlip && (
            <button
              type="button"
              onClick={onFlip}
              className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer text-[10px] font-semibold"
            >
              <span>Flip for QR</span>
              <RotateCw className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
