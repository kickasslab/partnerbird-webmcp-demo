/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const fetchMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.stubGlobal("fetch", fetchMock);

import { WebMCPHandoffPreview } from "./webmcp-handoff-preview";

const baseProps = {
  token: "a".repeat(43),
  target: { username: "darren", displayName: "Darren" },
  handoff: {
    personName: "Avery",
    companyName: "AcmeMonitor",
    companyDescription: "Observability tooling for teams building AI applications.",
    partnershipGoal: "A practical newsletter collaboration.",
    contextSummary: "Both audiences care about dependable and safe AI systems.",
    expiresAt: "2026-09-03T13:00:00.000Z",
  },
};

describe("WebMCP handoff preview", () => {
  afterEach(cleanup);

  beforeEach(() => {
    fetchMock.mockReset();
    refresh.mockReset();
  });

  it("preserves the normal auth route and hides transferred context while anonymous", () => {
    render(<WebMCPHandoffPreview {...baseProps} viewer={{ authenticated: false, verified: false }} />);

    expect(screen.getByTestId("webmcp-handoff-auth-gate")).toBeInTheDocument();
    expect(screen.queryByTestId("webmcp-handoff-context")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in to continue" })).toHaveAttribute(
      "href",
      expect.stringContaining(encodeURIComponent(`/agent/handoff/${baseProps.token}`)),
    );
    expect(screen.getByRole("button", { name: "Evaluate with PartnerBird Agent" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses no AI before explicit activation and activates only through the handoff endpoint", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: { conversationReady: true } }),
    });
    render(<WebMCPHandoffPreview {...baseProps} viewer={{ authenticated: true, verified: true, email: "avery@example.com" }} />);

    expect(screen.getByTestId("webmcp-handoff-context")).toHaveTextContent("A practical newsletter collaboration.");
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Evaluate with PartnerBird Agent" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/agent/handoffs/${baseProps.token}/activate`,
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toMatch(/turns|openrouter|agent\/provider/i);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
