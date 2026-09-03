import type { AgentResult, AgentTurnInput, PartnerBirdProvider } from "./types";

export class MockPartnerBirdProvider implements PartnerBirdProvider {
  readonly name = "mock";
  readonly model = "partnerbird-deterministic-v1";

  async runTurn(input: AgentTurnInput, signal: AbortSignal): Promise<AgentResult> {
    await abortableDelay(180, signal);
    const source = [
      input.message,
      input.websiteContext,
      input.actionContext,
      input.history?.map((item) => item.content).join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (input.action === "explore_idea" && input.actionContext) {
      const selectedTitle =
        input.actionContext.match(/^Title:\s*(.+)$/m)?.[1] ??
        "A focused partnership concept";
      return {
        response: `The clearest first step is a 30-minute working session to agree on the audience promise, outline, and evidence each side can bring. ${input.profileName} should own the editorial framing and audience relevance; your team should bring concrete examples, subject-matter expertise, and a distribution commitment.`,
        fit: {
          label: /observability|reliability|ai safety|monitoring/.test(source)
            ? "Strong Fit"
            : "Worth Exploring",
          rationale:
            "The concept has a balanced division of work and a practical, low-risk way to validate mutual value before either side commits to production.",
          strengths: ["Clear contribution from both sides", "Practical validation step"],
          concerns: ["Agree on an educational audience promise before production."],
        },
        ideas: [
          {
            fitLabel: /observability|reliability|ai safety|monitoring/.test(source)
              ? "Strong Fit"
              : "Worth Exploring",
            type: "Refined partnership brief",
            title: selectedTitle,
            description:
              "Begin with a short scoping session, then create a shared outline and evidence checklist before deciding whether to produce the activation.",
            whyItWorks:
              "Both sides contribute distinct expertise, and the concept is validated before meaningful production time is spent.",
            ownerContribution: `${input.profileName} provides editorial framing, audience context, and final quality judgment.`,
            visitorContribution:
              "The visitor provides subject-matter expertise, concrete examples, and a credible distribution plan.",
            mutualValue:
              "Both audiences receive practical material that remains useful without relying on promotion.",
            activation: "30-minute scoping session followed by a shared one-page brief",
          },
        ],
        nextState: "PROPOSAL_READY",
      };
    }

    if (/casino|gambling|memecoin|pump token|adult content|mass backlink/.test(source)) {
      return {
        response:
          `I don’t see enough audience or values alignment to recommend an introduction right now. The proposal would likely feel promotional rather than genuinely useful to ${input.profileName}’s audience.`,
        fit: {
          label: "Not a Fit",
          rationale:
            `The audience, subject matter, and proposed value do not credibly overlap with ${input.profileName}’s published interests and work.`,
          strengths: [],
          concerns: [
            "Low topical relevance",
            "Limited mutual audience value",
            "High risk of feeling promotional",
          ],
        },
        ideas: [],
        nextState: "NO_FIT",
      };
    }

    if (/acmemonitor|observability|agent reliability|monitoring|ai safety/.test(source)) {
      return {
        response:
          "I found two directions that are genuinely worth exploring. The strongest angle connects production observability with safer, more reliable AI agents. I would avoid a dedicated product-promo article.",
        fit: {
          label: "Strong Fit",
          rationale:
            "Both sides serve technical audiences working on dependable AI systems, with complementary editorial and production expertise.",
          strengths: [
            "Strong topical overlap in AI reliability",
            "Complementary practical and editorial expertise",
            "Clear educational value for both audiences",
          ],
          concerns: ["The execution should remain educational rather than product-led."],
        },
        ideas: [
          {
            fitLabel: "Strong Fit",
            type: "Joint educational article",
            title: "How Observability Helps Teams Catch Risky AI Agent Behavior",
            description:
              "A practical educational piece connecting AI observability with reliability and AI safety.",
            whyItWorks:
              `${input.profileName} contributes AI safety and editorial perspective while the visitor contributes production monitoring expertise.`,
            ownerContribution: `${input.profileName} provides AI safety framing, editorial development, and distribution.`,
            visitorContribution: "Technical expertise, operational examples, and distribution.",
            mutualValue:
              "Both audiences get useful guidance on making production AI systems safer and more dependable.",
            activation: "Article concept, social discussion, and newsletter mention",
          },
          {
            fitLabel: "Good Fit",
            type: "Developer resource exchange",
            title: "A Curated Reliability Toolkit for Teams Shipping AI Agents",
            description:
              "A selective exchange of high-value guides, checklists, and research without reciprocal-link spam.",
            whyItWorks:
              "The resources are useful independently and help both communities discover practical material.",
            ownerContribution: "Curation, editorial context, and audience relevance.",
            visitorContribution: "Tools, monitoring guidance, and implementation examples.",
            mutualValue:
              "Builders receive a concise, credible starting point for safer production agents.",
            activation: "Resource exchange widget and newsletter spotlight",
          },
        ],
        nextState: "IDEA_GENERATION",
      };
    }

    return {
      response:
        "There may be a promising fit, but I need one more useful detail before recommending an introduction: who is the primary audience you want to reach, and what can you contribute beyond promotion?",
      fit: {
        label: "Worth Exploring",
        rationale:
          "The direction could align, but the visitor’s audience and concrete contribution are not clear enough yet.",
        strengths: ["Potential topical overlap"],
        concerns: ["Audience and contribution still need qualification"],
      },
      ideas: [
        {
          fitLabel: "Worth Exploring",
          type: "Expert conversation",
          title: "A Practical Exchange of Lessons for Responsible AI Builders",
          description:
            "A focused conversation concept that can be refined once audience and contribution are clearer.",
          whyItWorks:
            "It creates room for complementary experience without prematurely committing to a campaign.",
          ownerContribution: "Editorial framing and a relevant builder audience.",
          visitorContribution: "A concrete lesson, dataset, example, or practitioner perspective.",
          mutualValue: "Both sides learn whether a deeper collaboration is actually justified.",
          activation: "Short interview or research conversation",
        },
      ],
      nextState: "QUALIFICATION",
    };
  }
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
