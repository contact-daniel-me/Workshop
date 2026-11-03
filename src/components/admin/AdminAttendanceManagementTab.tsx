import { useState, useMemo } from "react";
import {
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  RotateCcw,
  Search,
  MoreVertical,
  CheckCheck,
  Sun,
  Sunset,
  Layers,
  History,
  Check,
  X,
  AlertTriangle,
  ArrowUpDown,
  CalendarDays,
  Download,
  FileSpreadsheet,
  ChevronDown,
  RefreshCw,
  FileDown,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Calendar as DayPickerCalendar } from "@/components/ui/calendar";
import { ClickableAvatar } from "@/components/ui/profile-photo-lightbox";
import { toast } from "sonner";
import {
  adminManualAttendanceAction,
  adminBulkAttendanceAction,
  getAttendanceAuditHistory,
  type ManualSessionAction,
  type BulkSessionAction,
} from "@/lib/admin.functions";
import {
  resolveSessionAttendance,
  todayLocal,
  workshopDays,
  computeWorkshopSchedule,
  type WorkshopCalendarDay,
  type WorkshopDayRecord,
  type Settings,
} from "@/lib/attendance";
import {
  type ParticipantRow,
  generateDailyAttendanceExcel,
  generateDateRangeAttendanceExcel,
  downloadExcelFile,
} from "@/lib/excel";
import { ManageWorkshopHolidaysDialog } from "./ManageWorkshopHolidaysDialog";
import { ResetWorkshopTimelineDialog } from "./ResetWorkshopTimelineDialog";

interface AdminAttendanceManagementTabProps {
  settings: Settings | null | undefined;
  participantRows: ParticipantRow[] | undefined;
  photoUrls: Record<string, string>;
  onAttendanceUpdated: () => Promise<void> | void;
  configuredDays?: WorkshopDayRecord[];
  onSettingsUpdated?: () => Promise<void> | void;
  initialDate?: string;
  allAttendance?: Array<{
    id?: string;
    user_id: string;
    day_date: string;
    status: string;
    method?: string | null;
    checked_in_at?: string | null;
    remarks?: string | null;
    morning_status?: string | null;
    afternoon_status?: string | null;
  }>;
}

export function AdminAttendanceManagementTab({
  settings,
  participantRows = [],
  photoUrls,
  onAttendanceUpdated,
  configuredDays = [],
  onSettingsUpdated,
  initialDate,
  allAttendance,
}: AdminAttendanceManagementTabProps) {
  const today = todayLocal();

  // Full dynamic schedule accounting for configured holidays
  const schedule = useMemo(() => {
    if (!settings) return [];
    return computeWorkshopSchedule(settings, configuredDays, today);
  }, [settings, configuredDays, today]);

  const allDays = useMemo(() => {
    if (schedule.length > 0) return schedule.map((d) => d.date);
    return settings ? workshopDays(settings) : [today];
  }, [schedule, settings, today]);

  // Selected Date State
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || today);

  // Active schedule day and holiday flag for the selected date
  const selectedScheduleDay = useMemo(() => {
    return schedule.find((d) => d.date === selectedDate);
  }, [schedule, selectedDate]);

  const isSelectedDateHoliday = selectedScheduleDay ? !selectedScheduleDay.isActive : false;

  // Dialog & Popover States
  const [calendarPopoverOpen, setCalendarPopoverOpen] = useState(false);
  const [holidaysDialogOpen, setHolidaysDialogOpen] = useState(false);
  const [resetTimelineDialogOpen, setResetTimelineDialogOpen] = useState(false);

  // Total Attendance Counts and Records for Pre-flight Conflict Checks
  const totalAttendanceRecordsCount = useMemo(() => {
    let count = 0;
    participantRows.forEach((p) => {
      if (p.rawAttendance) {
        count += Object.keys(p.rawAttendance).length;
      }
    });
    return count;
  }, [participantRows]);

  const allRecordedAttendanceDates = useMemo(() => {
    const list: { day_date: string }[] = [];
    participantRows.forEach((p) => {
      if (p.rawAttendance) {
        Object.keys(p.rawAttendance).forEach((d) => {
          list.push({ day_date: d });
        });
      }
    });
    return list;
  }, [participantRows]);

  // Search & Session Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [sessionFilter, setSessionFilter] = useState<"all" | "morning" | "afternoon" | "both" | "incomplete" | "absent">("all");

  // Selection Checkboxes State for Bulk Actions
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<Set<string>>(new Set());

  // Bulk Action Dialog State
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [pendingBulkAction, setPendingBulkAction] = useState<BulkSessionAction | null>(null);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  // Single Participant Action Confirmation State
  const [singleActionTarget, setSingleActionTarget] = useState<{
    participant: ParticipantRow;
    action: ManualSessionAction;
    title: string;
    isDestructive: boolean;
  } | null>(null);
  const [singleReason, setSingleReason] = useState("");
  const [singleBusy, setSingleBusy] = useState(false);

  // Audit Log Dialog State
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Approved Participants
  const approvedParticipants = useMemo(() => {
    return participantRows.filter((p) => p.verification_status === "verified");
  }, [participantRows]);

  // Map participant attendance for the selected date
  const participantDayData = useMemo(() => {
    return approvedParticipants.map((p) => {
      const att = p.rawAttendance[selectedDate];
      const sessionInfo = resolveSessionAttendance(att);
      return {
        participant: p,
        att,
        sessionInfo,
      };
    });
  }, [approvedParticipants, selectedDate]);

  // Attendance Overview Metrics for Selected Date
  const overviewStats = useMemo(() => {
    const total = approvedParticipants.length;
    let morningCount = 0;
    let afternoonCount = 0;
    let bothCount = 0;
    let incompleteCount = 0;
    let absentCount = 0;

    participantDayData.forEach(({ sessionInfo }) => {
      if (sessionInfo.morning) morningCount++;
      if (sessionInfo.afternoon) afternoonCount++;
      if (sessionInfo.morning && sessionInfo.afternoon) bothCount++;
      if (sessionInfo.overall === "incomplete") incompleteCount++;
      if (!sessionInfo.morning && !sessionInfo.afternoon) absentCount++;
    });

    return {
      total,
      morningCount,
      afternoonCount,
      bothCount,
      incompleteCount,
      absentCount,
      attendanceRate: total > 0 ? Math.round((bothCount / total) * 100) : 0,
    };
  }, [approvedParticipants.length, participantDayData]);

  // Filtered Participants based on search and session filter
  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return participantDayData.filter(({ participant, sessionInfo }) => {
      // Search filter
      if (query) {
        const matchesName = participant.full_name.toLowerCase().includes(query);
        const matchesCode = participant.participant_code.toLowerCase().includes(query);
        const matchesPhone = participant.phone.toLowerCase().includes(query);
        const matchesEmail = participant.email.toLowerCase().includes(query);
        if (!matchesName && !matchesCode && !matchesPhone && !matchesEmail) {
          return false;
        }
      }

      // Session filter
      if (sessionFilter === "morning") return sessionInfo.morning;
      if (sessionFilter === "afternoon") return sessionInfo.afternoon;
      if (sessionFilter === "both") return sessionInfo.morning && sessionInfo.afternoon;
      if (sessionFilter === "incomplete") return sessionInfo.overall === "incomplete";
      if (sessionFilter === "absent") return !sessionInfo.morning && !sessionInfo.afternoon;

      return true;
    });
  }, [participantDayData, searchQuery, sessionFilter]);

  // Selection Checkbox Helpers
  const isAllSelected = filteredRows.length > 0 && filteredRows.every((r) => selectedParticipantIds.has(r.participant.id));
  const isSomeSelected = filteredRows.some((r) => selectedParticipantIds.has(r.participant.id)) && !isAllSelected;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedParticipantIds(new Set());
    } else {
      const next = new Set<string>();
      filteredRows.forEach((r) => next.add(r.participant.id));
      setSelectedParticipantIds(next);
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedParticipantIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // ATTENDANCE EXCEL EXPORT HANDLERS (Entry & Exit Data)
  // ---------------------------------------------------------------------------
  const [downloadingExport, setDownloadingExport] = useState<string | null>(null);

  const handleDownloadAttendanceExcel = async (
    type: "all_sessions" | "entry_only" | "exit_only" | "filtered"
  ) => {
    if (approvedParticipants.length === 0) {
      toast.error("No verified participants found to export.");
      return;
    }
    setDownloadingExport(type);
    try {
      const participantsList = approvedParticipants.map((p) => ({
        id: p.id,
        participant_code: p.participant_code,
        full_name: p.full_name,
        phone: p.phone,
        email: p.email,
      }));

      if (type === "all_sessions") {
        const dayRecords = approvedParticipants.map((p) => {
          const att = p.rawAttendance[selectedDate];
          return {
            user_id: p.id,
            status: att?.status ?? "absent",
            morning_status: att?.morning_status ?? null,
            afternoon_status: att?.afternoon_status ?? null,
            entry_status: att?.morning_status ?? null,
            exit_status: att?.afternoon_status ?? null,
            checked_in_at: att?.checked_in_at ?? null,
            remarks: att?.remarks ?? null,
            method: att?.method ?? null,
          };
        });

        const bytes = await generateDailyAttendanceExcel({
          date: selectedDate,
          participants: participantsList,
          attendanceRecords: dayRecords,
          settings,
        });

        downloadExcelFile(bytes, `ESDP_Attendance_${selectedDate}.xlsx`);
        toast.success(`Exported daily attendance (Entry & Exit) for ${selectedDate}`);
      } else if (type === "entry_only" || type === "exit_only") {
        const dayRecords = approvedParticipants.map((p) => {
          const att = p.rawAttendance[selectedDate];
          return {
            user_id: p.id,
            day_date: selectedDate,
            status: att?.status ?? "absent",
            morning_status: att?.morning_status ?? null,
            afternoon_status: att?.afternoon_status ?? null,
            entry_status: att?.morning_status ?? null,
            exit_status: att?.afternoon_status ?? null,
            checked_in_at: att?.checked_in_at ?? null,
            remarks: att?.remarks ?? null,
            method: att?.method ?? null,
          };
        });

        const session = type === "entry_only" ? "entry" : "exit";
        const bytes = await generateDateRangeAttendanceExcel({
          startDate: selectedDate,
          endDate: selectedDate,
          participants: participantsList,
          attendanceRecords: dayRecords,
          settings,
          sessionType: session,
        });

        const filename =
          type === "entry_only"
            ? `ESDP_Entry_Attendance_${selectedDate}.xlsx`
            : `ESDP_Exit_Attendance_${selectedDate}.xlsx`;
        downloadExcelFile(bytes, filename);
        toast.success(
          `Exported ${type === "entry_only" ? "Entry" : "Exit"} attendance for ${selectedDate}`
        );
      } else if (type === "filtered") {
        if (filteredRows.length === 0) {
          toast.error("No participants match the current filter to export.");
          return;
        }
        const filteredParticipants = filteredRows.map((r) => ({
          id: r.participant.id,
          participant_code: r.participant.participant_code,
          full_name: r.participant.full_name,
          phone: r.participant.phone,
          email: r.participant.email,
        }));

        const dayRecords = filteredRows.map((r) => {
          const att = r.att;
          return {
            user_id: r.participant.id,
            status: att?.status ?? "absent",
            morning_status: att?.morning_status ?? null,
            afternoon_status: att?.afternoon_status ?? null,
            entry_status: att?.morning_status ?? null,
            exit_status: att?.afternoon_status ?? null,
            checked_in_at: att?.checked_in_at ?? null,
            remarks: att?.remarks ?? null,
            method: att?.method ?? null,
          };
        });

        const bytes = await generateDailyAttendanceExcel({
          date: selectedDate,
          participants: filteredParticipants,
          attendanceRecords: dayRecords,
          settings,
        });

        downloadExcelFile(bytes, `ESDP_Attendance_${selectedDate}_Filtered.xlsx`);
        toast.success(`Exported filtered attendance (${filteredRows.length} participants)`);
      }
    } catch (err: unknown) {
      console.error("Export attendance error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to export attendance data");
    } finally {
      setDownloadingExport(null);
    }
  };

  const handleDownloadAllHistory = async () => {
    if (approvedParticipants.length === 0) {
      toast.error("No verified participants found to export.");
      return;
    }
    setDownloadingExport("history");
    try {
      const participantsList = approvedParticipants.map((p) => ({
        id: p.id,
        participant_code: p.participant_code,
        full_name: p.full_name,
        phone: p.phone,
        email: p.email,
      }));

      const allRecords: Array<{
        user_id: string;
        day_date: string;
        status: string;
        morning_status?: string | null;
        afternoon_status?: string | null;
        entry_status?: string | null;
        exit_status?: string | null;
        checked_in_at?: string | null;
        remarks?: string | null;
        method?: string | null;
      }> = [];

      if (allAttendance && allAttendance.length > 0) {
        allAttendance.forEach((a) => {
          allRecords.push({
            user_id: a.user_id,
            day_date: a.day_date,
            status: a.status,
            morning_status: a.morning_status ?? null,
            afternoon_status: a.afternoon_status ?? null,
            entry_status: a.morning_status ?? null,
            exit_status: a.afternoon_status ?? null,
            checked_in_at: a.checked_in_at ?? null,
            remarks: a.remarks ?? null,
            method: a.method ?? null,
          });
        });
      } else {
        approvedParticipants.forEach((p) => {
          Object.entries(p.rawAttendance).forEach(([dayDate, att]) => {
            allRecords.push({
              user_id: p.id,
              day_date: dayDate,
              status: att.status,
              morning_status: att.morning_status,
              afternoon_status: att.afternoon_status,
              entry_status: att.morning_status,
              exit_status: att.afternoon_status,
              checked_in_at: att.checked_in_at,
              remarks: att.remarks,
              method: att.method,
            });
          });
        });
      }

      const recordedDates = allRecords.map((r) => r.day_date).filter(Boolean).sort();
      const startDate = recordedDates[0] || (settings?.start_date ?? selectedDate);
      const endDate = recordedDates[recordedDates.length - 1] || selectedDate;

      const bytes = await generateDateRangeAttendanceExcel({
        startDate,
        endDate,
        participants: participantsList,
        attendanceRecords: allRecords,
        settings,
        sessionType: "all",
      });

      downloadExcelFile(bytes, `ESDP_Master_Attendance_History_${startDate}_to_${endDate}.xlsx`);
      toast.success(`Exported master attendance history (${startDate} to ${endDate})`);
    } catch (err: unknown) {
      console.error("Master history export error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to download history");
    } finally {
      setDownloadingExport(null);
    }
  };

  // Execute Individual Participant Manual Action
  const handleExecuteSingleAction = async () => {
    if (!singleActionTarget) return;
    setSingleBusy(true);
    try {
      await adminManualAttendanceAction({
        data: {
          userId: singleActionTarget.participant.id,
          dayDate: selectedDate,
          action: singleActionTarget.action,
          reason: singleReason.trim() || undefined,
        },
      });
      toast.success(
        `Updated attendance for ${singleActionTarget.participant.full_name}: ${singleActionTarget.title}`
      );
      await onAttendanceUpdated();
      setSingleActionTarget(null);
      setSingleReason("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update attendance.");
    } finally {
      setSingleBusy(false);
    }
  };

  // Open Bulk Confirmation Dialog
  const handleTriggerBulkAction = (action: BulkSessionAction) => {
    setPendingBulkAction(action);
    setBulkReason("");
    setBulkDialogOpen(true);
  };

  // Execute Bulk Action
  const handleExecuteBulkAction = async () => {
    if (!pendingBulkAction) return;
    setBulkBusy(true);
    try {
      const targetUserIds =
        selectedParticipantIds.size > 0
          ? Array.from(selectedParticipantIds)
          : undefined;

      const res = await adminBulkAttendanceAction({
        data: {
          dayDate: selectedDate,
          action: pendingBulkAction,
          targetUserIds,
          reason: bulkReason.trim() || undefined,
        },
      });

      toast.success(res.message);
      await onAttendanceUpdated();
      setBulkDialogOpen(false);
      setPendingBulkAction(null);
      setBulkReason("");
      setSelectedParticipantIds(new Set());
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Bulk attendance operation failed.");
    } finally {
      setBulkBusy(false);
    }
  };

  // Fetch and Open Audit Log Dialog
  const handleOpenAuditLog = async () => {
    setAuditDialogOpen(true);
    setLoadingAudit(true);
    try {
      const res = await getAttendanceAuditHistory({ data: { dayDate: selectedDate, limit: 60 } });
      setAuditLogs(res.logs);
    } catch (err: unknown) {
      toast.error("Failed to load audit history.");
    } finally {
      setLoadingAudit(false);
    }
  };

  // Get Friendly Text for Bulk Action
  const getBulkActionMeta = (action: BulkSessionAction | null) => {
    switch (action) {
      case "mark_all_morning":
        return {
          title: "Mark Morning Session Present",
          session: "Morning Session",
          isDestructive: false,
          description: "Marks morning session attendance as verified present.",
        };
      case "mark_all_afternoon":
        return {
          title: "Mark Afternoon Session Present",
          session: "Afternoon Session",
          isDestructive: false,
          description: "Marks afternoon session attendance as verified present.",
        };
      case "mark_all_both":
        return {
          title: "Mark Both Sessions Present",
          session: "Morning & Afternoon Sessions",
          isDestructive: false,
          description: "Marks both sessions simultaneously as verified present for full daily credit.",
        };
      case "clear_all_morning":
        return {
          title: "Clear Morning Attendance",
          session: "Morning Session",
          isDestructive: true,
          description: "Clears morning session attendance back to unmarked state.",
        };
      case "clear_all_afternoon":
        return {
          title: "Clear Afternoon Attendance",
          session: "Afternoon Session",
          isDestructive: true,
          description: "Clears afternoon session attendance back to unmarked state.",
        };
      case "reset_all_both":
        return {
          title: "Reset Both Sessions (Clear All)",
          session: "Both Morning & Afternoon Sessions",
          isDestructive: true,
          description: "Completely resets all attendance records on this date to their initial unmarked state.",
        };
      default:
        return {
          title: "Attendance Operation",
          session: "Session",
          isDestructive: false,
          description: "",
        };
    }
  };

  const bulkMeta = getBulkActionMeta(pendingBulkAction);
  const affectedCount =
    selectedParticipantIds.size > 0
      ? selectedParticipantIds.size
      : approvedParticipants.length;

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER & INTERACTIVE CALENDAR SELECTOR */}
      <Card className="shadow-sm border">
        <CardHeader className="pb-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="font-display text-xl sm:text-2xl flex items-center gap-2.5">
                  <Calendar className="h-6 w-6 text-primary" /> Attendance Management
                </CardTitle>
                <Badge className="bg-primary/10 text-primary border-primary/20 font-mono text-xs">
                  ADMIN ONLY
                </Badge>
              </div>
              <CardDescription className="mt-1">
                Manual session-wise attendance controls (Morning, Afternoon & Both), calendar scheduling, and audit-logged overrides.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Standard Monthly Calendar Popover */}
              <Popover open={calendarPopoverOpen} onOpenChange={setCalendarPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs font-semibold cursor-pointer">
                    <CalendarDays className="h-3.5 w-3.5 text-primary" />
                    <span className="font-mono">{selectedDate}</span>
                    <Badge variant="secondary" className="font-mono text-[10px] px-1 py-0">
                      {selectedScheduleDay ? (selectedScheduleDay.isActive ? `Day ${selectedScheduleDay.dayNumber}` : "Holiday") : ""}
                    </Badge>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3" align="end">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b">
                      <div className="text-xs font-bold flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 text-primary" /> Monthly Calendar
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px] px-2 text-primary font-semibold cursor-pointer"
                        onClick={() => {
                          setSelectedDate(today);
                          setCalendarPopoverOpen(false);
                        }}
                      >
                        Jump to Today
                      </Button>
                    </div>

                    <DayPickerCalendar
                      mode="single"
                      selected={new Date(selectedDate + "T00:00:00")}
                      onSelect={(d) => {
                        if (d) {
                          const year = d.getFullYear();
                          const month = String(d.getMonth() + 1).padStart(2, "0");
                          const day = String(d.getDate()).padStart(2, "0");
                          setSelectedDate(`${year}-${month}-${day}`);
                          setCalendarPopoverOpen(false);
                        }
                      }}
                      modifiers={{
                        workshopActive: (d) => {
                          const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                          const item = schedule.find((s) => s.date === str);
                          return !!(item && item.isActive);
                        },
                        workshopHoliday: (d) => {
                          const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                          const item = schedule.find((s) => s.date === str);
                          return !!(item && !item.isActive);
                        },
                        isCurrentToday: (d) => {
                          const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                          return str === today;
                        },
                      }}
                      modifiersClassNames={{
                        workshopActive: "font-bold text-emerald-700 dark:text-emerald-400",
                        workshopHoliday: "bg-amber-100 text-amber-900 font-bold dark:bg-amber-950/70 dark:text-amber-300",
                        isCurrentToday: "ring-2 ring-primary ring-offset-1 font-bold",
                      }}
                    />

                    <div className="pt-2 border-t flex items-center justify-between text-[11px] text-muted-foreground gap-2">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" /> Active Session
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-amber-500" /> Holiday / Off
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full border border-primary" /> Today
                      </span>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Quick Jump Date Select */}
              <div className="flex items-center gap-1.5">
                <Select value={selectedDate} onValueChange={setSelectedDate}>
                  <SelectTrigger className="w-[195px] font-mono text-xs h-9 bg-card">
                    <SelectValue placeholder="Select Workshop Date" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {schedule.map((item) => (
                      <SelectItem key={item.date} value={item.date} className="font-mono text-xs">
                        {item.isActive ? `Day ${item.dayNumber}` : `Holiday`} ({item.date}) {item.isToday ? "— Today" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Manage Workshop Days & Holidays Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHolidaysDialogOpen(true)}
                className="h-9 gap-1.5 text-xs font-semibold cursor-pointer border-amber-300/80 hover:bg-amber-50 dark:border-amber-700 dark:hover:bg-amber-950/40 text-amber-900 dark:text-amber-200"
              >
                <CalendarDays className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span>Manage Days & Holidays</span>
              </Button>

              {/* Reset Workshop Timeline Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setResetTimelineDialogOpen(true)}
                className="h-9 gap-1.5 text-xs font-semibold cursor-pointer border-rose-300/80 hover:bg-rose-50 dark:border-rose-700 dark:hover:bg-rose-950/40 text-rose-900 dark:text-rose-200"
              >
                <RotateCcw className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                <span>Reset Timeline</span>
              </Button>

              {/* View Audit Trail Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenAuditLog}
                className="h-9 gap-1.5 text-xs font-semibold cursor-pointer"
              >
                <History className="h-3.5 w-3.5 text-primary" /> Audit History
              </Button>

              {/* Download Attendance (Entry & Exit) Data Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    disabled={!!downloadingExport}
                    className="h-9 gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs"
                  >
                    {downloadingExport ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                    )}
                    <span>Download Attendance</span>
                    <ChevronDown className="h-3 w-3 opacity-80" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="text-xs font-bold text-muted-foreground">
                    Selected Date ({selectedDate})
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => handleDownloadAttendanceExcel("all_sessions")}
                    className="text-xs gap-2 cursor-pointer font-medium"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    <div className="flex flex-col">
                      <span>Daily Entry & Exit List (.xlsx)</span>
                      <span className="text-[10px] text-muted-foreground">Detailed records & summary</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDownloadAttendanceExcel("entry_only")}
                    className="text-xs gap-2 cursor-pointer"
                  >
                    <Sun className="h-4 w-4 text-amber-600" />
                    <div className="flex flex-col">
                      <span>Entry Attendance List (.xlsx)</span>
                      <span className="text-[10px] text-muted-foreground">Morning check-ins and timestamps</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDownloadAttendanceExcel("exit_only")}
                    className="text-xs gap-2 cursor-pointer"
                  >
                    <Sunset className="h-4 w-4 text-orange-600" />
                    <div className="flex flex-col">
                      <span>Exit Attendance List (.xlsx)</span>
                      <span className="text-[10px] text-muted-foreground">Afternoon check-outs and timestamps</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-bold text-muted-foreground">
                    Additional Exports
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => handleDownloadAttendanceExcel("filtered")}
                    className="text-xs gap-2 cursor-pointer"
                    disabled={filteredRows.length === 0}
                  >
                    <Download className="h-4 w-4 text-primary" />
                    <div className="flex flex-col">
                      <span>Export Filtered View ({filteredRows.length})</span>
                      <span className="text-[10px] text-muted-foreground">Matches active search & session filter</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleDownloadAllHistory}
                    className="text-xs gap-2 cursor-pointer"
                  >
                    <History className="h-4 w-4 text-blue-600" />
                    <div className="flex flex-col">
                      <span>Complete Workshop Master (.xlsx)</span>
                      <span className="text-[10px] text-muted-foreground">All dates entry & exit data</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Interactive Workshop Attendance Calendar Strip */}
          <div className="mt-5 pt-4 border-t space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" /> Workshop Timeline (Click to Select Date)
              </p>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Active Past/Today</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/30" /> Upcoming Active</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Holiday / Off</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full ring-2 ring-primary" /> Today</span>
              </div>
            </div>

            {/* Dynamic Grid */}
            <div className="grid grid-cols-6 sm:grid-cols-10 lg:grid-cols-15 gap-1.5 pt-1">
              {schedule.map((item) => {
                const isSelected = item.date === selectedDate;
                const isPastOrTodayActive = item.isActive && item.date <= today;
                const isHoliday = !item.isActive;

                let btnClass = "bg-card text-muted-foreground hover:bg-muted/40 border-border";
                if (isSelected) {
                  btnClass = isHoliday
                    ? "bg-amber-600 text-white border-amber-700 shadow-xs ring-2 ring-amber-400/50 font-bold"
                    : "bg-primary text-primary-foreground border-primary shadow-xs ring-2 ring-primary/40 font-bold";
                } else if (item.isToday) {
                  btnClass = isHoliday
                    ? "bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500 font-bold ring-2 ring-amber-500/40"
                    : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500 font-bold ring-2 ring-emerald-500/40";
                } else if (isHoliday) {
                  btnClass = "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20";
                } else if (isPastOrTodayActive) {
                  btnClass = "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-100/60";
                }

                return (
                  <button
                    key={item.date}
                    type="button"
                    onClick={() => setSelectedDate(item.date)}
                    className={`flex flex-col items-center justify-center p-1.5 rounded-lg border text-center transition-all cursor-pointer ${btnClass}`}
                    title={
                      isHoliday
                        ? `Holiday: ${item.holidayReason || "Non-Working Day"} (${item.date})${item.isToday ? " (Today)" : ""}`
                        : `Day ${item.dayNumber}: ${item.date}${item.isToday ? " (Today)" : ""}`
                    }
                  >
                    <span className="text-[10px] font-bold font-mono">
                      {isHoliday ? "OFF" : `D${item.dayNumber}`}
                    </span>
                    <span className="text-[9px] opacity-80 truncate max-w-full font-mono">
                      {item.date.slice(5)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* NON-WORKING DAY / HOLIDAY ALERT BANNER */}
      {isSelectedDateHoliday && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-sm flex items-center gap-2">
                <span>Non-Working Day / Holiday</span>
                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-mono font-bold">
                  OFF
                </Badge>
                <span className="text-xs font-mono text-muted-foreground">({selectedDate})</span>
              </div>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                {selectedScheduleDay?.holidayReason || "This date is marked as a holiday. Attendance marking is disabled."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setHolidaysDialogOpen(true)}
              className="border-amber-500/40 hover:bg-amber-500/20 text-xs font-semibold cursor-pointer"
            >
              Manage / Restore Date
            </Button>
          </div>
        </div>
      )}

      {/* 2. ATTENDANCE OVERVIEW KPI METRICS */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-6">
        {/* Total Registered */}
        <Card className="shadow-xs border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1.5 p-4">
            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Participants</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold font-display">{overviewStats.total}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Approved Attendees</p>
          </CardContent>
        </Card>

        {/* Entry Attendance Present */}
        <Card className="shadow-xs border bg-amber-500/5 border-amber-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-1.5 p-4">
            <CardTitle className="text-xs font-semibold uppercase text-amber-800 dark:text-amber-400">Entry Attendance</CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-amber-700 hover:text-amber-900 hover:bg-amber-100 dark:hover:bg-amber-950/50 cursor-pointer"
                title="Download Entry Attendance List (.xlsx)"
                disabled={!!downloadingExport}
                onClick={() => handleDownloadAttendanceExcel("entry_only")}
              >
                <Download className="h-3 w-3" />
              </Button>
              <Sun className="h-4 w-4 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold font-display text-amber-700 dark:text-amber-300">
              {overviewStats.morningCount}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Checked In (Entry)</p>
          </CardContent>
        </Card>

        {/* Exit Attendance Present */}
        <Card className="shadow-xs border bg-orange-500/5 border-orange-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-1.5 p-4">
            <CardTitle className="text-xs font-semibold uppercase text-orange-800 dark:text-orange-400">Exit Attendance</CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-orange-700 hover:text-orange-900 hover:bg-orange-100 dark:hover:bg-orange-950/50 cursor-pointer"
                title="Download Exit Attendance List (.xlsx)"
                disabled={!!downloadingExport}
                onClick={() => handleDownloadAttendanceExcel("exit_only")}
              >
                <Download className="h-3 w-3" />
              </Button>
              <Sunset className="h-4 w-4 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold font-display text-orange-700 dark:text-orange-300">
              {overviewStats.afternoonCount}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Checked Out (Exit)</p>
          </CardContent>
        </Card>

        {/* Both Sessions Present */}
        <Card className="shadow-xs border bg-emerald-500/5 border-emerald-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-1.5 p-4">
            <CardTitle className="text-xs font-semibold uppercase text-emerald-800 dark:text-emerald-400">Complete (Both)</CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 cursor-pointer"
                title="Download Daily Entry & Exit Report (.xlsx)"
                disabled={!!downloadingExport}
                onClick={() => handleDownloadAttendanceExcel("all_sessions")}
              >
                <Download className="h-3 w-3" />
              </Button>
              <CheckCheck className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold font-display text-emerald-700 dark:text-emerald-300">
              {overviewStats.bothCount}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Both Entry & Exit Verified</p>
          </CardContent>
        </Card>

        {/* Incomplete Attendance */}
        <Card className="shadow-xs border bg-purple-500/5 border-purple-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-1.5 p-4">
            <CardTitle className="text-xs font-semibold uppercase text-purple-800 dark:text-purple-400">Single Session</CardTitle>
            <Clock className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold font-display text-purple-700 dark:text-purple-300">
              {overviewStats.incompleteCount}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">1 of 2 Sessions Marked</p>
          </CardContent>
        </Card>

        {/* No Attendance */}
        <Card className="shadow-xs border bg-muted/30">
          <CardHeader className="flex flex-row items-center justify-between pb-1.5 p-4">
            <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Absent</CardTitle>
            <X className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold font-display text-muted-foreground">
              {overviewStats.absentCount}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Neither Entry nor Exit</p>
          </CardContent>
        </Card>
      </div>

      {/* 3. BULK ATTENDANCE MANAGEMENT CONTROLS */}
      <Card className="shadow-sm border">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="font-display text-base sm:text-lg flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" /> Bulk Attendance Management
              </CardTitle>
              <CardDescription>
                Apply session-wide attendance marks or reset actions to all participants or selected checkboxes simultaneously.
              </CardDescription>
            </div>

            {selectedParticipantIds.size > 0 && (
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/30 font-semibold text-xs py-1 px-3">
                {selectedParticipantIds.size} Selected Participant{selectedParticipantIds.size > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Mark Attendance Group */}
            <span className="text-xs font-bold text-muted-foreground uppercase mr-1">Mark:</span>
            <Button
              size="sm"
              variant="outline"
              disabled={isSelectedDateHoliday}
              title={isSelectedDateHoliday ? "Attendance cannot be marked on non-working days" : undefined}
              onClick={() => handleTriggerBulkAction("mark_all_morning")}
              className="h-8 text-xs font-semibold gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50 cursor-pointer disabled:opacity-40"
            >
              <Sun className="h-3.5 w-3.5 text-amber-600" /> Entry Present
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={isSelectedDateHoliday}
              title={isSelectedDateHoliday ? "Attendance cannot be marked on non-working days" : undefined}
              onClick={() => handleTriggerBulkAction("mark_all_afternoon")}
              className="h-8 text-xs font-semibold gap-1.5 border-orange-300 text-orange-800 hover:bg-orange-50 cursor-pointer disabled:opacity-40"
            >
              <Sunset className="h-3.5 w-3.5 text-orange-600" /> Exit Present
            </Button>

            <Button
              size="sm"
              disabled={isSelectedDateHoliday}
              title={isSelectedDateHoliday ? "Attendance cannot be marked on non-working days" : undefined}
              onClick={() => handleTriggerBulkAction("mark_all_both")}
              className="h-8 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-xs cursor-pointer disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Both (Entry & Exit) Present
            </Button>

            {/* Separator */}
            <div className="h-5 w-px bg-border mx-1 hidden sm:block" />

            {/* Clear / Reset Attendance Group */}
            <span className="text-xs font-bold text-muted-foreground uppercase mr-1">Clear / Reset:</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleTriggerBulkAction("clear_all_morning")}
              className="h-8 text-xs font-semibold gap-1.5 border-muted text-muted-foreground hover:text-destructive hover:border-destructive/30 cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" /> Clear Entry
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleTriggerBulkAction("clear_all_afternoon")}
              className="h-8 text-xs font-semibold gap-1.5 border-muted text-muted-foreground hover:text-destructive hover:border-destructive/30 cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" /> Clear Exit
            </Button>

            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleTriggerBulkAction("reset_all_both")}
              className="h-8 text-xs font-bold gap-1.5 shadow-xs cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset Both
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 4. SEARCH, SESSION FILTERS & INDIVIDUAL PARTICIPANT TABLE */}
      <Card className="shadow-sm border">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="font-display text-lg">
                Participant Attendance Records — {selectedDate}
              </CardTitle>
              <CardDescription>
                Search, verify individual session statuses, and manually override or reset attendance.
              </CardDescription>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search Input */}
              <div className="relative min-w-[220px]">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search name, code, phone…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 text-xs h-9 bg-card"
                />
              </div>

              {/* Session Filter */}
              <Select value={sessionFilter} onValueChange={(v) => setSessionFilter(v as any)}>
                <SelectTrigger className="w-[180px] text-xs h-9 bg-card">
                  <SelectValue placeholder="Filter by Session" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Participants ({approvedParticipants.length})</SelectItem>
                  <SelectItem value="both">Complete Attendance ({overviewStats.bothCount})</SelectItem>
                  <SelectItem value="morning">Entry Present ({overviewStats.morningCount})</SelectItem>
                  <SelectItem value="afternoon">Exit Present ({overviewStats.afternoonCount})</SelectItem>
                  <SelectItem value="incomplete">Incomplete Attendance ({overviewStats.incompleteCount})</SelectItem>
                  <SelectItem value="absent">Unmarked / Absent ({overviewStats.absentCount})</SelectItem>
                </SelectContent>
              </Select>

              {/* Quick Download Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!downloadingExport}
                    className="h-9 gap-1.5 text-xs font-semibold cursor-pointer border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                  >
                    {downloadingExport ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">Download Data</span>
                    <span className="sm:hidden">Download</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onClick={() => handleDownloadAttendanceExcel("all_sessions")}
                    className="text-xs gap-2 cursor-pointer font-medium"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Daily Entry & Exit List</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDownloadAttendanceExcel("entry_only")}
                    className="text-xs gap-2 cursor-pointer"
                  >
                    <Sun className="h-3.5 w-3.5 text-amber-600" />
                    <span>Entry Attendance List</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDownloadAttendanceExcel("exit_only")}
                    className="text-xs gap-2 cursor-pointer"
                  >
                    <Sunset className="h-3.5 w-3.5 text-orange-600" />
                    <span>Exit Attendance List</span>
                  </DropdownMenuItem>
                  {(searchQuery || sessionFilter !== "all") && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDownloadAttendanceExcel("filtered")}
                        className="text-xs gap-2 cursor-pointer"
                      >
                        <Download className="h-3.5 w-3.5 text-primary" />
                        <span>Filtered List ({filteredRows.length})</span>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 sm:p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
                <tr>
                  <th className="py-3 px-4 w-10">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all participants"
                    />
                  </th>
                  <th className="py-3 px-4">Participant ID</th>
                  <th className="py-3 px-4">Participant Name</th>
                  <th className="py-3 px-4 text-center">Entry Attendance</th>
                  <th className="py-3 px-4 text-center">Exit Attendance</th>
                  <th className="py-3 px-4 text-center">Overall Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {!filteredRows.length ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      No participants match the specified filter or search query for {selectedDate}.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map(({ participant: p, att, sessionInfo }) => {
                    const isSelected = selectedParticipantIds.has(p.id);
                    const photoUrl = p.photo_path ? photoUrls[p.photo_path] : undefined;

                    return (
                      <tr key={p.id} className={`hover:bg-muted/20 transition-colors ${isSelected ? "bg-primary/5" : ""}`}>
                        {/* Checkbox */}
                        <td className="py-3 px-4">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelectOne(p.id)}
                            aria-label={`Select ${p.full_name}`}
                          />
                        </td>

                        {/* Participant ID */}
                        <td className="py-3 px-4">
                          <Badge variant="outline" className="font-mono text-xs font-semibold bg-card">
                            {p.participant_code}
                          </Badge>
                        </td>

                        {/* Name & Avatar */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <ClickableAvatar
                              src={photoUrl}
                              alt={p.full_name}
                              fullName={p.full_name}
                              participantCode={p.participant_code}
                              verificationStatus={p.verification_status}
                              fallback={p.full_name.slice(0, 2).toUpperCase()}
                              className="h-10 w-10 rounded-xl border shadow-2xs shrink-0 object-cover"
                              fallbackClassName="text-xs font-bold"
                            />
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate max-w-[180px]">{p.full_name}</p>
                              <p className="text-[11px] text-muted-foreground font-mono truncate">{p.phone}</p>
                            </div>
                          </div>
                        </td>

                        {/* Entry Session Status */}
                        <td className="py-3 px-4 text-center">
                          {sessionInfo.morning ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <Badge className="bg-emerald-600 text-white gap-1 text-xs font-medium px-2.5 py-0.5">
                                <Check className="h-3 w-3" /> Present
                              </Badge>
                              {sessionInfo.entryTime && (
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {sessionInfo.entryTime}
                                </span>
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline" className="border-border text-muted-foreground text-xs px-2.5 py-0.5">
                              Not Marked
                            </Badge>
                          )}
                        </td>

                        {/* Exit Session Status */}
                        <td className="py-3 px-4 text-center">
                          {sessionInfo.afternoon ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <Badge className="bg-emerald-600 text-white gap-1 text-xs font-medium px-2.5 py-0.5">
                                <Check className="h-3 w-3" /> Present
                              </Badge>
                              {sessionInfo.exitTime && (
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {sessionInfo.exitTime}
                                </span>
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline" className="border-border text-muted-foreground text-xs px-2.5 py-0.5">
                              Not Marked
                            </Badge>
                          )}
                        </td>

                        {/* Overall Status */}
                        <td className="py-3 px-4 text-center">
                          {sessionInfo.morning && sessionInfo.afternoon ? (
                            <Badge className="bg-emerald-700 text-white font-semibold text-xs px-3 py-1">
                              Present (Full)
                            </Badge>
                          ) : sessionInfo.overall === "incomplete" ? (
                            <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800 font-semibold text-xs px-2.5 py-0.5">
                              Incomplete (1/2)
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs text-muted-foreground px-2.5 py-0.5">
                              Absent
                            </Badge>
                          )}
                        </td>

                        {/* Individual Actions Menu */}
                        <td className="py-3 px-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 cursor-pointer">
                                <MoreVertical className="h-4 w-4" />
                                <span className="sr-only">Open attendance actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel className="text-xs text-muted-foreground">
                                Attendance Override
                              </DropdownMenuLabel>

                              {isSelectedDateHoliday ? (
                                <DropdownMenuItem disabled className="cursor-not-allowed gap-2 text-xs text-amber-700 dark:text-amber-400">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  <span>Non-Working Day (Disabled)</span>
                                </DropdownMenuItem>
                              ) : (
                                <>
                                  {/* Mark Entry Present */}
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setSingleActionTarget({
                                        participant: p,
                                        action: "mark_morning",
                                        title: "Mark Entry Present",
                                        isDestructive: false,
                                      })
                                    }
                                    className="cursor-pointer gap-2 text-xs"
                                  >
                                    <Sun className="h-3.5 w-3.5 text-amber-600" />
                                    <span>Mark Entry Present</span>
                                  </DropdownMenuItem>

                                  {/* Mark Exit Present */}
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setSingleActionTarget({
                                        participant: p,
                                        action: "mark_afternoon",
                                        title: "Mark Exit Present",
                                        isDestructive: false,
                                      })
                                    }
                                    className="cursor-pointer gap-2 text-xs"
                                  >
                                    <Sunset className="h-3.5 w-3.5 text-orange-600" />
                                    <span>Mark Exit Present</span>
                                  </DropdownMenuItem>

                                  {/* Mark Both Sessions Present */}
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setSingleActionTarget({
                                        participant: p,
                                        action: "mark_both",
                                        title: "Mark Both (Entry & Exit) Present",
                                        isDestructive: false,
                                      })
                                    }
                                    className="cursor-pointer gap-2 text-xs font-semibold text-emerald-700"
                                  >
                                    <CheckCheck className="h-3.5 w-3.5 text-emerald-600" />
                                    <span>Mark Both (Entry & Exit) Present</span>
                                  </DropdownMenuItem>
                                </>
                              )}

                              <DropdownMenuSeparator />

                              {/* Clear Entry Attendance */}
                              <DropdownMenuItem
                                onClick={() =>
                                  setSingleActionTarget({
                                    participant: p,
                                    action: "clear_morning",
                                    title: "Clear Entry Attendance",
                                    isDestructive: true,
                                  })
                                }
                                className="cursor-pointer gap-2 text-xs text-muted-foreground hover:text-destructive"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span>Clear Entry Attendance</span>
                              </DropdownMenuItem>

                              {/* Clear Exit Attendance */}
                              <DropdownMenuItem
                                onClick={() =>
                                  setSingleActionTarget({
                                    participant: p,
                                    action: "clear_afternoon",
                                    title: "Clear Exit Attendance",
                                    isDestructive: true,
                                  })
                                }
                                className="cursor-pointer gap-2 text-xs text-muted-foreground hover:text-destructive"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span>Clear Exit Attendance</span>
                              </DropdownMenuItem>

                              {/* Reset Both Sessions */}
                              <DropdownMenuItem
                                onClick={() =>
                                  setSingleActionTarget({
                                    participant: p,
                                    action: "reset_both",
                                    title: "Reset Both Sessions",
                                    isDestructive: true,
                                  })
                                }
                                className="cursor-pointer gap-2 text-xs font-bold text-destructive"
                              >
                                <RotateCcw className="h-3.5 w-3.5 text-destructive" />
                                <span>Reset Both Sessions</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 5. CONFIRMATION DIALOG: INDIVIDUAL PARTICIPANT ACTION */}
      {singleActionTarget && (
        <Dialog open={!!singleActionTarget} onOpenChange={() => setSingleActionTarget(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className={`font-display text-lg flex items-center gap-2 ${singleActionTarget.isDestructive ? "text-destructive" : ""}`}>
                {singleActionTarget.isDestructive ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <CheckCircle2 className="h-5 w-5 text-primary" />}
                {singleActionTarget.title}
              </DialogTitle>
              <DialogDescription>
                Confirm manual attendance override for <strong>{singleActionTarget.participant.full_name}</strong> ({singleActionTarget.participant.participant_code}) on workshop date <strong>{selectedDate}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="p-3 rounded-lg border bg-muted/20 text-xs space-y-1">
                <p><strong>Operation:</strong> {singleActionTarget.title}</p>
                <p><strong>Date:</strong> {selectedDate}</p>
                <p><strong>Participant:</strong> {singleActionTarget.participant.full_name} ({singleActionTarget.participant.participant_code})</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Reason for Override (Optional for Audit Log)</label>
                <Input
                  placeholder="e.g. Verified in person, camera issue, arrived for afternoon session"
                  value={singleReason}
                  onChange={(e) => setSingleReason(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setSingleActionTarget(null)} disabled={singleBusy}>
                Cancel
              </Button>
              <Button
                variant={singleActionTarget.isDestructive ? "destructive" : "default"}
                onClick={handleExecuteSingleAction}
                disabled={singleBusy}
                className="font-bold"
              >
                {singleBusy ? "Updating…" : "Confirm & Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 6. CONFIRMATION DIALOG: BULK ACTION */}
      {bulkDialogOpen && (
        <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className={`font-display text-xl flex items-center gap-2 ${bulkMeta.isDestructive ? "text-destructive" : "text-primary"}`}>
                {bulkMeta.isDestructive ? <AlertTriangle className="h-6 w-6 text-destructive" /> : <Layers className="h-6 w-6 text-primary" />}
                Confirm Bulk Attendance Operation
              </DialogTitle>
              <DialogDescription>
                Review the operation details below before applying changes to multiple participant attendance records.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-2">
              <div className="p-3.5 rounded-xl border bg-muted/30 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">Selected Operation:</span>
                  <span className="font-bold text-foreground">{bulkMeta.title}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">Target Session:</span>
                  <span className="font-semibold text-primary">{bulkMeta.session}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">Workshop Session Date:</span>
                  <span className="font-mono font-bold text-foreground">{selectedDate}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">Affected Participants:</span>
                  <Badge variant="outline" className="font-bold">
                    {affectedCount} Participant{affectedCount > 1 ? "s" : ""} {selectedParticipantIds.size > 0 ? "(Selected via checkboxes)" : "(All registered)"}
                  </Badge>
                </div>
              </div>

              {bulkMeta.isDestructive && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> Destructive Reset Warning
                  </p>
                  <p>
                    This action will clear attendance records for the target session on {selectedDate}. Participant profiles and records on other dates will remain completely safe.
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Mandatory Audit Note / Reason</label>
                <Input
                  placeholder="e.g. Workshop full day attendance approval, venue network disruption"
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setBulkDialogOpen(false)} disabled={bulkBusy}>
                Cancel
              </Button>
              <Button
                variant={bulkMeta.isDestructive ? "destructive" : "default"}
                onClick={handleExecuteBulkAction}
                disabled={bulkBusy}
                className="font-bold"
              >
                {bulkBusy ? "Processing Bulk Update…" : `Confirm for ${affectedCount} Participants`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 7. AUDIT TRAIL MODAL */}
      {auditDialogOpen && (
        <Dialog open={auditDialogOpen} onOpenChange={setAuditDialogOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-xl flex items-center gap-2">
                <History className="h-5 w-5 text-primary" /> Attendance Audit History
              </DialogTitle>
              <DialogDescription>
                Detailed audit trail of manual and bulk attendance modifications recorded by administrators.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {loadingAudit ? (
                <div className="py-12 text-center text-xs text-muted-foreground animate-pulse">
                  Loading audit logs from server…
                </div>
              ) : !auditLogs.length ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  No attendance audit logs recorded yet.
                </div>
              ) : (
                <div className="divide-y border rounded-xl overflow-hidden">
                  {auditLogs.map((log) => {
                    const dt = log.details || {};
                    return (
                      <div key={log.id} className="p-3 text-xs space-y-1 hover:bg-muted/10 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground font-mono">
                            {log.action.replace(/_/g, " ").toUpperCase()}
                          </span>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {new Date(log.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-muted-foreground flex items-center gap-2 flex-wrap">
                          {dt.dayDate && <span>Date: <strong>{dt.dayDate}</strong></span>}
                          {dt.action && <span>Action: <strong>{dt.action}</strong></span>}
                          {dt.affectedCount && <span>Affected: <strong>{dt.affectedCount}</strong></span>}
                        </div>
                        {dt.reason && (
                          <p className="text-xs text-foreground bg-muted/30 p-1.5 rounded font-mono">
                            Reason: {dt.reason}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setAuditDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 6. MANAGE WORKSHOP DAYS & HOLIDAYS DIALOG */}
      {settings && (
        <ManageWorkshopHolidaysDialog
          open={holidaysDialogOpen}
          onOpenChange={setHolidaysDialogOpen}
          selectedDate={selectedDate}
          schedule={schedule}
          configuredDays={configuredDays || []}
          settings={settings}
          attendanceRecords={allRecordedAttendanceDates}
          onConfigUpdated={async () => {
            await onSettingsUpdated?.();
            await onAttendanceUpdated();
          }}
        />
      )}

      {/* 7. RESET WORKSHOP TIMELINE DIALOG */}
      {settings && (
        <ResetWorkshopTimelineDialog
          open={resetTimelineDialogOpen}
          onOpenChange={setResetTimelineDialogOpen}
          settings={settings}
          totalAttendanceRecordsCount={totalAttendanceRecordsCount}
          onTimelineReset={async () => {
            await onSettingsUpdated?.();
            await onAttendanceUpdated();
          }}
        />
      )}
    </div>
  );
}

