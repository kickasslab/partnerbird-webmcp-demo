"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

const themeStorageKey = "partnerbird-theme:v1";
const themeChangeEvent = "partnerbird-theme-change";

type Theme = "light" | "dark";

function readTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function readServerTheme(): Theme {
  return "light";
}

function subscribeToTheme(onStoreChange: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key !== themeStorageKey) return;

    const nextTheme: Theme = event.newValue === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    onStoreChange();
  }

  window.addEventListener(themeChangeEvent, onStoreChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(themeChangeEvent, onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    readTheme,
    readServerTheme,
  );

  const isDark = theme === "dark";

  function toggleTheme() {
    const nextTheme: Theme = isDark ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    try {
      window.localStorage.setItem(themeStorageKey, nextTheme);
    } catch {
      // The active page still switches themes if storage is unavailable.
    }
    window.dispatchEvent(new Event(themeChangeEvent));
  }

  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      onClick={toggleTheme}
      className={`grid h-9 w-9 flex-none place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--muted)] transition hover:border-[var(--green-border)] hover:bg-[var(--mint)] hover:text-[var(--green-strong)] ${className}`.trim()}
    >
      <Moon className="theme-toggle__moon" size={17} aria-hidden="true" />
      <Sun className="theme-toggle__sun" size={17} aria-hidden="true" />
    </button>
  );
}
