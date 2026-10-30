import React, { useState } from "react";
import { ClickableAvatar } from "@/components/ui/profile-photo-lightbox";
import { Check, Copy, RotateCw, CheckCircle2 } from "lucide-react";
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
  issueDate?: string | null;
  workshopName?: string;
  startDate?: string;
  endDate?: string;
  durationDays?: number;
  institutionName?: string;
}

interface Props {
  data: ParticipantIdCardData;
  onFlip?: () => void;
  showFlipPrompt?: boolean;
}

export function ParticipantIdCardFront({ data, onFlip, showFlipPrompt = true }: Props) {
  const [copied, setCopied] = useState(false);

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
    <div className="relative w-full max-w-[340px] sm:max-w-[360px] min-h-[520px] sm:min-h-[540px] rounded-2xl bg-white text-[#263445] border border-[#E2E8F0] shadow-xl p-7 flex flex-col justify-between overflow-hidden select-none font-sans">
      {/* Top Header: Clean Credential Title & Issue Date */}
      <div className="flex items-center justify-between border-b border-[#F4F6F8] pb-3 text-[10px] tracking-[0.18em] uppercase font-semibold text-[#64748B]">
        <span>Identity Credential</span>
        {data.issueDate && (
          <span className="font-mono text-[10px] tracking-normal text-[#64748B]">
            {data.issueDate}
          </span>
        )}
      </div>

      {/* Center Body: Photograph, Full Name, ID & Status */}
      <div className="flex flex-col items-center text-center my-auto py-4 space-y-4">
        {/* Professional Photograph Presentation */}
        <div className="relative group">
          <div className="p-1 rounded-2xl bg-[#F4F6F8] border border-[#E2E8F0] shadow-sm">
            <ClickableAvatar
              src={data.photoUrl ?? undefined}
              alt={data.fullName}
              fullName={data.fullName}
              participantCode={data.participantCode}
              verificationStatus={data.verificationStatus}
              fallback={data.fullName.slice(0, 2).toUpperCase()}
              className="h-32 w-32 sm:h-36 sm:w-36 rounded-xl border border-slate-200/80 object-cover shadow-xs shrink-0"
              fallbackClassName="text-3xl font-bold text-[#172B45] bg-[#F4F6F8]"
            />
          </div>

          {/* Discreet Verification Indicator */}
          {isVerified && (
            <div className="absolute -bottom-1 -right-1 bg-white p-0.5 rounded-full shadow-xs">
              <CheckCircle2 className="h-5 w-5 text-[#00A878] fill-white" />
            </div>
          )}
        </div>

        {/* Participant Name & Unique ID */}
        <div className="space-y-2 max-w-[280px]">
          <h3 className="text-2xl sm:text-[26px] font-bold text-[#172B45] tracking-tight leading-snug">
            {data.fullName}
          </h3>

          {/* Unique Participant ID with Click-to-Copy */}
          <div>
            <button
              type="button"
              onClick={handleCopyCode}
              className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[#263445] bg-[#F4F6F8] hover:bg-[#EAEFF4] border border-[#E2E8F0] px-3.5 py-1 rounded-full shadow-2xs transition-colors cursor-pointer active:scale-95"
              title="Click to copy ID"
            >
              <span>{data.participantCode}</span>
              {copied ? (
                <Check className="h-3 w-3 text-[#00A878]" />
              ) : (
                <Copy className="h-3 w-3 text-[#64748B]" />
              )}
            </button>
          </div>
        </div>

        {/* Verified Participant Status Pill */}
        <div className="pt-1">
          {isVerified ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#00A878]/10 text-[#00A878] border border-[#00A878]/30">
              <Check className="h-3.5 w-3.5" />
              <span>Verified Participant</span>
            </span>
          ) : isRejected ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-200">
              <span>Registration Rejected</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-[#64748B] border border-slate-200">
              <span>Pending Verification</span>
            </span>
          )}
        </div>
      </div>

      {/* Bottom Area: Issue Date & Card Flip */}
      <div className="pt-3 border-t border-[#F4F6F8] flex items-center justify-between text-xs text-[#64748B]">
        <span>
          {data.issueDate ? `Issued ${data.issueDate}` : "Universal Identity Credential"}
        </span>

        {showFlipPrompt && onFlip && (
          <button
            type="button"
            onClick={onFlip}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#172B45] hover:text-[#00A878] transition-colors cursor-pointer"
          >
            <span>Scan QR</span>
            <RotateCw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
