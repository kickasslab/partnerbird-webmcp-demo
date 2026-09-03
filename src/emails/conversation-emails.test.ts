import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConversationResumeEmail } from "@/emails/conversation-resume-email";
import { OwnerReplyEmail } from "@/emails/owner-reply-email";

describe("conversation emails", () => {
  it("renders a private continuation call to action", () => {
    const html = renderToStaticMarkup(
      createElement(ConversationResumeEmail, {
        visitorName: "Taylor",
        profileName: "Darren",
        resumeUrl: "https://partnerbird.example/conversation/resume?token=private-token",
      }),
    );

    expect(html).toContain("Continue conversation");
    expect(html).toContain("private-token");
    expect(html).toContain("expires in 30 days");
  });

  it("escapes owner reply content in notification markup", () => {
    const html = renderToStaticMarkup(
      createElement(OwnerReplyEmail, {
        visitorName: "Taylor",
        profileName: "Darren",
        messagePreview: "Hello <script>alert('x')</script>",
        resumeUrl: "https://partnerbird.example/conversation/resume?token=private-token",
      }),
    );

    expect(html).toContain("Darren replied");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });
});
