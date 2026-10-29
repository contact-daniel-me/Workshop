import { useState } from "react";
import { adminDeleteParticipant } from "@/lib/admin.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trash2, AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participant: {
    id: string;
    full_name: string;
    participant_code: string;
    email?: string;
    phone?: string;
    photoUrl?: string | null;
  } | null;
  onSuccess?: () => void;
}

export function DeleteParticipantDialog({
  open,
  onOpenChange,
  participant,
  onSuccess,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [confirmedUnderstood, setConfirmedUnderstood] = useState(false);

  const handleDelete = async () => {
    if (!participant) return;
    setBusy(true);

    try {
      const res = await adminDeleteParticipant({
        data: { targetUserId: participant.id },
      });

      toast.success(res.message || "Participant account deleted successfully.");
      onOpenChange(false);
      setConfirmedUnderstood(false);
      onSuccess?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete participant account.");
    } finally {
      setBusy(false);
    }
  };

  if (!participant) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <div className="h-9 w-9 rounded-xl bg-destructive/10 flex items-center justify-center">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="font-display text-lg text-destructive">
                Delete this participant?
              </DialogTitle>
              <DialogDescription className="text-xs">
                Permanent account deletion and data retention confirmation.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Target Participant Verification Card */}
          <div className="flex items-center gap-3 p-3.5 rounded-xl border border-destructive/20 bg-destructive/5">
            <Avatar className="h-12 w-12 border-2 border-destructive/20 shrink-0">
              <AvatarImage src={participant.photoUrl ?? undefined} alt={participant.full_name} className="object-cover" />
              <AvatarFallback className="font-bold text-xs bg-destructive/10 text-destructive">
                {participant.full_name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h4 className="font-display font-bold text-sm text-foreground truncate">{participant.full_name}</h4>
              <p className="text-xs font-mono font-semibold text-destructive">{participant.participant_code}</p>
              {participant.phone && <p className="text-[11px] text-muted-foreground font-mono">{participant.phone}</p>}
            </div>
            <Badge variant="destructive" className="text-[10px] uppercase font-mono">
              TARGET
            </Badge>
          </div>

          {/* Retention & Warning Note */}
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3.5 space-y-2 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <p className="leading-relaxed">
                This action may permanently remove the participant's account and associated data. Confirm that you are authorized to proceed and understand the attendance-record retention policy.
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground pl-6">
              • Historical attendance records will be archived in security audit logs for compliance.
              <br />
              • Profile photograph and authentication credentials will be removed.
            </p>
          </div>

          {/* Explicit Confirmation Checkbox */}
          <label className="flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors">
            <input
              type="checkbox"
              checked={confirmedUnderstood}
              onChange={(e) => setConfirmedUnderstood(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-destructive focus:ring-destructive h-4 w-4"
            />
            <span className="text-xs text-muted-foreground">
              I confirm that I am authorized to delete this participant account and understand this action cannot be undone.
            </span>
          </label>
        </div>

        <DialogFooter className="pt-2 gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={busy || !confirmedUnderstood}
            className="font-bold gap-2"
          >
            {busy ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" /> Deleting…
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" /> Permanently Delete Participant
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
