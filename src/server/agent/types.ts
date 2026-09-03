import { z } from "zod";

export const fitLabelSchema = z.enum([
  "Strong Fit",
  "Good Fit",
  "Worth Exploring",
  "Weak Fit",
  "Not a Fit",
]);

export const partnershipIdeaSchema = z.object({
  fitLabel: fitLabelSchema,
  type: z.string().min(3).max(120),
  title: z.string().min(8).max(220),
  description: z.string().min(20).max(1200),
  whyItWorks: z.string().min(20).max(1200),
  ownerContribution: z.string().min(5).max(600),
  visitorContribution: z.string().min(5).max(600),
  mutualValue: z.string().min(10).max(800),
  activation: z.string().min(3).max(180),
});

export const agentResultSchema = z
  .object({
    response: z.string().min(10).max(4000),
    fit: z.object({
      label: fitLabelSchema,
      rationale: z.string().min(20).max(1600),
      strengths: z.array(z.string().max(300)).max(5).default([]),
      concerns: z.array(z.string().max(300)).max(5).default([]),
    }),
    ideas: z.array(partnershipIdeaSchema).max(3),
    nextState: z.enum([
      "DISCOVERY",
      "FIT_ASSESSMENT",
      "IDEA_GENERATION",
      "QUALIFICATION",
      "PROPOSAL_READY",
      "NO_FIT",
    ]),
  })
  .superRefine((value, context) => {
    if (value.fit.label === "Not a Fit" && value.ideas.length > 0) {
      context.addIssue({
        code: "custom",
        message: "No-fit results cannot include partnership ideas.",
        path: ["ideas"],
      });
    }
  });

export type AgentResult = z.infer<typeof agentResultSchema>;
export type PartnershipIdea = z.infer<typeof partnershipIdeaSchema>;

export type AgentTurnInput = {
  message: string;
  profileName: string;
  ownerPublicContext: string;
  ownerPrivateContext: string;
  websiteContext?: string;
  action?: string;
  actionContext?: string;
  history?: Array<{ role: "visitor" | "assistant"; content: string }>;
  responseBudget?: { current: number; maximum: number };
};

export interface PartnerBirdProvider {
  readonly name: string;
  readonly model: string;
  runTurn(input: AgentTurnInput, signal: AbortSignal): Promise<AgentResult>;
}

export type PublicAgentEvent =
  | { type: "conversation"; conversationId: string }
  | {
      type: "status";
      stage:
        | "understand_business"
        | "compare_audiences"
        | "find_angles"
        | "assess_fit";
      state: "active" | "done";
    }
  | { type: "assistant_delta"; delta: string }
  | {
      type: "fit";
      fit: AgentResult["fit"];
    }
  | {
      type: "ideas";
      ideas: Array<PartnershipIdea & { id: string }>;
    }
  | { type: "done"; state: AgentResult["nextState"] }
  | { type: "error"; code: string; message: string };
