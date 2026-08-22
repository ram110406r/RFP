import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FileUp, Timer, Users } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
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
import { MetricTile } from "@/components/common/metric-tile";
import { ChartCard, chartTheme } from "@/components/common/chart-card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "Analytics · Tendyy" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(analyticsSnapshotQueryOptions()),
  pendingComponent: PageSkeleton,
  component: Analytics,
});

/** Which direction is good for each KPI — up is good for win rate, bad for cycle time. */
const GOOD_DIRECTION: Record<string, "up" | "down" | "neutral"> = {
  k1: "neutral",
  k2: "up",
  k3: "down",
  k4: "up",
  k5: "neutral",
  k6: "down",
  k7: "up",
  k8: "up",
};

/** KPIs whose alert state should colour the number rather than sit in the hint. */
const KPI_TONE: Record<string, "danger" | "warning"> = { k6: "danger" };

const RISK_COLORS: Record<string, string> = {
  Low: "var(--risk-low-fg)",
  Medium: "var(--risk-medium-fg)",
  High: "var(--risk-high-fg)",
  Critical: "var(--risk-critical-bg)",
};

/**
 * Splits "68%" or "12 days" into number and unit so MetricTile can set them
 * at different sizes. The API returns pre-formatted display strings, and
 * "No data yet" has to survive the split untouched.
 */
function splitValue(value: string): { value: string; unit: string | undefined } {
  const match = /^(-?[\d.,]+)\s*(.*)$/.exec(value);
  if (!match?.[1]) return { value, unit: undefined };
  return { value: match[1], unit: match[2] || undefined };
}

function Analytics() {
  const { data } = useSuspenseQuery(analyticsSnapshotQueryOptions());

  const riskTotal = data.riskDistribution.reduce((sum, r) => sum + r.value, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Insights"
        title="Analytics"
        description="Pipeline performance, risk, and AI drafting quality over the last 6 months."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.kpis.map((kpi) => {
          const { value, unit } = splitValue(kpi.value);
          return (
            <MetricTile
              key={kpi.id}
              label={kpi.label}
              value={value}
              unit={unit}
              hint={kpi.hint}
              delta={kpi.delta}
              direction={GOOD_DIRECTION[kpi.id] ?? "neutral"}
              tone={KPI_TONE[kpi.id] ?? "neutral"}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="RFP volume"
          description="Received vs. submitted per month"
          state={data.volume.length === 0 ? "empty" : "ready"}
          series={[
            { label: "Received", color: "var(--series-1)" },
            { label: "Submitted", color: "var(--series-3)" },
          ]}
          empty={{
            icon: <FileUp className="h-4 w-4" />,
            title: "No RFPs yet",
            description: "Volume starts charting once your first RFP is created.",
            action: (
              <Button asChild variant="link" size="sm" className="h-auto p-0 text-meta">
                <Link to="/rfps/new">Create an RFP</Link>
              </Button>
            ),
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.volume} barGap={4} margin={{ top: 4, right: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={chartTheme.grid} />
              <XAxis dataKey="month" tick={chartTheme.axisTick} axisLine={false} tickLine={false} />
              <YAxis
                tick={chartTheme.axisTick}
                axisLine={false}
                tickLine={false}
                width={32}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={chartTheme.tooltip}
                itemStyle={chartTheme.tooltipItem}
                labelStyle={chartTheme.tooltipLabel}
                cursor={chartTheme.cursor}
              />
              <Bar
                isAnimationActive={false}
                dataKey="received"
                name="Received"
                fill="var(--series-1)"
                radius={[3, 3, 0, 0]}
                maxBarSize={22}
              />
              <Bar
                isAnimationActive={false}
                dataKey="submitted"
                name="Submitted"
                fill="var(--series-3)"
                radius={[3, 3, 0, 0]}
                maxBarSize={22}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Win / loss"
          description="Deals closed per month"
          state={data.winLoss.length === 0 ? "empty" : "ready"}
          series={[
            { label: "Won", color: "var(--risk-low-fg)" },
            { label: "Lost", color: "var(--risk-high-fg)" },
          ]}
          empty={{
            title: "No closed deals yet",
            description:
              "Win and loss appear here once an outcome is recorded against a submitted RFP.",
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.winLoss} barGap={4} margin={{ top: 4, right: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={chartTheme.grid} />
              <XAxis dataKey="month" tick={chartTheme.axisTick} axisLine={false} tickLine={false} />
              <YAxis
                tick={chartTheme.axisTick}
                axisLine={false}
                tickLine={false}
                width={32}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={chartTheme.tooltip}
                itemStyle={chartTheme.tooltipItem}
                labelStyle={chartTheme.tooltipLabel}
                cursor={chartTheme.cursor}
              />
              <Bar
                isAnimationActive={false}
                dataKey="won"
                name="Won"
                fill="var(--risk-low-fg)"
                radius={[3, 3, 0, 0]}
                maxBarSize={22}
              />
              <Bar
                isAnimationActive={false}
                dataKey="lost"
                name="Lost"
                fill="var(--risk-high-fg)"
                radius={[3, 3, 0, 0]}
                maxBarSize={22}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Risk distribution"
          description="Share of requirements by risk level"
          state={riskTotal === 0 ? "empty" : "ready"}
          series={data.riskDistribution.map((r) => ({
            label: r.name,
            color: RISK_COLORS[r.name] ?? "var(--series-muted)",
          }))}
          empty={{
            icon: <FileUp className="h-4 w-4" />,
            title: "No requirements yet",
            description: "Upload an RFP document and requirements are extracted automatically.",
            action: (
              <Button asChild variant="link" size="sm" className="h-auto p-0 text-meta">
                <Link to="/rfps/new">Upload a document</Link>
              </Button>
            ),
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                contentStyle={chartTheme.tooltip}
                itemStyle={chartTheme.tooltipItem}
                labelStyle={chartTheme.tooltipLabel}
                formatter={(value: number, name: string) => [
                  `${value} (${Math.round((value / riskTotal) * 100)}%)`,
                  name,
                ]}
              />
              <Pie
                isAnimationActive={false}
                data={data.riskDistribution}
                dataKey="value"
                nameKey="name"
                innerRadius={54}
                outerRadius={80}
                paddingAngle={2}
                strokeWidth={2}
                stroke="var(--card)"
                /*
                 * The donut previously had no value labels at all — you could
                 * see four arcs and learn nothing. Outside labels give each
                 * slice its count and share, and the hole carries the total,
                 * which is the number people actually came for.
                 */
                label={({ name, value }: { name: string; value: number }) =>
                  value > 0 ? `${name} ${Math.round((value / riskTotal) * 100)}%` : ""
                }
                labelLine={false}
                fontSize={11}
              >
                {data.riskDistribution.map((entry) => (
                  <Cell key={entry.name} fill={RISK_COLORS[entry.name] ?? "var(--series-muted)"} />
                ))}
                <Label
                  position="center"
                  content={() => (
                    <>
                      <text
                        x="50%"
                        y="47%"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="num"
                        fill="var(--foreground)"
                        fontSize={22}
                        fontWeight={700}
                      >
                        {riskTotal}
                      </text>
                      <text
                        x="50%"
                        y="60%"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="var(--muted-foreground)"
                        fontSize={10}
                        letterSpacing="0.08em"
                      >
                        REQUIREMENTS
                      </text>
                    </>
                  )}
                />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="AI draft acceptance"
          description="Share of drafts approved without edits"
          state={data.acceptance.length === 0 ? "empty" : "ready"}
          series={[
            { label: "Accepted as-is", color: "var(--series-1)" },
            { label: "Edited before approval", color: "var(--series-muted)" },
          ]}
          empty={{
            title: "No drafts yet",
            description: "Acceptance is measured once AI answers have been through review.",
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.acceptance}
              stackOffset="expand"
              barSize={22}
              margin={{ top: 4, right: 4, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke={chartTheme.grid} />
              <XAxis dataKey="month" tick={chartTheme.axisTick} axisLine={false} tickLine={false} />
              {/*
               * width was 28, which clipped the "100%" tick to a stray "00%",
               * and the missing explicit domain is why the top bar read as cut
               * off. Both are pinned now.
               */}
              <YAxis
                tick={chartTheme.axisTick}
                axisLine={false}
                tickLine={false}
                width={40}
                domain={[0, 1]}
                ticks={[0, 0.25, 0.5, 0.75, 1]}
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              />
              <Tooltip
                contentStyle={chartTheme.tooltip}
                itemStyle={chartTheme.tooltipItem}
                labelStyle={chartTheme.tooltipLabel}
                cursor={chartTheme.cursor}
                formatter={(value: number, name: string) => [`${value}`, name]}
              />
              <Bar
                isAnimationActive={false}
                dataKey="accepted"
                name="Accepted as-is"
                stackId="a"
                fill="var(--series-1)"
                radius={[3, 3, 0, 0]}
              />
              <Bar
                isAnimationActive={false}
                dataKey="edited"
                name="Edited before approval"
                stackId="a"
                fill="var(--series-muted)"
                radius={[0, 0, 3, 3]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Avg. completion time"
          description="Days from intake to submission"
          state={data.completionTime.length === 0 ? "untracked" : "ready"}
          empty={{
            icon: <Timer className="h-4 w-4" />,
            title: "Not measured yet",
            description:
              "Completion time is recorded from an RFP's creation to its first submission. No RFP has been submitted through Tendyy yet.",
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.completionTime} margin={{ top: 4, right: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={chartTheme.grid} />
              <XAxis dataKey="month" tick={chartTheme.axisTick} axisLine={false} tickLine={false} />
              <YAxis
                tick={chartTheme.axisTick}
                axisLine={false}
                tickLine={false}
                width={32}
                allowDecimals={false}
                tickFormatter={(v: number) => `${v}d`}
              />
              <Tooltip
                contentStyle={chartTheme.tooltip}
                itemStyle={chartTheme.tooltipItem}
                labelStyle={chartTheme.tooltipLabel}
                formatter={(value: number) => [`${value} days`, "Avg. completion"]}
              />
              <Line
                isAnimationActive={false}
                type="monotone"
                dataKey="days"
                stroke="var(--series-1)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--series-1)", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="SME review load"
          description="Reviews completed by team"
          state={data.smePerformance.every((t) => t.reviews === 0) ? "empty" : "ready"}
          empty={{
            icon: <Users className="h-4 w-4" />,
            title: "No reviews completed yet",
            description: "Load appears here once SMEs start actioning assigned requirements.",
            action: (
              <Button asChild variant="link" size="sm" className="h-auto p-0 text-meta">
                <Link to="/reviews">Open the review queue</Link>
              </Button>
            ),
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            {/*
             * Plots `reviews`, not `hours`. The API has always returned a real
             * review count alongside a hard-coded hours: 0, and this chart was
             * reading the field that is never populated — which is the whole
             * reason it rendered as an empty box.
             */}
            <BarChart
              data={data.smePerformance}
              layout="vertical"
              margin={{ left: 4, right: 12, top: 4, bottom: 0 }}
            >
              <CartesianGrid horizontal={false} stroke={chartTheme.grid} />
              <XAxis
                type="number"
                tick={chartTheme.axisTick}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                dataKey="team"
                type="category"
                tick={chartTheme.axisTick}
                axisLine={false}
                tickLine={false}
                width={84}
              />
              <Tooltip
                contentStyle={chartTheme.tooltip}
                itemStyle={chartTheme.tooltipItem}
                labelStyle={chartTheme.tooltipLabel}
                cursor={chartTheme.cursor}
                formatter={(value: number) => [`${value}`, "Reviews"]}
              />
              <Bar
                isAnimationActive={false}
                dataKey="reviews"
                name="Reviews"
                fill="var(--series-1)"
                radius={[0, 3, 3, 0]}
                maxBarSize={16}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
