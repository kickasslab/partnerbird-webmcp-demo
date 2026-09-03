import Link from "next/link";

import { signOut } from "@/app/(auth)/auth-actions";
import { BrandMark } from "@/components/partnerbird/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";

import styles from "./demo-account-shell.module.css";

export function DemoAccountShell({
  children,
  handle,
  isPublished,
}: {
  children: React.ReactNode;
  handle: string;
  isPublished: boolean;
}) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <BrandMark className={styles.mark} />
          <span>PartnerBird WebMCP Demo</span>
        </Link>
        <nav aria-label="Demo account">
          {isPublished ? <Link href={`/@${handle}`}>View profile</Link> : null}
          <ThemeToggle />
          <form action={signOut}>
            <button type="submit">Sign out</button>
          </form>
        </nav>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
