import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/partnerbird/brand-mark";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: { absolute: "PartnerBird WebMCP Demo" },
  description:
    "See how external AI agents can safely discover partnership context and hand an opportunity to PartnerBird Agent.",
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <div className={styles.brand}>
          <BrandMark className={styles.mark} />
          <span>PartnerBird</span>
        </div>
        <p className={styles.eyebrow}>WebMCP Challenge Demo</p>
        <h1>Partnership discovery, with a secure agent handoff.</h1>
        <p className={styles.intro}>
          See how external AI agents can understand a public partnership profile,
          suggest a useful fit, and securely hand the opportunity to PartnerBird
          Agent for verified evaluation and human approval.
        </p>
        <Link className={styles.cta} href="/@darren">
          Open Darren&apos;s demo profile
          <span aria-hidden="true">→</span>
        </Link>
        <p className={styles.note}>
          WebMCP reads and handoff preparation use zero PartnerBird AI credits.
        </p>
      </section>
    </main>
  );
}
