import { describe, expect, it } from "vitest";

import { selectWebMCPTools, webmcpToolCatalog } from "./tool-catalog";

describe("WebMCP tool catalog", () => {
  it("exposes no authenticated tools when the master control is disabled", () => {
    expect(selectWebMCPTools({
      pathname: "/app",
      authenticatedWebMCPEnabled: false,
      publicProfileAvailable: false,
    })).toEqual([]);
  });

  it("keeps public pages limited and only adds permitted authenticated actions", () => {
    expect(selectWebMCPTools({
      pathname: "/@darren",
      publicUsername: "darren",
      publicProfileAvailable: true,
      authenticatedWebMCPEnabled: true,
      targetMatchingEnabled: true,
      permissions: { allowMatching: true, allowSavePartners: true, allowCreateDrafts: false },
    })).toEqual([
      "get_profile",
      "get_partnership_interests",
      "save_partner",
      "prepare_agent_handoff",
    ]);
  });

  it("never registers the handoff tool for an anonymous public-profile visitor", () => {
    expect(selectWebMCPTools({
      pathname: "/@darren",
      publicUsername: "darren",
      publicProfileAvailable: true,
      targetMatchingEnabled: true,
      authenticatedWebMCPEnabled: false,
    })).toEqual(["get_profile", "get_partnership_interests"]);
  });

  it("exposes the complete authenticated workflow on the focused WebMCP setup page", () => {
    expect(selectWebMCPTools({
      pathname: "/app/settings/webmcp",
      authenticatedWebMCPEnabled: true,
      publicProfileAvailable: false,
    })).toEqual([
      "get_my_profile",
      "get_my_preferences",
      "search_partners",
      "save_partner",
      "list_saved_partners",
      "create_request_draft",
      "update_request_draft",
      "list_my_requests",
      "get_request",
      "submit_request",
      "withdraw_request",
      "respond_to_request",
    ]);
  });

  it("marks every user-content tool as untrusted and read-only hints accurately", () => {
    for (const definition of Object.values(webmcpToolCatalog)) {
      expect(definition.annotations.untrustedContentHint).toBe(true);
      expect(definition.annotations.readOnlyHint).toBe(definition.risk === "low");
    }
    expect(webmcpToolCatalog.submit_request.risk).toBe("high");
    expect(webmcpToolCatalog.create_request_draft.risk).toBe("medium");
    expect(JSON.stringify(webmcpToolCatalog.submit_request.inputSchema)).not.toContain("confirmed");
  });

  it("contains no bulk outreach or database export tool", () => {
    expect(Object.keys(webmcpToolCatalog).join(" ")).not.toMatch(/bulk|all_users|export|mass|broadcast/);
  });
});
