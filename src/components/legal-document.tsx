import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/partnerbird/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";

export function LegalDocument({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-[var(--canvas)] px-5 py-8 text-[var(--ink)] sm:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <Link href="/@darren" className="inline-flex items-center gap-2 text-sm font-bold">
            <BrandMark className="h-7 w-7" />
            PartnerBird
          </Link>
          <ThemeToggle />
        </div>
        <article className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:p-10">
          <span className="text-xs font-bold uppercase tracking-[.14em] text-[var(--green-strong)]">
            {eyebrow}
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-[-.035em] sm:text-4xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)]">{intro}</p>
          <div className="mt-8 space-y-7 text-sm leading-7 text-[var(--muted)] [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-[var(--ink)] [&_a]:font-semibold [&_a]:text-[var(--green-strong)] [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
            {children}
          </div>
        </article>
        <nav className="mt-6 flex flex-wrap gap-5 px-2 text-xs text-[var(--muted)]">
          <Link href="/">Demo home</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </div>
    </main>
  );
}
