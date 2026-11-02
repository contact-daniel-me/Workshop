import { useState } from "react";
import {
  RotateCcw,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Trash2,
  ShieldAlert,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { resetWorkshopTimeline } from "@/lib/admin.functions";
import { todayLocal, type Settings } from "@/lib/attendance";

interface ResetWorkshopTimelineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  totalAttendanceRecordsCount: number;
  onTimelineReset: () => Promise<void> | void;
}

export function ResetWorkshopTimelineDialog({
  open,
  onOpenChange,
  settings,
  totalAttendanceRecordsCount,
  onTimelineReset,
}: ResetWorkshopTimelineDialogProps) {
  const today = todayLocal();
  const [newStartDate, setNewStartDate] = useState(today);
  const [resetMode, setResetMode] = useState<"timeline_only" | "timeline_and_attendance">("timeline_only");
  const [preserveHolidays, setPreserveHolidays] = useState(true);
  const [confirmationWord, setConfirmationWord] = useState("");
  const [resetReason, setResetReason] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const isDestructive = resetMode === "timeline_and_attendance";
  const canSubmit = !isDestructive || confirmationWord.trim().toUpperCase() === "RESET";

  const handleExecuteReset = async () => {
    if (!newStartDate) {
      toast.error("Please specify a valid start date for Day 1.");
      return;
    }

    if (isDestructive && confirmationWord.trim().toUpperCase() !== "RESET") {
      toast.error('Please type "RESET" into the confirmation box to confirm clearing attendance.');
      return;
    }

    setIsResetting(true);
    try {
      const res = await resetWorkshopTimeline({
        data: {
          newStartDate,
          clearAttendance: isDestructive,
          preserveHolidays,
          reason: resetReason.trim() || undefined,
        },
      });

      toast.success(res.message);
      await onTimelineReset();
      onOpenChange(false);
      setConfirmationWord("");
      setResetReason("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reset workshop timeline.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-rose-600">
            <RotateCcw className="h-5 w-5" />
            <DialogTitle className="font-display text-lg text-foreground">Reset Workshop Timeline</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Restart the workshop day progression from Day 1 on a chosen calendar date. Choose whether to preserve or clear attendance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1 text-xs">
          {/* New Start Date Input */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" /> New Day 1 Start Date
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={newStartDate}
                onChange={(e) => setNewStartDate(e.target.value)}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs cursor-pointer shrink-0"
                onClick={() => setNewStartDate(today)}
              >
                Today ({today})
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Current workshop start date: <strong className="font-mono">{settings.start_date}</strong>
            </p>
          </div>

          {/* Reset Mode Selection */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Select Reset Scope</Label>
            <RadioGroup
              value={resetMode}
              onValueChange={(v) => {
                setResetMode(v as any);
                setConfirmationWord("");
              }}
              className="space-y-2.5"
            >
              {/* Option A: Timeline Only */}
              <div
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  resetMode === "timeline_only"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:bg-muted/30"
                }`}
                onClick={() => setResetMode("timeline_only")}
              >
                <div className="flex items-start gap-2.5">
                  <RadioGroupItem value="timeline_only" id="opt-timeline-only" className="mt-0.5" />
                  <div>
                    <Label htmlFor="opt-timeline-only" className="font-semibold text-xs cursor-pointer block text-foreground">
                      Option A: Reset Timeline Only (Recommended)
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      Restarts Day numbering from Day 1 on <strong className="font-mono">{newStartDate}</strong>.
                      All existing attendance records ({totalAttendanceRecordsCount} entries) are <strong>preserved intact</strong>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Option B: Timeline and Attendance */}
              <div
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  resetMode === "timeline_and_attendance"
                    ? "border-rose-400 bg-rose-50/50 ring-1 ring-rose-400"
                    : "border-border hover:bg-muted/30"
                }`}
                onClick={() => setResetMode("timeline_and_attendance")}
              >
                <div className="flex items-start gap-2.5">
                  <RadioGroupItem value="timeline_and_attendance" id="opt-both" className="mt-0.5 text-rose-600" />
                  <div>
                    <Label htmlFor="opt-both" className="font-semibold text-xs cursor-pointer block text-rose-700">
                      Option B: Reset Timeline and Clear Attendance
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      Restarts Day 1 on <strong className="font-mono">{newStartDate}</strong> AND completely wipes all existing attendance records ({totalAttendanceRecordsCount} entries).
                      Participant registrations and audit logs are safely kept.
                    </p>
                  </div>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Preserve Holidays Checkbox */}
          <div className="flex items-start gap-2.5 p-2.5 rounded-lg border bg-muted/20">
            <Checkbox
              id="preserve-holidays-check"
              checked={preserveHolidays}
              onCheckedChange={(c) => setPreserveHolidays(!!c)}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="preserve-holidays-check" className="font-semibold text-xs cursor-pointer block">
                Preserve Holiday Configurations
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Leave checked to retain configured weekends and custom holidays. Uncheck if you want to clear holiday rules.
              </p>
            </div>
          </div>

          {/* Reset Reason */}
          <div className="space-y-1.5">
            <Label className="text-xs">Reason for Timeline Reset (Optional)</Label>
            <Input
              placeholder="e.g. Workshop postponed, New batch started, Schedule realignment..."
              value={resetReason}
              onChange={(e) => setResetReason(e.target.value)}
              className="text-xs"
            />
          </div>

          {/* Explicit Confirmation Input for Option B */}
          {isDestructive && (
            <div className="p-3 rounded-lg border border-rose-300 bg-rose-50 text-rose-900 space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
                <span>Confirm Irreversible Attendance Reset</span>
              </div>
              <p className="text-[11px]">
                This will permanently delete <strong>{totalAttendanceRecordsCount}</strong> recorded attendance entries across all workshop days.
                Type <strong>RESET</strong> in all caps to unlock confirmation:
              </p>
              <Input
                placeholder="Type RESET to confirm"
                value={confirmationWord}
                onChange={(e) => setConfirmationWord(e.target.value)}
                className="bg-white border-rose-300 text-xs font-mono tracking-widest uppercase placeholder:font-sans placeholder:normal-case"
              />
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isResetting}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={isDestructive ? "destructive" : "default"}
            size="sm"
            onClick={handleExecuteReset}
            disabled={isResetting || !canSubmit}
            className="text-xs"
          >
            {isResetting
              ? "Resetting Timeline..."
              : isDestructive
              ? "Reset Timeline & Wipe Attendance"
              : "Reset Timeline to Day 1"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

