"use client";

import { useEffect, useState } from "react";

import type { WebMCPDebugState } from "./webmcp-registry";

const empty: WebMCPDebugState = { supported: false, enabled: false, route: "", tools: [], errors: [] };

export function WebMCPDebugPanel() {
  const [state, setState] = useState<WebMCPDebugState>(empty);
  useEffect(() => {
    const update = (event?: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as WebMCPDebugState : null;
      setState(detail ?? window.__partnerbirdWebMCPDebug ?? { ...empty, supported: Boolean(document.modelContext), route: window.location.pathname });
    };
    update();
    window.addEventListener("partnerbird:webmcp-debug", update);
    return () => window.removeEventListener("partnerbird:webmcp-debug", update);
  }, []);
  return <div className="grid gap-4"><dl className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-[12px] sm:grid-cols-2"><Item label="document.modelContext" value={state.supported ? "Available" : "Unavailable"} /><Item label="Authenticated tools enabled" value={state.enabled ? "Yes" : "No"} /><Item label="Current route" value={state.route || "—"} /><Item label="Registration errors" value={state.errors.length ? state.errors.join("; ") : "None"} /></dl><div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"><table className="w-full text-left text-[12px]"><thead className="bg-[var(--surface-softer)] text-[10px] uppercase tracking-[.08em] text-[var(--muted)]"><tr><th className="p-3">Tool</th><th className="p-3">Read only</th><th className="p-3">Untrusted output</th></tr></thead><tbody>{state.tools.length ? state.tools.map((tool) => <tr className="border-t border-[var(--border)]" key={tool.name}><td className="p-3 font-semibold">{tool.name}</td><td className="p-3">{String(tool.annotations.readOnlyHint)}</td><td className="p-3">{String(tool.annotations.untrustedContentHint)}</td></tr>) : <tr className="border-t border-[var(--border)]"><td colSpan={3} className="p-4 text-[var(--muted)]">No tools registered in this page state.</td></tr>}</tbody></table></div></div>;
}

function Item({ label, value }: { label: string; value: string }) { return <div><dt className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--muted)]">{label}</dt><dd className="mt-1 break-all">{value}</dd></div>; }
