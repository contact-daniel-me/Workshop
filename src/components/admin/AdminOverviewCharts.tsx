import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export interface DailyTrendItem {
  day: string;
  date: string;
  present: number;
  absent: number;
  pending: number;
}

export interface DistributionItem {
  range: string;
  count: number;
}

interface Props {
  dailyTrendData: DailyTrendItem[];
  distributionData: DistributionItem[];
  totalRegistered: number;
}

export function AdminOverviewCharts({ dailyTrendData, distributionData, totalRegistered }: Props) {
  const [hoveredDay, setHoveredDay] = useState<DailyTrendItem | null>(null);

  // Maximum attendees on any day to scale trend chart bars
  const maxTrendTotal = Math.max(
    totalRegistered || 1,
    ...dailyTrendData.map((d) => d.present + d.pending + d.absent),
    1
  );

  // Maximum participants in any distribution bracket to scale bars
  const maxDistributionCount = Math.max(...distributionData.map((d) => d.count), 1);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* 30-Day Attendance Trends */}
      <Card className="lg:col-span-2 shadow-sm flex flex-col justify-between">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="font-display text-lg">30-Day Attendance Trends</CardTitle>
              <CardDescription>Present vs Absent attendees per workshop day</CardDescription>
            </div>
            {hoveredDay && (
              <div className="rounded-lg bg-muted px-2.5 py-1 text-xs font-mono flex items-center gap-2 border">
                <span className="font-bold text-foreground">{hoveredDay.day} ({hoveredDay.date}):</span>
                <span className="text-emerald-600 font-semibold">{hoveredDay.present} Present</span>
                {hoveredDay.pending > 0 && <span className="text-amber-600">{hoveredDay.pending} Pending</span>}
                <span className="text-destructive font-semibold">{hoveredDay.absent} Absent</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-60 w-full flex items-end gap-1 sm:gap-1.5 overflow-x-auto pb-6 pt-4 border-b">
            {dailyTrendData.length === 0 ? (
              <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                No attendance trend data available yet.
              </div>
            ) : (
              dailyTrendData.map((item, idx) => {
                const total = item.present + item.pending + item.absent;
                const totalPct = Math.min(100, Math.round((total / maxTrendTotal) * 100));
                const presentPct = total > 0 ? (item.present / total) * 100 : 0;
                const pendingPct = total > 0 ? (item.pending / total) * 100 : 0;
                const absentPct = total > 0 ? (item.absent / total) * 100 : 0;

                const isHovered = hoveredDay?.date === item.date;

                return (
                  <div
                    key={item.date || idx}
                    className="flex-1 min-w-[20px] max-w-[32px] h-full flex flex-col items-center justify-end group cursor-pointer relative"
                    onMouseEnter={() => setHoveredDay(item)}
                    onMouseLeave={() => setHoveredDay(null)}
                  >
                    {/* Stacked bar */}
                    <div
                      className={`w-full rounded-t-sm flex flex-col-reverse overflow-hidden transition-all duration-150 ${
                        isHovered ? "ring-2 ring-primary ring-offset-1 scale-105" : "hover:brightness-110"
                      }`}
                      style={{ height: `${Math.max(6, totalPct)}%` }}
                    >
                      {item.present > 0 && (
                        <div
                          className="bg-emerald-600 w-full"
                          style={{ height: `${presentPct}%` }}
                          title={`${item.present} Present`}
                        />
                      )}
                      {item.pending > 0 && (
                        <div
                          className="bg-amber-500 w-full"
                          style={{ height: `${pendingPct}%` }}
                          title={`${item.pending} Pending`}
                        />
                      )}
                      {item.absent > 0 && (
                        <div
                          className="bg-rose-500 w-full"
                          style={{ height: `${absentPct}%` }}
                          title={`${item.absent} Absent`}
                        />
                      )}
                    </div>

                    {/* Day label */}
                    <span className="absolute -bottom-6 text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                      {idx + 1}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground pt-1">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
              <span>Present</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span>Pending Review</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              <span>Absent</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Distribution */}
      <Card className="shadow-sm flex flex-col justify-between">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-lg">Attendance Distribution</CardTitle>
          <CardDescription>Participant percentage brackets</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3.5 py-2">
            {distributionData.map((bracket) => {
              const pctOfMax = Math.round((bracket.count / maxDistributionCount) * 100);
              const pctOfTotal = totalRegistered > 0 ? Math.round((bracket.count / totalRegistered) * 100) : 0;

              return (
                <div key={bracket.range} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">{bracket.range}</span>
                    <span className="font-mono text-muted-foreground">
                      {bracket.count} participants ({pctOfTotal}%)
                    </span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(bracket.count > 0 ? 5 : 0, pctOfMax)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-muted-foreground border-t pt-3">
            Based on completed workshop attendance records across {totalRegistered} enrolled participants.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

