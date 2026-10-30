import React from "react";
import { Badge } from "@/components/ui/badge";
import { type ParticipantIdCardData } from "./ParticipantIdCardFront";
import {
  QrCode,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Mail,
  Phone,
  RotateCw,
  TrendingUp,
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
  const isLockedUntilNoon = qrStatus === "LOCKED_UNTIL_SESSION_TIME";
  const isNoSession = qrStatus === "NO_SESSION_SCHEDULED";

  const attendanceRate = stats ? Math.round(stats.currentPct) : 0;

  return (
    <div className="relative w-full max-w-[360px] sm:max-w-[380px] min-h-[560px] sm:min-h-[580px] rounded-3xl bg-gradient-to-br from-slate-950 via-[#062622] to-[#032924] text-white border-2 border-emerald-500/40 shadow-2xl p-5 sm:p-6 flex flex-col justify-between overflow-hidden select-none">
      {/* Background Micro-patterns */}
      <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

      {/* Top Security Access Ribbon / Magnetic Strip */}
      <div className="relative z-10 space-y-2">
        <div className="h-7 w-full rounded-lg bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700/60 flex items-center justify-between px-3 shadow-inner">
          <span className="font-mono text-[9px] tracking-widest text-emerald-400 font-bold">
            ACCESS // {data.participantCode}
          </span>
          <span className="font-mono text-[9px] text-slate-400">ENCRYPTED ID</span>
        </div>
      </div>

      {/* Center Dynamic QR Code Access Box */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto py-2 space-y-2.5">
        <div className="w-full max-w-[240px] bg-white rounded-2xl p-3.5 shadow-2xl flex flex-col items-center justify-center text-slate-900 space-y-2 border-2 border-emerald-400/30">
          {loadingQr ? (
            <div className="h-44 w-44 rounded-xl bg-slate-100 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
              <span className="text-[11px] font-medium text-slate-500 font-mono">Loading QR…</span>
            </div>
          ) : isAlreadyPresent ? (
            <div className="h-44 w-44 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col items-center justify-center p-3 text-center space-y-2">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              <p className="font-bold text-xs text-emerald-900 font-display">Attendance Marked</p>
              <Badge className="bg-emerald-600 text-white font-mono text-[9px] uppercase px-2 py-0.5">
                Present Today
              </Badge>
              <p className="text-[10px] text-slate-500">Verified for today's session</p>
            </div>
          ) : isLockedUntilNoon ? (
            <div className="h-44 w-44 rounded-xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center p-3 text-center space-y-1.5">
              <Clock className="h-8 w-8 text-primary" />
              <p className="font-bold text-xs text-slate-800 font-display">Opens at 12:00 PM</p>
              {unlockTimeFormatted && (
                <div className="font-mono font-bold text-xs text-primary bg-primary/10 px-2 py-1 rounded-md">
                  {unlockTimeFormatted}
                </div>
              )}
              <p className="text-[9px] text-slate-500 leading-tight">Session unlocks at 12:00 PM</p>
            </div>
          ) : !isApproved ? (
            <div className="h-44 w-44 rounded-xl bg-amber-50 border border-amber-200 flex flex-col items-center justify-center p-3 text-center space-y-2">
              <Clock className="h-8 w-8 text-amber-600" />
              <p className="font-bold text-xs text-amber-900 font-display">Approval Required</p>
              <p className="text-[10px] text-amber-700">QR code locked until registration approved.</p>
            </div>
          ) : isNoSession ? (
            <div className="h-44 w-44 rounded-xl bg-slate-100 flex flex-col items-center justify-center p-3 text-center space-y-1">
              <AlertCircle className="h-8 w-8 text-slate-400" />
              <p className="font-bold text-xs text-slate-700">No Session Today</p>
              <p className="text-[10px] text-slate-500">Check event calendar.</p>
            </div>
          ) : qrDataUrl ? (
            <div className="flex flex-col items-center space-y-1.5">
              <img
                src={qrDataUrl}
                alt="Participant Daily Attendance QR"
                className="h-40 w-40 object-contain rounded-lg"
              />
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-800 font-semibold">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>{qrTimeLeftFormatted ? `Valid: ${qrTimeLeftFormatted}` : "Daily Dynamic QR"}</span>
              </div>
            </div>
          ) : (
            <div className="h-44 w-44 rounded-xl bg-slate-50 flex flex-col items-center justify-center p-3 text-center space-y-2">
              <QrCode className="h-8 w-8 text-slate-400" />
              <p className="text-xs text-slate-600 font-medium">QR unavailable</p>
              {onRefreshQr && (
                <button
                  type="button"
                  onClick={onRefreshQr}
                  className="text-[10px] text-emerald-600 font-bold hover:underline"
                >
                  Click to generate
                </button>
              )}
            </div>
          )}

          {/* Backup Short Code */}
          {qrShortCode && !isAlreadyPresent && isApproved && (
            <div className="w-full text-center border-t border-slate-200 pt-1.5 flex items-center justify-between px-2">
              <span className="text-[9px] font-mono text-slate-500">Backup Code:</span>
              <span className="font-mono font-extrabold text-xs tracking-wider text-emerald-800">
                {qrShortCode}
              </span>
            </div>
          )}
        </div>

        {/* Live Attendance Rate Ring & Breakdown (Requirement 3) */}
        {stats && (
          <div className="w-full bg-emerald-950/60 border border-emerald-500/30 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-bold text-white">Attendance Rate</span>
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-mono text-xs font-extrabold">
                {attendanceRate}%
              </Badge>
            </div>

            {/* Visual Attendance Progress Bar */}
            <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden border border-emerald-500/20">
              <div
                className="bg-gradient-to-r from-teal-400 to-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, attendanceRate))}%` }}
              />
            </div>

            {/* 3-Column Stats Grid */}
            <div className="grid grid-cols-3 gap-1.5 pt-1 text-center font-mono">
              <div className="bg-card/40 border border-emerald-500/20 rounded-lg p-1.5">
                <span className="text-[9px] text-slate-400 block uppercase font-sans">Present</span>
                <span className="text-xs font-bold text-emerald-300">{stats.present}d</span>
              </div>
              <div className="bg-card/40 border border-emerald-500/20 rounded-lg p-1.5">
                <span className="text-[9px] text-slate-400 block uppercase font-sans">Absent</span>
                <span className="text-xs font-bold text-rose-300">{stats.absent}d</span>
              </div>
              <div className="bg-card/40 border border-emerald-500/20 rounded-lg p-1.5">
                <span className="text-[9px] text-slate-400 block uppercase font-sans">Eligible</span>
                <span className="text-xs font-bold text-slate-200">{stats.eligible}d</span>
              </div>
            </div>
          </div>
        )}

        {/* Contact Info */}
        <div className="w-full space-y-1 text-left px-1 text-[11px] text-slate-300">
          <div className="flex items-center gap-1.5 truncate">
            <Mail className="h-3 w-3 text-emerald-400 shrink-0" />
            <span className="truncate">{data.email}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Phone className="h-3 w-3 text-emerald-400 shrink-0" />
            <span className="font-mono text-[10px]">{data.phone}</span>
          </div>
        </div>
      </div>

      {/* Card Back Footer */}
      <div className="relative z-10 pt-2 border-t border-emerald-500/20 flex items-center justify-between text-[10px] text-slate-400 font-mono">
        <span className="truncate max-w-[200px]">GrowIOTA SmartAttend</span>

        {onFlip && (
          <button
            type="button"
            onClick={onFlip}
            className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer text-[10px] font-semibold shrink-0"
          >
            <span>Flip for Front</span>
            <RotateCw className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
