export function AppRouteLoading({ variant = "default" }: { variant?: "default" | "table" }) {
  if (variant === "table") {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <div className="h-7 w-44 animate-pulse rounded bg-slate-100" />
        <div className="h-10 w-full animate-pulse rounded border border-slate-100 bg-slate-50" />
        <div className="overflow-hidden rounded border border-slate-200 bg-white">
          {[1, 2, 3, 4, 5, 6].map((row) => (
            <div key={row} className="flex gap-4 border-b border-slate-100 p-4 last:border-0">
              <div className="h-8 w-8 animate-pulse rounded bg-slate-100" />
              <div className="flex-1 space-y-2"><div className="h-3 w-2/5 animate-pulse rounded bg-slate-100" /><div className="h-2 w-1/4 animate-pulse rounded bg-slate-100" /></div>
              <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="space-y-3"><div className="h-3 w-20 animate-pulse rounded bg-slate-100" /><div className="h-9 w-64 animate-pulse rounded bg-slate-100" /><div className="h-4 w-96 max-w-full animate-pulse rounded bg-slate-100" /></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((card) => <div key={card} className="h-28 animate-pulse rounded border border-slate-200 bg-white" />)}</div>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]"><div className="h-72 animate-pulse rounded border border-slate-200 bg-white" /><div className="h-72 animate-pulse rounded border border-slate-200 bg-white" /></div>
    </div>
  );
}
