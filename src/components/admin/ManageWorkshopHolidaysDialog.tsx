import { useState, useMemo } from "react";
import {
  CalendarDays,
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Sun,
  X,
  Plus,
  Trash2,
  Layers,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  setWorkshopDayStatus,
  applyBulkWeekendHolidays,
  restoreWorkshopDayActive,
} from "@/lib/admin.functions";
import {
  type WorkshopCalendarDay,
  type WorkshopDayRecord,
  type Settings,
  addDays,
  todayLocal,
} from "@/lib/attendance";

interface ManageWorkshopHolidaysDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: string;
  schedule: WorkshopCalendarDay[];
  configuredDays: WorkshopDayRecord[];
  settings: Settings;
  attendanceRecords?: { day_date: string }[];
  onConfigUpdated: () => Promise<void> | void;
}

export function ManageWorkshopHolidaysDialog({
  open,
  onOpenChange,
  selectedDate: initialDate,
  schedule,
  configuredDays,
  settings,
  attendanceRecords = [],
  onConfigUpdated,
}: ManageWorkshopHolidaysDialogProps) {
  const today = todayLocal();
  const [activeTab, setActiveTab] = useState<"single" | "bulk" | "list">("single");

  // Single Date State
  const [targetDate, setTargetDate] = useState(initialDate);
  const [isHolidayChoice, setIsHolidayChoice] = useState<"active" | "holiday">("holiday");
  const [holidayReason, setHolidayReason] = useState("");
  const [confirmAttendanceWarning, setConfirmAttendanceWarning] = useState(false);
  const [savingSingle, setSavingSingle] = useState(false);

  // Bulk Weekend State
  const [weekendRule, setWeekendRule] = useState<"saturday" | "sunday" | "both">("both");
  const [applyScope, setApplyScope] = useState<"remaining" | "full" | "date_range">("remaining");
  const [bulkStartDate, setBulkStartDate] = useState(today);
  const [bulkEndDate, setBulkEndDate] = useState(
    addDays(settings.start_date, settings.duration_days * 2),
  );
  const [bulkReason, setBulkReason] = useState("");
  const [confirmBulkWarning, setConfirmBulkWarning] = useState(false);
  const [savingBulk, setSavingBulk] = useState(false);

  // Restore State
  const [restoringDate, setRestoringDate] = useState<string | null>(null);

  // Info for target single date
  const targetDayInfo = useMemo(() => {
    return schedule.find((d) => d.date === targetDate);
  }, [schedule, targetDate]);

  // Attendance count on target single date
  const targetDateAttendanceCount = useMemo(() => {
    return attendanceRecords.filter((a) => a.day_date === targetDate).length;
  }, [attendanceRecords, targetDate]);

  // Pre-flight calculation for affected bulk weekend dates
  const affectedBulkDates = useMemo(() => {
    let start = settings.start_date;
    if (applyScope === "remaining") start = today;
    else if (applyScope === "date_range") start = bulkStartDate;

    const end = applyScope === "date_range" ? bulkEndDate : addDays(settings.start_date, settings.duration_days * 2);

    const result: { date: string; dayName: string; hasAttendance: boolean }[] = [];
    let cur = start;
    let limit = 0;
    const attSet = new Set(attendanceRecords.map((a) => a.day_date));

    while (cur <= end && limit < 180) {
      limit++;
      const dt = new Date(cur + "T00:00:00Z");
      const dow = dt.getUTCDay();
      const isSat = dow === 6;
      const isSun = dow === 0;

      if (
        (weekendRule === "saturday" && isSat) ||
        (weekendRule === "sunday" && isSun) ||
        (weekendRule === "both" && (isSat || isSun))
      ) {
        result.push({
          date: cur,
          dayName: isSat ? "Saturday" : "Sunday",
          hasAttendance: attSet.has(cur),
        });
      }
      cur = addDays(cur, 1);
    }
    return result;
  }, [applyScope, settings, today, bulkStartDate, bulkEndDate, weekendRule, attendanceRecords]);

  const bulkDatesWithAttendance = useMemo(() => {
    return affectedBulkDates.filter((d) => d.hasAttendance);
  }, [affectedBulkDates]);

  // List of all currently configured holidays
  const configuredHolidaysList = useMemo(() => {
    return schedule.filter((d) => !d.isActive);
  }, [schedule]);

  // Handle Save Single Date
  const handleSaveSingle = async () => {
    if (!targetDate) return;
    const makeHoliday = isHolidayChoice === "holiday";

    if (makeHoliday && targetDateAttendanceCount > 0 && !confirmAttendanceWarning) {
      toast.error(
        `This date has ${targetDateAttendanceCount} recorded attendance entry/entries. Please confirm below to proceed.`,
      );
      return;
    }

    setSavingSingle(true);
    try {
      const res = await setWorkshopDayStatus({
        data: {
          dayDate: targetDate,
          isActive: !makeHoliday,
          reason: makeHoliday ? holidayReason.trim() || undefined : undefined,
          forceIfAttendanceExists: confirmAttendanceWarning,
        },
      });

      if (!res.ok && res.hasExistingAttendance) {
        toast.error(res.message);
        return;
      }

      toast.success(res.message);
      await onConfigUpdated();
      setHolidayReason("");
      setConfirmAttendanceWarning(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update workshop day.");
    } finally {
      setSavingSingle(false);
    }
  };

  // Handle Apply Bulk Weekend
  const handleApplyBulk = async () => {
    if (bulkDatesWithAttendance.length > 0 && !confirmBulkWarning) {
      toast.error(
        `${bulkDatesWithAttendance.length} weekend date(s) have existing attendance. Please confirm to proceed.`,
      );
      return;
    }

    setSavingBulk(true);
    try {
      const res = await applyBulkWeekendHolidays({
        data: {
          weekendRule,
          applyScope,
          startDate: applyScope === "date_range" ? bulkStartDate : undefined,
          endDate: applyScope === "date_range" ? bulkEndDate : undefined,
          reason: bulkReason.trim() || undefined,
          forceIfAttendanceExists: confirmBulkWarning,
        },
      });

      if (!res.ok && res.hasExistingAttendance) {
        toast.error(res.message);
        return;
      }

      toast.success(res.message);
      await onConfigUpdated();
      setConfirmBulkWarning(false);
      setActiveTab("list");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to apply bulk holidays.");
    } finally {
      setSavingBulk(false);
    }
  };

  // Handle Restore Active Date
  const handleRestore = async (date: string) => {
    setRestoringDate(date);
    try {
      const res = await restoreWorkshopDayActive({
        data: { dayDate: date },
      });
      toast.success(res.message);
      await onConfigUpdated();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to restore active date.");
    } finally {
      setRestoringDate(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <DialogTitle className="font-display text-lg">Manage Workshop Days & Holidays</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Configure non-working days, apply weekend holiday rules, or restore active workshop days. Holidays do NOT increment workshop day numbers.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="mt-2">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="single" className="text-xs">
              Single Date
            </TabsTrigger>
            <TabsTrigger value="bulk" className="text-xs">
              Bulk Weekend Rules
            </TabsTrigger>
            <TabsTrigger value="list" className="text-xs flex items-center gap-1.5">
              Configured Holidays
              {configuredHolidaysList.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                  {configuredHolidaysList.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: SINGLE DATE */}
          <TabsContent value="single" className="space-y-4 pt-3">
            <div className="grid gap-2">
              <Label className="text-xs font-semibold">Select Date to Configure</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={targetDate}
                  onChange={(e) => {
                    setTargetDate(e.target.value);
                    const info = schedule.find((d) => d.date === e.target.value);
                    setIsHolidayChoice(info?.isActive === false ? "holiday" : "active");
                    setHolidayReason(info?.holidayReason || "");
                    setConfirmAttendanceWarning(false);
                  }}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setTargetDate(today)}
                >
                  Today
                </Button>
              </div>
            </div>

            {targetDayInfo && (
              <div className="p-3 rounded-lg border bg-muted/20 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold">{targetDate} ({targetDayInfo.dayName})</span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Current Status:{" "}
                    {targetDayInfo.isActive ? (
                      <span className="text-emerald-600 font-semibold">Active Session (Day {targetDayInfo.dayNumber})</span>
                    ) : (
                      <span className="text-amber-600 font-semibold">Holiday ({targetDayInfo.holidayReason || "Non-Working"})</span>
                    )}
                  </p>
                </div>
                {targetDayInfo.isActive ? (
                  <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-300">Active Day</Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-300">Holiday</Badge>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Set Working Status</Label>
              <RadioGroup
                value={isHolidayChoice}
                onValueChange={(v) => setIsHolidayChoice(v as any)}
                className="grid grid-cols-2 gap-3"
              >
                <div
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    isHolidayChoice === "active" ? "border-primary bg-primary/5" : "border-border"
                  }`}
                  onClick={() => setIsHolidayChoice("active")}
                >
                  <RadioGroupItem value="active" id="status-active" />
                  <Label htmlFor="status-active" className="cursor-pointer">
                    <span className="font-semibold text-xs block text-foreground">🟢 Active Workshop Day</span>
                    <span className="text-[11px] text-muted-foreground">Increments Day numbering & expects attendance</span>
                  </Label>
                </div>

                <div
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    isHolidayChoice === "holiday" ? "border-amber-500 bg-amber-500/5" : "border-border"
                  }`}
                  onClick={() => setIsHolidayChoice("holiday")}
                >
                  <RadioGroupItem value="holiday" id="status-holiday" />
                  <Label htmlFor="status-holiday" className="cursor-pointer">
                    <span className="font-semibold text-xs block text-amber-700">🔴 Holiday / Non-Working</span>
                    <span className="text-[11px] text-muted-foreground">Does not increment Day count. Blocks check-in.</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {isHolidayChoice === "holiday" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Holiday Reason (Optional)</Label>
                <Input
                  placeholder="e.g. Public Holiday, Diwali, Venue Maintenance, Sunday..."
                  value={holidayReason}
                  onChange={(e) => setHolidayReason(e.target.value)}
                  className="text-xs"
                />
              </div>
            )}

            {/* Attendance Conflict Alert */}
            {isHolidayChoice === "holiday" && targetDateAttendanceCount > 0 && (
              <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 space-y-2 text-xs">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Existing Attendance Warning</span>
                </div>
                <p className="text-[11px]">
                  There are currently <strong>{targetDateAttendanceCount}</strong> attendance record(s) on <strong>{targetDate}</strong>.
                  Declaring this date a holiday will preserve historical records but hide normal check-in controls.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="confirm-single-warning"
                    checked={confirmAttendanceWarning}
                    onCheckedChange={(c) => setConfirmAttendanceWarning(!!c)}
                  />
                  <Label htmlFor="confirm-single-warning" className="text-xs cursor-pointer">
                    I confirm declaring this date a holiday despite existing records
                  </Label>
                </div>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button
                type="button"
                onClick={handleSaveSingle}
                disabled={savingSingle || (isHolidayChoice === "holiday" && targetDateAttendanceCount > 0 && !confirmAttendanceWarning)}
                className="w-full sm:w-auto"
              >
                {savingSingle ? "Saving..." : "Save Configuration"}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* TAB 2: BULK WEEKEND RULES */}
          <TabsContent value="bulk" className="space-y-4 pt-3">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Recurring Weekend Rule</Label>
              <RadioGroup
                value={weekendRule}
                onValueChange={(v) => setWeekendRule(v as any)}
                className="grid grid-cols-3 gap-2"
              >
                <div
                  className={`p-2.5 rounded-lg border text-center cursor-pointer ${
                    weekendRule === "both" ? "border-primary bg-primary/5 font-semibold" : "border-border"
                  }`}
                  onClick={() => setWeekendRule("both")}
                >
                  <RadioGroupItem value="both" id="rule-both" className="sr-only" />
                  <span className="text-xs block">Saturday & Sunday</span>
                  <span className="text-[10px] text-muted-foreground">Both off</span>
                </div>
                <div
                  className={`p-2.5 rounded-lg border text-center cursor-pointer ${
                    weekendRule === "saturday" ? "border-primary bg-primary/5 font-semibold" : "border-border"
                  }`}
                  onClick={() => setWeekendRule("saturday")}
                >
                  <RadioGroupItem value="saturday" id="rule-sat" className="sr-only" />
                  <span className="text-xs block">Saturday Only</span>
                  <span className="text-[10px] text-muted-foreground">Saturdays off</span>
                </div>
                <div
                  className={`p-2.5 rounded-lg border text-center cursor-pointer ${
                    weekendRule === "sunday" ? "border-primary bg-primary/5 font-semibold" : "border-border"
                  }`}
                  onClick={() => setWeekendRule("sunday")}
                >
                  <RadioGroupItem value="sunday" id="rule-sun" className="sr-only" />
                  <span className="text-xs block">Sunday Only</span>
                  <span className="text-[10px] text-muted-foreground">Sundays off</span>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Application Scope</Label>
              <RadioGroup
                value={applyScope}
                onValueChange={(v) => setApplyScope(v as any)}
                className="grid grid-cols-3 gap-2"
              >
                <div
                  className={`p-2 rounded-lg border text-center cursor-pointer ${
                    applyScope === "remaining" ? "border-primary bg-primary/5 font-semibold" : "border-border"
                  }`}
                  onClick={() => setApplyScope("remaining")}
                >
                  <RadioGroupItem value="remaining" id="scope-rem" className="sr-only" />
                  <span className="text-xs block">Remaining Dates</span>
                  <span className="text-[10px] text-muted-foreground">Today onwards</span>
                </div>
                <div
                  className={`p-2 rounded-lg border text-center cursor-pointer ${
                    applyScope === "full" ? "border-primary bg-primary/5 font-semibold" : "border-border"
                  }`}
                  onClick={() => setApplyScope("full")}
                >
                  <RadioGroupItem value="full" id="scope-full" className="sr-only" />
                  <span className="text-xs block">Full Schedule</span>
                  <span className="text-[10px] text-muted-foreground">From Day 1</span>
                </div>
                <div
                  className={`p-2 rounded-lg border text-center cursor-pointer ${
                    applyScope === "date_range" ? "border-primary bg-primary/5 font-semibold" : "border-border"
                  }`}
                  onClick={() => setApplyScope("date_range")}
                >
                  <RadioGroupItem value="date_range" id="scope-range" className="sr-only" />
                  <span className="text-xs block">Custom Range</span>
                  <span className="text-[10px] text-muted-foreground">Select start/end</span>
                </div>
              </RadioGroup>
            </div>

            {applyScope === "date_range" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Start Date</Label>
                  <Input
                    type="date"
                    value={bulkStartDate}
                    onChange={(e) => setBulkStartDate(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">End Date</Label>
                  <Input
                    type="date"
                    value={bulkEndDate}
                    onChange={(e) => setBulkEndDate(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Holiday Reason Label</Label>
              <Input
                placeholder="e.g. Weekend Holiday, Saturday Off..."
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                className="text-xs"
              />
            </div>

            {/* Affected Dates Preview */}
            <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-primary" /> Affected Dates Preview
                </span>
                <Badge variant="outline" className="text-xs">
                  {affectedBulkDates.length} Dates
                </Badge>
              </div>

              {affectedBulkDates.length > 0 ? (
                <div className="max-h-28 overflow-y-auto pr-1 flex flex-wrap gap-1.5">
                  {affectedBulkDates.map((d) => (
                    <span
                      key={d.date}
                      className={`text-[10px] px-2 py-0.5 rounded border font-mono ${
                        d.hasAttendance
                          ? "bg-amber-100 text-amber-800 border-amber-300 font-bold"
                          : "bg-background text-muted-foreground border-border"
                      }`}
                    >
                      {d.date} ({d.dayName.slice(0, 3)}){d.hasAttendance ? " ⚠️" : ""}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No weekend dates match this range.</p>
              )}
            </div>

            {bulkDatesWithAttendance.length > 0 && (
              <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 space-y-2 text-xs">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Existing Attendance in Weekend Range</span>
                </div>
                <p className="text-[11px]">
                  <strong>{bulkDatesWithAttendance.length}</strong> date(s) in this selection already contain attendance records ({bulkDatesWithAttendance.map((d) => d.date).join(", ")}).
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="confirm-bulk-warning"
                    checked={confirmBulkWarning}
                    onCheckedChange={(c) => setConfirmBulkWarning(!!c)}
                  />
                  <Label htmlFor="confirm-bulk-warning" className="text-xs cursor-pointer">
                    I confirm applying weekend holidays to dates with existing attendance
                  </Label>
                </div>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button
                type="button"
                onClick={handleApplyBulk}
                disabled={savingBulk || affectedBulkDates.length === 0 || (bulkDatesWithAttendance.length > 0 && !confirmBulkWarning)}
                className="w-full sm:w-auto"
              >
                {savingBulk ? "Applying..." : `Apply Rule (${affectedBulkDates.length} Dates)`}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* TAB 3: CONFIGURED HOLIDAYS LIST & RESTORE */}
          <TabsContent value="list" className="space-y-3 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Configured Workshop Holidays</span>
              <span className="text-[11px] text-muted-foreground">
                {configuredHolidaysList.length} non-working date(s)
              </span>
            </div>

            {configuredHolidaysList.length === 0 ? (
              <div className="p-8 text-center border border-dashed rounded-lg space-y-1 text-muted-foreground">
                <Sun className="h-6 w-6 mx-auto text-amber-500 opacity-80" />
                <p className="text-xs font-medium">No holidays configured</p>
                <p className="text-[11px]">All workshop dates are currently active sessions.</p>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {configuredHolidaysList.map((h) => (
                  <div
                    key={h.date}
                    className="p-2.5 rounded-lg border bg-card flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-foreground">{h.date}</span>
                        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-300">
                          {h.dayName}
                        </Badge>
                        {h.isToday && (
                          <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                            Today
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {h.holidayReason || "Non-Working Day"}
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestore(h.date)}
                      disabled={restoringDate === h.date}
                      className="h-8 text-xs gap-1.5 cursor-pointer shrink-0"
                    >
                      <RotateCcw className="h-3 w-3 text-primary" />
                      {restoringDate === h.date ? "Restoring..." : "Restore Active"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

