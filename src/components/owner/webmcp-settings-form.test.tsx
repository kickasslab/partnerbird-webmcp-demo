/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/app/settings/webmcp/actions", () => ({ saveWebMCPSettingsAction: vi.fn() }));

import { defaultWebMCPSettings } from "@/lib/webmcp/types";
import { WebMCPSettingsForm } from "./webmcp-settings-form";

describe("WebMCP settings UI", () => {
  it("shows an off-by-default master switch and every granular consent control", () => {
    render(<WebMCPSettingsForm settings={defaultWebMCPSettings} />);
    expect((screen.getByRole("checkbox", { name: /Enable WebMCP/i }) as HTMLInputElement).checked).toBe(false);
    for (const label of [
      /read my public partnership profile/i,
      /appear in WebMCP partnership searches/i,
      /public profile for partnership matching/i,
      /save potential partners/i,
      /create partnership request drafts/i,
      /submit partnership requests/i,
      /incoming partnership requests/i,
      /Require verified email/i,
      /sufficiently completed PartnerBird profile/i,
    ]) expect(screen.getByRole("checkbox", { name: label })).toBeTruthy();
    expect(screen.getByText(/cannot be switched off/i)).toBeTruthy();
  });
});
