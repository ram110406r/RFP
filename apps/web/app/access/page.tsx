export default function AccessPage() {
  return (
    <div className="mx-auto flex min-h-[65vh] max-w-lg items-center justify-center px-4">
      <section className="w-full rounded-[12px] border border-amber-200 bg-amber-50 p-6 shadow-[0_16px_45px_rgba(15,23,42,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-800">Workspace access required</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Ask an administrator for a workspace</h1>
        <p className="mt-3 text-sm leading-6 text-slate-700">Your account belongs to the organization, but it is not assigned to an active workspace. An owner or administrator must grant workspace access before you can enter TENDYY.</p>
      </section>
    </div>
  );
}
