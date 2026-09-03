export function safeInternalReturnTo(value: unknown, fallback = "/"): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 600 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return fallback;
  }

  try {
    const base = new URL("https://partnerbird.invalid");
    const target = new URL(value, base);
    if (target.origin !== base.origin) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
