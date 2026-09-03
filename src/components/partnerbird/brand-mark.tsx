import type { HTMLAttributes } from "react";

import styles from "./brand-mark.module.css";

type BrandMarkProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  framed?: boolean;
};

export function BrandMark({
  framed = false,
  className,
  ...props
}: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      data-brand-mark=""
      className={`${styles.mark} ${framed ? styles.framed : ""} ${className ?? ""}`.trim()}
      {...props}
    >
      <span className={styles.glyph} />
    </span>
  );
}
