"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

import styles from "./owner-ui.module.css";

export function SubmitButton({
  children,
  variant = "primary",
  className = "",
  disabled = false,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const variantClass = variant === "secondary" ? styles.secondaryButton : variant === "danger" ? styles.dangerButton : styles.primaryButton;
  return (
    <button type="submit" disabled={pending || disabled} className={`${variantClass} ${className}`.trim()}>
      {pending ? <LoaderCircle className="animate-spin" size={14} /> : null}
      {pending ? "Working…" : children}
    </button>
  );
}
