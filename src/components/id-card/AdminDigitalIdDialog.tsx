import React, { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DigitalParticipantIdCard } from "./DigitalParticipantIdCard";
import { type ParticipantIdCardData } from "./ParticipantIdCardFront";
import { type ParticipantAttendanceStats } from "./ParticipantIdCardBack";
import { addDays, type Settings } from "@/lib/attendance";
import { IdCard, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface AdminParticipantLike {
  id: string;
  full_name: string;
  participant_code: string;
  email: string;
  phone: string;
  verification_status: string;
  photo_path?: string | null;
  summary?: {
    present: number;
    absent: number;
    eligible: number;
    total: number;
    remaining: number;
    currentPct: number;
    finalPct: number;
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participant: AdminParticipantLike | null;
  settings?: Settings | null;
  photoUrl?: string | null;
}

export function AdminDigitalIdDialog({
  open,
  onOpenChange,
  participant,
  settings,
  photoUrl,
}: Props) {
  const cardData = useMemo<ParticipantIdCardData | null>(() => {
    if (!participant) return null;

    const startDate = settings?.start_date || "2026-11-01";
    const durationDays = settings?.duration_days || 30;
    const endDate = addDays(startDate, durationDays - 1);

    return {
      id: participant.id,
      fullName: participant.full_name,
      participantCode: participant.participant_code,
      email: participant.email,
      phone: participant.phone,
      photoUrl: photoUrl || null,
      photoPath: participant.photo_path || null,
      verificationStatus: participant.verification_status,
      workshopName: settings?.name || "Workshop Attendance",
      startDate,
      endDate,
      durationDays,
      institutionName: "GrowIOTA Innovations",
    };
  }, [participant, settings, photoUrl]);

  const stats = useMemo<ParticipantAttendanceStats | null>(() => {
    if (!participant?.summary) return null;
    return {
      present: participant.summary.present,
      absent: participant.summary.absent,
      eligible: participant.summary.eligible,
      total: participant.summary.total,
      remaining: participant.summary.remaining,
      currentPct: participant.summary.currentPct,
      finalPct: participant.summary.finalPct,
    };
  }, [participant]);

  if (!participant || !cardData) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="border-b pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <IdCard className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="font-display text-lg sm:text-xl font-bold flex items-center gap-2">
                  Digital Participant ID Card
                  <Badge variant="outline" className="font-mono text-[10px] text-primary border-primary/40">
                    ADMIN PREVIEW
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Official attendee credential for {participant.full_name} ({participant.participant_code})
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                className={
                  participant.verification_status === "verified"
                    ? "bg-success text-success-foreground text-xs"
                    : participant.verification_status === "rejected"
                    ? "bg-destructive text-destructive-foreground text-xs"
                    : "bg-warning text-warning-foreground text-xs"
                }
              >
                {participant.verification_status.toUpperCase()}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="pt-2">
          <DigitalParticipantIdCard
            data={cardData}
            stats={stats}
            allowAdminActions={true}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

