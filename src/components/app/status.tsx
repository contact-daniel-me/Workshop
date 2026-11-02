import { cn } from "@/lib/utils";
import type { DayState } from "@/lib/attendance";
import { Check, Clock, X, Minus, CalendarClock, ShieldCheck, Sun } from "lucide-react";

const map: Record<DayState, { cls: string; Icon: typeof Check }> = {
  Present: { cls: "bg-success text-success-foreground", Icon: Check },
  Absent: { cls: "bg-destructive/90 text-destructive-foreground", Icon: X },
  Pending: { cls: "bg-warning text-warning-foreground", Icon: Clock },
  Excused: { cls: "bg-info text-info-foreground", Icon: ShieldCheck },
  Open: { cls: "border-2 border-dashed border-primary text-primary bg-card", Icon: CalendarClock },
  "Not Held": { cls: "bg-muted text-muted-foreground", Icon: Minus },
  Holiday: { cls: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30", Icon: Sun },
};

export function StatusPill({ state, className }: { state: DayState; className?: string }) {
  const meta = map[state] || map["Not Held"];
  const { cls, Icon } = meta;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", cls, className)}>
      <Icon className="h-3 w-3" aria-hidden /> {state}
    </span>
  );
}

export function DayCell({ day, index, state }: { day: string; index: number; state: DayState }) {
  const meta = map[state] || map["Not Held"];
  const { cls, Icon } = meta;
  const isHoliday = state === "Holiday";
  return (
    <div
      className={cn("flex aspect-square flex-col items-center justify-center rounded-lg text-xs", cls)}
      title={isHoliday ? `Holiday · ${day}` : `Day ${index + 1} · ${day} · ${state}`}
      aria-label={isHoliday ? `Holiday, ${day}` : `Day ${index + 1}, ${day}: ${state}`}
    >
      <span className="font-display text-sm font-bold">{isHoliday ? "OFF" : index + 1}</span>
      <Icon className="h-3 w-3" aria-hidden />
    </div>
  );
}

export function VerifyBadge({ status }: { status: string }) {
  const cls =
    status === "verified" ? "bg-success text-success-foreground" : status === "rejected" ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground";
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold capitalize", cls)}>{status}</span>;
}
