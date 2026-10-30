import React from "react";
import { type ParticipantIdCardData } from "./ParticipantIdCardFront";
import {
  QrCode,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  RotateCw,
} from "lucide-react";

export interface ParticipantAttendanceStats {
  present: number;
  absent: number;
  eligible: number;
  total: number;
  remaining: number;
  currentPct: number;
  finalPct: number;
}

interface Props {
  data: ParticipantIdCardData;
  stats?: ParticipantAttendanceStats | null;
  qrDataUrl?: string | null;
  qrShortCode?: string | null;
  qrStatus?: "ACTIVE_QR" | "ALREADY_PRESENT" | "LOCKED_UNTIL_SESSION_TIME" | "NO_SESSION_SCHEDULED" | "NOT_APPROVED" | "ERROR" | string;
  qrTimeLeftFormatted?: string;
  unlockTimeFormatted?: string;
  loadingQr?: boolean;
  onRefreshQr?: () => void;
  onFlip?: () => void;
}

export function ParticipantIdCardBack({
  data,
  stats,
  qrDataUrl,
  qrShortCode,
  qrStatus = "ACTIVE_QR",
  qrTimeLeftFormatted,
  unlockTimeFormatted,
  loadingQr = false,
  onRefreshQr,
  onFlip,
}: Props) {
  const isApproved = data.verificationStatus === "verified";
  const isAlreadyPresent = qrStatus === "ALREADY_PRESENT";
  const isLockedUntilMidnight = qrStatus === "LOCKED_UNTIL_SESSION_TIME";
  const isNoSession = qrStatus === "NO_SESSION_SCHEDULED";

  return (
    <div className="relative w-full max-w-[340px] sm:max-w-[360px] min-h-[520px] sm:min-h-[540px] rounded-2xl bg-white text-[#263445] border border-[#E2E8F0] shadow-xl p-7 flex flex-col justify-between overflow-hidden select-none font-sans">
      {/* Top Header: Participant ID & Scanning Instruction */}
      <div className="text-center space-y-1 border-b border-[#F4F6F8] pb-3">
        <p className="font-mono text-xs font-semibold text-[#172B45] tracking-wider">
          {data.participantCode}
        </p>
        <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-[#64748B]">
          SCAN TO VERIFY IDENTITY
        </p>
      </div>

      {/* Center: Large Scannable Dynamic QR Code & Status */}
      <div className="flex flex-col items-center justify-center my-auto py-3 space-y-3">
        {/* Crisp QR Frame with Generous Quiet Zone */}
        <div className="w-52 h-52 sm:w-56 sm:h-56 p-3 bg-white rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col items-center justify-center">
          {loadingQr ? (
            <div className="flex flex-col items-center justify-center gap-2 text-[#64748B]">
              <RefreshCw className="h-6 w-6 animate-spin text-[#172B45]" />
              <span className="text-xs font-mono">Generating QR…</span>
            </div>
          ) : isAlreadyPresent ? (
            <div className="flex flex-col items-center justify-center text-center p-3 space-y-2">
              <div className="h-12 w-12 rounded-full bg-[#00A878]/10 text-[#00A878] flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <p className="font-bold text-sm text-[#172B45]">Attendance Recorded</p>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#00A878]/10 text-[#00A878]">
                Verified Present Today
              </span>
            </div>
          ) : isLockedUntilMidnight ? (
            <div className="flex flex-col items-center justify-center text-center p-3 space-y-1.5">
              <Clock className="h-8 w-8 text-[#64748B]" />
              <p className="font-bold text-xs text-[#172B45]">Next Session at 12:00 AM</p>
              {unlockTimeFormatted && (
                <div className="font-mono font-medium text-xs text-[#172B45] bg-[#F4F6F8] px-2.5 py-1 rounded-md border border-[#E2E8F0]">
                  {unlockTimeFormatted}
                </div>
              )}
            </div>
          ) : !isApproved ? (
            <div className="flex flex-col items-center justify-center text-center p-3 space-y-1.5">
              <AlertCircle className="h-8 w-8 text-amber-500" />
              <p className="font-bold text-xs text-[#172B45]">Pending Approval</p>
              <p className="text-[11px] text-[#64748B] leading-tight">
                QR activates once account is approved.
              </p>
            </div>
          ) : isNoSession ? (
            <div className="flex flex-col items-center justify-center text-center p-3 space-y-1">
              <AlertCircle className="h-8 w-8 text-[#64748B]" />
              <p className="font-bold text-xs text-[#172B45]">No Session Today</p>
              <p className="text-[11px] text-[#64748B]">Scheduled days only.</p>
            </div>
          ) : qrDataUrl ? (
            <div className="flex flex-col items-center justify-center">
              <img
                src={qrDataUrl}
                alt={`Identity QR Code for ${data.participantCode}`}
                className="h-44 w-44 sm:h-48 sm:w-48 object-contain"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-3 space-y-1.5">
              <QrCode className="h-8 w-8 text-[#64748B]" />
              <p className="text-xs text-[#64748B]">QR code unavailable</p>
              {onRefreshQr && (
                <button
                  type="button"
                  onClick={onRefreshQr}
                  className="text-xs text-[#172B45] font-semibold hover:underline"
                >
                  Generate QR
                </button>
              )}
            </div>
          )}
        </div>

        {/* QR Expiration / Validity Information & Backup Token */}
        <div className="flex flex-col items-center space-y-1">
          {qrDataUrl && qrTimeLeftFormatted && !isAlreadyPresent && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F4F6F8] border border-[#E2E8F0] text-[11px] font-mono text-[#64748B]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00A878] animate-pulse" />
              <span>Expires in {qrTimeLeftFormatted}</span>
            </div>
          )}

          {qrShortCode && !isAlreadyPresent && isApproved && (
            <div className="text-[11px] font-mono text-[#64748B]">
              Code: <span className="font-bold text-[#172B45]">{qrShortCode}</span>
            </div>
          )}
        </div>

        {/* Optional Attendance Verification Summary (Universal, No Event Names) */}
        {stats && (
          <div className="w-full bg-[#F4F6F8] rounded-xl p-2.5 border border-[#E2E8F0] text-center">
            <div className="flex items-center justify-between text-xs text-[#64748B] mb-1">
              <span className="font-medium">Verified Attendance</span>
              <span className="font-mono font-bold text-[#172B45]">
                {Math.round(stats.currentPct)}%
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-center text-xs font-mono border-t border-slate-200/60 pt-1.5">
              <div>
                <span className="text-[9px] text-[#64748B] block font-sans">Present</span>
                <span className="font-semibold text-[#00A878]">{stats.present}d</span>
              </div>
              <div>
                <span className="text-[9px] text-[#64748B] block font-sans">Absent</span>
                <span className="font-semibold text-rose-600">{stats.absent}d</span>
              </div>
              <div>
                <span className="text-[9px] text-[#64748B] block font-sans">Eligible</span>
                <span className="font-semibold text-[#263445]">{stats.eligible}d</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Footer: Flip Back Action */}
      <div className="pt-3 border-t border-[#F4F6F8] flex items-center justify-between text-xs text-[#64748B]">
        <span className="text-[10px] font-mono">ID: {data.participantCode}</span>

        {onFlip && (
          <button
            type="button"
            onClick={onFlip}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#172B45] hover:text-[#00A878] transition-colors cursor-pointer"
          >
            <span>Show Front</span>
            <RotateCw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
