import type { ReactNode } from "react";

type PageHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
};

export function PageHero({ eyebrow, title, description, actions }: PageHeroProps) {
  return (
    <section className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>
          <h1 className="mt-2 text-[29px] font-semibold tracking-tight text-slate-950 sm:text-[32px]">{title}</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600">{description}</p>
        </div>

        {actions ? <div className="flex flex-wrap gap-2.5">{actions}</div> : null}
      </div>
    </section>
  );
}
