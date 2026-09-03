"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { selectWebMCPTools, webmcpToolCatalog } from "@/lib/webmcp/tool-catalog";
import { isHighRiskWebMCPTool, type HighRiskWebMCPToolName } from "@/lib/webmcp/types";

type ContextResponse = {
  authenticated: boolean;
  authenticatedWebMCPEnabled: boolean;
  publicProfileAvailable: boolean;
  targetMatchingEnabled: boolean;
  permissions: { allowMatching: boolean; allowSavePartners: boolean; allowCreateDrafts: boolean } | null;
};

export type WebMCPDebugState = {
  supported: boolean;
  enabled: boolean;
  route: string;
  tools: Array<{ name: string; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean } }>;
  errors: string[];
};

type RequestPreview = {
  requestId: string;
  counterparty: { username: string; displayName: string };
  title: string;
  body: string;
};

type PendingConfirmation = {
  tool: HighRiskWebMCPToolName;
  input: Record<string, unknown>;
  preview: RequestPreview | null;
};

declare global {
  interface Window {
    __partnerbirdWebMCPDebug?: WebMCPDebugState;
  }
}

export function WebMCPRegistry({
  publicUsername,
  initialPublicProfileAvailable = false,
}: {
  publicUsername?: string;
  initialPublicProfileAvailable?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [settingsRevision, setSettingsRevision] = useState(0);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const confirmationResolver = useRef<((approved: boolean) => void) | null>(null);

  const settleConfirmation = useCallback((approved: boolean) => {
    confirmationResolver.current?.(approved);
    confirmationResolver.current = null;
    setPendingConfirmation(null);
    setConfirmationError(null);
    setIsApproving(false);
  }, []);

  const requestHumanConfirmation = useCallback(async (
    tool: HighRiskWebMCPToolName,
    input: Record<string, unknown>,
    signal: AbortSignal,
  ) => {
    if (confirmationResolver.current || signal.aborted) return false;
    const preview = await loadRequestPreview(input.requestId, signal);
    return new Promise<boolean>((resolve) => {
      const abort = () => settleConfirmation(false);
      confirmationResolver.current = (approved) => {
        signal.removeEventListener("abort", abort);
        resolve(approved);
      };
      signal.addEventListener("abort", abort, { once: true });
      setPendingConfirmation({ tool, input, preview });
      setConfirmationError(null);
    });
  }, [settleConfirmation]);

  const approveConfirmation = useCallback(async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!pendingConfirmation || !event.isTrusted || (navigator.userActivation && !navigator.userActivation.isActive)) {
      setConfirmationError("Use the visible PartnerBird confirmation button to approve this action.");
      return;
    }
    setIsApproving(true);
    setConfirmationError(null);
    try {
      const response = await fetch("/api/webmcp/confirmations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: pendingConfirmation.tool, input: pendingConfirmation.input }),
      });
      const result = await response.json() as { ok?: boolean; error?: { message?: string } };
      if (!response.ok || !result.ok) {
        setConfirmationError(result.error?.message ?? "PartnerBird could not confirm this action.");
        setIsApproving(false);
        return;
      }
      settleConfirmation(true);
    } catch {
      setConfirmationError("PartnerBird could not confirm this action.");
      setIsApproving(false);
    }
  }, [pendingConfirmation, settleConfirmation]);

  useEffect(() => {
    const refreshRegistration = () => setSettingsRevision((value) => value + 1);
    window.addEventListener("partnerbird:webmcp-settings-changed", refreshRegistration);
    return () => window.removeEventListener("partnerbird:webmcp-settings-changed", refreshRegistration);
  }, []);

  useEffect(() => {
    const errors: string[] = [];
    const controller = new AbortController();
    const registeredNames = new Set<string>();
    const registeredDefinitions: Array<(typeof webmcpToolCatalog)[keyof typeof webmcpToolCatalog]> = [];
    publishDebug({ supported: Boolean(document.modelContext), enabled: false, route: pathname, tools: [], errors });

    void (async () => {
      try {
        if (!document.modelContext) webmcpLog("Browser API not detected yet; waiting for Chrome initialization");
        const modelContext = await waitForModelContext(controller.signal);
        if (!modelContext) {
          webmcpWarn("Registration skipped: document.modelContext is unavailable");
          publishDebug({ supported: false, enabled: false, route: pathname, tools: [], errors: ["Browser API unavailable."] });
          return;
        }
        webmcpLog("Browser API detected");

        const registerNames = async (names: ReturnType<typeof selectWebMCPTools>) => {
          for (const name of names) {
            if (controller.signal.aborted || registeredNames.has(name)) continue;
            const definition = webmcpToolCatalog[name];
            webmcpLog(`Registering ${definition.name}`);
            await modelContext.registerTool({
              name: definition.name,
              title: definition.title,
              description: definition.description,
              inputSchema: definition.inputSchema,
              annotations: definition.annotations,
              execute: async (input, { signal }) => {
                if (isHighRiskWebMCPTool(definition.name)) {
                  const approved = await requestHumanConfirmation(
                    definition.name,
                    input as Record<string, unknown>,
                    signal,
                  );
                  if (!approved) {
                    return {
                      ok: false,
                      error: {
                        code: "CONFIRMATION_REQUIRED",
                        message: "The user did not approve this action in PartnerBird.",
                      },
                    };
                  }
                }
                const toolResponse = await fetch(`/api/webmcp/tools/${definition.name}`, {
                  method: "POST",
                  credentials: "same-origin",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(input),
                  signal,
                });
                const result = await toolResponse.json();
                if (toolResponse.ok && definition.risk !== "low") {
                  window.dispatchEvent(new CustomEvent("partnerbird:webmcp-state-changed", { detail: { tool: definition.name } }));
                  router.refresh();
                }
                return result;
              },
            }, { signal: controller.signal });
            registeredNames.add(name);
            registeredDefinitions.push(definition);
          }
        };

        if (publicUsername) webmcpLog(`Loading profile policy for @${publicUsername}`);
        if (publicUsername && initialPublicProfileAvailable) {
          await registerNames(selectWebMCPTools({
            pathname,
            publicUsername,
            publicProfileAvailable: true,
            authenticatedWebMCPEnabled: false,
          }));
        }

        const query = publicUsername ? `?targetUsername=${encodeURIComponent(publicUsername)}` : "";
        const response = await fetch(`/api/webmcp/context${query}`, {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("WebMCP context is unavailable.");
        const context = await response.json() as ContextResponse;
        if (controller.signal.aborted) return;

        const selectedNames = selectWebMCPTools({
          pathname,
          publicUsername,
          publicProfileAvailable: context.publicProfileAvailable,
          authenticatedWebMCPEnabled: context.authenticatedWebMCPEnabled,
          targetMatchingEnabled: context.targetMatchingEnabled,
          permissions: context.permissions,
        });
        await registerNames(selectedNames);

        if (!registeredDefinitions.length) {
          const reason = publicUsername && !context.publicProfileAvailable
            ? `Registration skipped: @${publicUsername} is not opted into public WebMCP reads`
            : "Registration skipped: no tools are permitted for this route and session";
          webmcpWarn(reason);
        } else {
          await verifyRegisteredTools(modelContext, registeredNames, controller.signal);
          webmcpLog("Registration successful");
        }
        publishDebug({
          supported: true,
          enabled: registeredDefinitions.length > 0,
          route: pathname,
          tools: registeredDefinitions.map(({ name, annotations }) => ({ name, annotations })),
          errors,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Tool registration failed.";
        errors.push(message);
        publishDebug({
          supported: Boolean(document.modelContext),
          enabled: registeredDefinitions.length > 0,
          route: pathname,
          tools: registeredDefinitions.map(({ name, annotations }) => ({ name, annotations })),
          errors,
        });
        webmcpWarn(`Registration failed: ${message}`, error);
      }
    })();

    return () => {
      webmcpLog(`Cleaning up registration for ${pathname}`);
      controller.abort();
    };
  }, [initialPublicProfileAvailable, pathname, publicUsername, requestHumanConfirmation, router, settingsRevision]);

  if (!pendingConfirmation) return null;
  const wording = confirmationWording(pendingConfirmation);
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/60 p-4" role="presentation">
      <section
        aria-describedby="webmcp-confirmation-description"
        aria-labelledby="webmcp-confirmation-title"
        aria-modal="true"
        className="w-full max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-[var(--ink)] shadow-2xl"
        role="alertdialog"
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--green-strong)]">Human confirmation required</p>
        <h2 className="mt-2 text-lg font-bold" id="webmcp-confirmation-title">{wording.title}</h2>
        <p className="mt-2 text-[13px] leading-5 text-[var(--muted)]" id="webmcp-confirmation-description">{wording.description}</p>
        {pendingConfirmation.preview ? (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-softer)] p-4">
            <p className="text-[12px] font-bold">{pendingConfirmation.preview.title}</p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">{wording.counterpartyLabel} {pendingConfirmation.preview.counterparty.displayName} (@{pendingConfirmation.preview.counterparty.username})</p>
            <p className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap text-[12px] leading-5">{pendingConfirmation.preview.body}</p>
          </div>
        ) : null}
        <p className="mt-4 text-[11px] leading-5 text-[var(--muted)]">Approval is valid for this exact action for two minutes and is consumed once. The agent cannot supply or read the approval credential.</p>
        {confirmationError ? <p className="mt-3 text-[11px] text-[var(--danger-ink)]" role="alert">{confirmationError}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-lg border border-[var(--border)] px-4 py-2 text-[12px] font-bold" disabled={isApproving} onClick={() => settleConfirmation(false)} type="button">Cancel</button>
          <button className="rounded-lg bg-[var(--green)] px-4 py-2 text-[12px] font-bold text-white disabled:opacity-60" disabled={isApproving} onClick={approveConfirmation} type="button">{isApproving ? "Approving…" : wording.button}</button>
        </div>
      </section>
    </div>
  );
}

function publishDebug(state: WebMCPDebugState) {
  window.__partnerbirdWebMCPDebug = state;
  window.dispatchEvent(new CustomEvent("partnerbird:webmcp-debug", { detail: state }));
}

async function waitForModelContext(signal: AbortSignal) {
  const deadline = Date.now() + 10_000;
  while (!signal.aborted && Date.now() < deadline) {
    if (document.modelContext) return document.modelContext;
    await delay(100, signal);
  }
  return document.modelContext;
}

async function verifyRegisteredTools(
  modelContext: NonNullable<Document["modelContext"]>,
  expectedNames: Set<string>,
  signal: AbortSignal,
) {
  await delay(100, signal);
  const actualNames = new Set((await modelContext.getTools()).map((tool) => tool.name));
  const missing = [...expectedNames].filter((name) => !actualNames.has(name));
  if (missing.length) {
    throw new Error(`Chrome did not retain registered tools: ${missing.join(", ")}`);
  }
}

function delay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Registration aborted.", "AbortError"));
    };
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function webmcpLog(message: string) {
  console.info(`[WebMCP] ${message}`);
}

function webmcpWarn(message: string, error?: unknown) {
  console.warn(`[WebMCP] ${message}`, ...(error === undefined ? [] : [error]));
}

async function loadRequestPreview(requestId: unknown, signal: AbortSignal): Promise<RequestPreview | null> {
  if (typeof requestId !== "string") return null;
  try {
    const response = await fetch("/api/webmcp/tools/get_request", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId }),
      signal,
    });
    const result = await response.json() as { ok?: boolean; data?: RequestPreview };
    return response.ok && result.ok && result.data ? result.data : null;
  } catch {
    return null;
  }
}

function confirmationWording(pending: PendingConfirmation) {
  if (pending.tool === "submit_request") {
    return {
      title: "Send this partnership request?",
      description: "This will contact the recipient. Review the exact recipient and message before approving.",
      counterpartyLabel: "Recipient:",
      button: "Confirm and send",
    };
  }
  if (pending.tool === "withdraw_request") {
    return {
      title: "Withdraw this partnership request?",
      description: "This changes the request for both parties and cannot be undone by the agent.",
      counterpartyLabel: "Recipient:",
      button: "Confirm withdrawal",
    };
  }
  const response = pending.input.response === "accept" ? "accept" : "decline";
  return {
    title: `${response === "accept" ? "Accept" : "Decline"} this partnership request?`,
    description: `This will ${response} the request and update its status for both parties.`,
    counterpartyLabel: "Sender:",
    button: `Confirm ${response}`,
  };
}
