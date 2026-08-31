"use client";

import type { FormEvent, ReactNode } from "react";
import Link from "next/link";

import { Button } from "@rfp-os/ui";

type ShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  labels?: string[];
  active?: number;
  contextTitle?: string;
  contextDescription?: string;
  contextItems?: string[];
  children: ReactNode;
};

export function OnboardingShell({
  eyebrow,
  title,
  description,
  labels,
  active = 0,
  contextTitle = "A focused RFP workspace",
  contextDescription = "Your setup creates the secure organization context TENDYY uses for tenders, knowledge, reviews, and submissions.",
  contextItems = ["Organization-scoped data", "Role-aware workspace access", "Progress saved after every step"],
  children,
}: ShellProps) {
  const total = labels?.length ?? 1;
  const current = Math.min(active + 1, total);

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex h-20 max-w-[1280px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link href="/" className="flex items-center gap-3" aria-label="TENDYY home">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">T</span>
            <span>
              <span className="block text-[15px] font-bold tracking-[0.12em]">TENDYY</span>
              <span className="block text-[9px] font-semibold uppercase tracking-[0.22em] text-blue-600">RFP operating system</span>
            </span>
          </Link>
          {labels ? <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Step {current} of {total}</p> : null}
        </div>
      </header>

      <div className="mx-auto grid max-w-[1280px] lg:min-h-[calc(100vh-5rem)] lg:grid-cols-[minmax(0,620px)_minmax(320px,1fr)]">
        <section className="flex min-h-0 px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-16">
          <div className="w-full max-w-[560px]">
            {labels ? <OnboardingProgress labels={labels} active={active} /> : null}
            <p className={(labels ? "mt-10 " : "") + "text-xs font-bold uppercase tracking-[0.2em] text-blue-700"}>{eyebrow}</p>
            <h1 className="mt-3 max-w-none text-[clamp(2rem,4vw,2.6rem)] font-semibold leading-[1.08] tracking-[-0.035em]">{title}</h1>
            <p className="mt-4 max-w-[480px] text-[15px] leading-6 text-slate-600">{description}</p>
            <div className="mt-9 pb-4">{children}</div>
          </div>
        </section>

        <aside className="relative hidden overflow-hidden border-l border-slate-200 bg-slate-50 lg:flex lg:items-center lg:px-14">
          <div className="absolute inset-x-0 top-0 h-1 bg-blue-600" />
          <div className="relative max-w-sm">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">TENDYY workspace</p>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.025em]">{contextTitle}</h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">{contextDescription}</p>
            <ul className="mt-8 space-y-4">
              {contextItems.map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-700" aria-hidden="true"><CheckIcon /></span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}

export function OnboardingProgress({ labels, active }: { labels: string[]; active: number }) {
  const percent = labels.length <= 1 ? 100 : (Math.min(active, labels.length - 1) / (labels.length - 1)) * 100;
  return (
    <div aria-label={"Onboarding progress: " + (labels[active] ?? labels[0])}>
      <div className="flex items-center justify-between gap-4 text-xs font-semibold">
        <span className="text-slate-950">{labels[active] ?? labels[0]}</span>
        <span className="text-slate-500">{Math.round(percent)}% complete</span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-blue-600 transition-[width] duration-200" style={{ width: percent + "%" }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">{labels[active + 1] ? "Next: " + labels[active + 1] : "Final step"}</p>
    </div>
  );
}

export function OnboardingForm({ children, onSubmit }: { children: ReactNode; onSubmit: () => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }
  return <form className="space-y-6" onSubmit={submit}>{children}</form>;
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-5 sm:grid-cols-2">{children}</div>;
}

export function Field({ id, label, hint, value, required, type = "text", autoComplete, placeholder, onChange }: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  required?: boolean;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const hintId = hint ? id + "-hint" : undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800">{label}{required ? <span className="ml-1 text-red-600">*</span> : null}</label>
      <input id={id} type={type} value={value} required={required} autoComplete={autoComplete} placeholder={placeholder} aria-describedby={hintId} onChange={(event) => onChange(event.target.value)} className="mt-2 h-[50px] w-full rounded-[10px] border border-slate-300 bg-white px-3.5 text-[15px] text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
      {hint ? <p id={hintId} className="mt-1.5 text-xs leading-5 text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function SelectField({ id, label, value, options, required = true, onChange }: { id: string; label: string; value: string; options: string[]; required?: boolean; onChange: (value: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800">{label}{required ? <span className="ml-1 text-red-600">*</span> : null}</label>
      <select id={id} value={value} required={required} onChange={(event) => onChange(event.target.value)} className="mt-2 h-[50px] w-full rounded-[10px] border border-slate-300 bg-white px-3.5 text-[15px] text-slate-950 outline-none transition hover:border-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100">
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => <option key={option} value={option}>{displayValue(option)}</option>)}
      </select>
    </div>
  );
}

export function ChoiceGroup({ legend, value, options, onChange }: { legend: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-slate-800">{legend}</legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <label key={option.value} className={"flex min-h-12 cursor-pointer items-center gap-3 rounded-[10px] border px-3.5 text-sm transition " + (value === option.value ? "border-blue-600 bg-blue-50 text-blue-950" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400")}>
            <input type="radio" name={legend} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="accent-blue-600" />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CheckboxGroup({ legend, values, options, onChange }: { legend: string; values: string[]; options: string[]; onChange: (values: string[]) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-slate-800">{legend}</legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const checked = values.includes(option);
          return (
            <label key={option} className={"flex min-h-12 cursor-pointer items-center gap-3 rounded-[10px] border px-3.5 text-sm transition " + (checked ? "border-blue-600 bg-blue-50 text-blue-950" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400")}>
              <input type="checkbox" checked={checked} onChange={() => onChange(checked ? values.filter((item) => item !== option) : [...values, option])} className="accent-blue-600" />
              {option}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FormFooter({ label = "Continue", busy, secondaryLabel, onSecondary }: { label?: string; busy: boolean; secondaryLabel?: string; onSecondary?: () => void }) {
  return (
    <div className="border-t border-slate-200 pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          {secondaryLabel && onSecondary ? (
            <Button type="button" variant="ghost" size="md" onClick={onSecondary} className="w-full justify-center px-2 sm:w-auto">
              {secondaryLabel}
            </Button>
          ) : null}
        </div>
        <Button type="submit" disabled={busy} size="lg" className="w-full sm:w-auto">
          {busy ? "Saving..." : label}
          {!busy ? <ArrowIcon /> : null}
        </Button>
      </div>
    </div>
  );
}

export function Summary({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="divide-y divide-slate-200 border-y border-slate-200">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 py-4 sm:grid-cols-[150px_1fr]">
          <dt className="text-sm text-slate-500">{label}</dt>
          <dd className="text-sm font-semibold text-slate-950">{value || "Not provided"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ErrorNotice({ error }: { error: string | null }) {
  return error ? <div role="alert" className="mb-6 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">We could not save your changes. {error}</div> : null;
}

export function PrimaryAction({ children, busy, onClick }: { children: ReactNode; busy: boolean; onClick: () => void }) {
  return (
    <Button type="button" disabled={busy} onClick={onClick} size="lg" className="w-full sm:w-auto">
      {busy ? "Saving..." : children}
      {!busy ? <ArrowIcon /> : null}
    </Button>
  );
}

export function displayValue(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function CheckIcon() {
  return <svg viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-current" strokeWidth="2"><path d="m4 8 2.5 2.5L12 5" /></svg>;
}

function ArrowIcon() {
  return <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8"><path d="M3 8h10M9 4l4 4-4 4" /></svg>;
}
