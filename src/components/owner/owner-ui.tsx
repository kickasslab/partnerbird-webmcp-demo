import { ArrowRight, LucideIcon } from "lucide-react";
import Link from "next/link";

import styles from "./owner-ui.module.css";

export { styles as ownerStyles };

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        {description ? <span>{description}</span> : null}
      </div>
      {actions ? <div className={styles.pageActions}>{actions}</div> : null}
    </header>
  );
}

export function SectionHeading({
  title,
  description,
  href,
  hrefLabel = "View all",
}: {
  title: string;
  description?: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className={styles.sectionHeading}>
      <div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>
      {href ? <Link href={href}>{hrefLabel}<ArrowRight size={14} /></Link> : null}
    </div>
  );
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "green",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  detail: string;
  tone?: "green" | "amber" | "blue" | "neutral";
}) {
  return (
    <article className={styles.metricCard} data-tone={tone}>
      <div className={styles.metricTop}><span><Icon size={18} /></span><small>{label}</small></div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.emptyState}>
      <span><Icon size={22} /></span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase().replaceAll("_", " ");
  const tone =
    ["strong fit", "qualified", "active", "available", "published", "approved", "accepted", "success", "complete", "open"].includes(normalized)
      ? "success"
      : ["good fit", "worth exploring", "kiv", "beta", "selective", "draft", "planned"].includes(normalized)
        ? "warning"
        : ["declined", "not a fit", "weak fit", "failed", "unavailable", "closed"].includes(normalized)
          ? "danger"
          : "neutral";
  return <span className={styles.statusBadge} data-tone={tone}><i />{normalized}</span>;
}

export function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className={styles.primaryButton}>{children}</Link>;
}

export function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className={styles.secondaryButton}>{children}</Link>;
}
