import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { analyticsSnapshotQueryOptions } from "@/lib/api/analytics";
import { PageHeader } from "@/components/common/page-header";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "Analytics · Tendyy" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(analyticsSnapshotQueryOptions()),
  pendingComponent: PageSkeleton,
  component: Analytics,
});

const GOOD_DIRECTION: Record<string, "up" | "down" | "neutral"> = {
  k1: "neutral",
  k2: "up",
  k3: "down",
  k4: "up",
  k5: "neutral",
  k6: "down",
  k7: "down",
  k8: "up",
};

const RISK_COLORS: Record<string, string> = {
  Low: "var(--success)",
  Medium: "var(--warning)",
  High: "var(--danger)",
  Critical: "oklch(0.4 0.16 25)",
};

const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  fontSize: 12,
  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
};

const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };

function Analytics() {
  const { data } = useSuspenseQuery(analyticsSnapshotQueryOptions());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Insights"
        title="Analytics"
        description="Pipeline performance, risk, and AI drafting quality over the last 6 months."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.kpis.map((kpi) => {
          const direction = GOOD_DIRECTION[kpi.id] ?? "neutral";
          const positive = kpi.delta > 0;
          const isGood = direction === "neutral" ? null : direction === "up" ? positive : !positive;
          return (
            <div key={kpi.id} className="surface-panel space-y-1.5 p-3.5">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className="num text-xl font-semibold text-foreground">{kpi.value}</p>
              <div className="flex items-center gap-1 text-xs">
                {kpi.delta !== 0 && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 font-medium",
                      isGood === null
                        ? "text-muted-foreground"
                        : isGood
                          ? "text-success"
                          : "text-danger",
                    )}
                  >
                    {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    {Math.abs(kpi.delta)}%
                  </span>
                )}
                <span className="text-muted-foreground">{kpi.hint}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard title="RFP volume" description="Received vs. submitted per month">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.volume} barGap={4}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
              <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
              <Bar
                dataKey="received"
                name="Received"
                fill="var(--chart-1)"
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
              <Bar
                dataKey="submitted"
                name="Submitted"
                fill="var(--chart-5)"
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Win / loss" description="Deals closed per month">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.winLoss} barGap={4}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
              <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
              <Bar
                dataKey="won"
                name="Won"
                fill="var(--success)"
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
              <Bar
                dataKey="lost"
                name="Lost"
                fill="var(--danger)"
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Risk distribution" description="Share of requirements by risk level">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
              <Pie
                data={data.riskDistribution}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={78}
                paddingAngle={2}
                strokeWidth={2}
                stroke="var(--card)"
              >
                {data.riskDistribution.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={RISK_COLORS[entry.name] ?? "var(--muted-foreground)"}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="AI draft acceptance" description="Share of drafts approved without edits">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.acceptance} stackOffset="expand" barSize={22}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                width={28}
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
              <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
              <Bar
                dataKey="accepted"
                name="Accepted as-is"
                stackId="a"
                fill="var(--chart-1)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="edited"
                name="Edited before approval"
                stackId="a"
                fill="oklch(0.75 0.01 250)"
                radius={[0, 0, 4, 4]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Avg. completion time" description="Days from intake to submission">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.completionTime}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="days"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--chart-1)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="SME review load" description="Review hours by team, last 6 months">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.smePerformance} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis
                dataKey="team"
                type="category"
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
              <Bar
                dataKey="hours"
                name="Hours"
                fill="var(--chart-1)"
                radius={[0, 4, 4, 0]}
                maxBarSize={16}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="surface-panel space-y-1 p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
