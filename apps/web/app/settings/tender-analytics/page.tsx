"use client";

import { useState } from "react";
import { AppShell } from "../../../components/app-shell";
import { TendyyErrorState, TendyySkeletonRows } from "../../../components/tendyy-ui";
import { useTenderDiscoveryAnalytics } from "../../../lib/queries";

export default function TenderAnalyticsPage() {
  const [days, setDays] = useState(30);
  const query = useTenderDiscoveryAnalytics(days);
  const data = query.data;
  return (
    <AppShell
      breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Tender Analytics" }]}
    >
      <main className="space-y-4 pb-8">
        <header className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase text-[var(--primary)]">
              Discovery performance
            </p>
            <h1 className="mt-1 text-[26px] font-semibold">Tender Search Analytics</h1>
          </div>
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="filter-input max-w-36"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </header>
        {query.isLoading ? (
          <div className="tendyy-surface p-4">
            <TendyySkeletonRows count={5} />
          </div>
        ) : query.isError ? (
          <TendyyErrorState
            message="Tender analytics could not be loaded."
            onRetry={() => void query.refetch()}
          />
        ) : data ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Searches", data.funnel.searches],
                ["Details viewed", data.funnel.details],
                ["Saved", data.funnel.saves],
                ["Applications", data.funnel.applications],
              ].map(([label, value]) => (
                <article key={label} className="tendyy-surface p-4">
                  <p className="text-xs text-[var(--muted)]">{label}</p>
                  <b className="mt-2 block text-2xl">{value}</b>
                </article>
              ))}
            </section>
            <section className="tendyy-surface p-4">
              <h2 className="text-sm font-semibold">Conversion funnel</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {[
                  ["Search → detail", data.funnel.resultToDetail],
                  ["Detail → save", data.funnel.detailToSave],
                  ["Save → application", data.funnel.saveToApplication],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <span className="text-xs text-[var(--muted)]">{label as string}</span>
                    <b className="block text-lg">{Math.round(Number(value) * 100)}%</b>
                  </div>
                ))}
              </div>
            </section>
            <section className="tendyy-surface p-4">
              <h2 className="text-sm font-semibold">Source coverage</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                {[
                  ["Registered", data.sourceCoverage.registeredSources],
                  ["Enabled", data.sourceCoverage.enabledSources],
                  ["Healthy", data.sourceCoverage.healthySources],
                  ["Stale", data.sourceCoverage.staleSources],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-[var(--surface-muted)] p-3">
                    <span className="text-xs text-[var(--muted)]">{label}</span>
                    <b className="block text-lg">{value}</b>
                  </div>
                ))}
              </div>
            </section>
            <section className="tendyy-surface p-4">
              <h2 className="text-sm font-semibold">Search performance and filters</h2>
              <div className="mt-3 grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  {data.events.map((event) => (
                    <div
                      key={event.eventType}
                      className="flex justify-between border-b py-2 text-xs"
                    >
                      <span>{event.eventType.replaceAll("_", " ").toLowerCase()}</span>
                      <span>
                        {event.count} events · p95{" "}
                        {event.p95DurationMs === null
                          ? "—"
                          : `${Math.round(event.p95DurationMs)}ms`}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap content-start gap-2">
                  {data.topFilters.map((filter) => (
                    <span
                      key={filter.key}
                      className="rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-xs"
                    >
                      {filter.key}: {filter.count}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          </>
        ) : null}
      </main>
    </AppShell>
  );
}
