import { describe, expect, it } from "vitest";

import { buildPartnerBirdMessages } from "./prompt";

describe("buildPartnerBirdMessages", () => {
  it("keeps owner instructions in the system message and visitor data in the user message", () => {
    const { system, user } = buildPartnerBirdMessages({
      profileName: "Avery",
      ownerPublicContext: "PUBLIC OWNER SENTINEL",
      ownerPrivateContext: "PRIVATE OWNER SENTINEL",
      message: "VISITOR MESSAGE SENTINEL",
      websiteContext: "WEBSITE REFERENCE SENTINEL",
      action: "explore_idea",
      actionContext: "SELECTED IDEA SENTINEL",
      history: [
        { role: "visitor", content: "HISTORY VISITOR SENTINEL" },
        { role: "assistant", content: "HISTORY ASSISTANT SENTINEL" },
      ],
    });

    expect(system).toContain("PUBLIC OWNER SENTINEL");
    expect(system).toContain("PRIVATE OWNER SENTINEL");
    expect(system).not.toContain("VISITOR MESSAGE SENTINEL");
    expect(system).not.toContain("WEBSITE REFERENCE SENTINEL");
    expect(system).not.toContain("SELECTED IDEA SENTINEL");
    expect(system).not.toContain("HISTORY VISITOR SENTINEL");

    expect(user).toContain("<requested_action>\nexplore_idea\n</requested_action>");
    expect(user).toContain("VISITOR MESSAGE SENTINEL");
    expect(user).toContain("WEBSITE REFERENCE SENTINEL");
    expect(user).toContain("SELECTED IDEA SENTINEL");
    expect(user).toContain("visitor: HISTORY VISITOR SENTINEL");
    expect(user).toContain("assistant: HISTORY ASSISTANT SENTINEL");
    expect(user).not.toContain("PUBLIC OWNER SENTINEL");
    expect(user).not.toContain("PRIVATE OWNER SENTINEL");
    expect(user).toContain("untrusted visitor-provided reference data");
  });
});
