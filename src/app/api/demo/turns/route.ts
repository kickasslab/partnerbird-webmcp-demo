import { randomUUID } from "node:crypto";

import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { containsPrivateContextLeak, getAgentContext } from "@/server/agent/context";
import { reportAgentTurnFailure } from "@/server/agent/failure-reporting";
import { getPartnerBirdProvider } from "@/server/agent/provider";
import type { PublicAgentEvent } from "@/server/agent/types";
import { defaultAgentSettings } from "@/lib/agent-defaults";
import { demoProfile } from "@/lib/profile-data";
import { db, neonSql } from "@/server/db/client";
import {
  conversationContacts,
  conversationLeads,
  conversations,
  profiles,
} from "@/server/db/schema";
import { recordIsolatedUsage } from "@/server/billing/usage";
import { consumeRateLimit } from "@/server/security/rate-limit";
import {
  getOrCreateVisitorSession,
  getRequestIp,
  hashVisitorIp,
} from "@/server/security/visitor-session";
import { analyzeWebsite } from "@/server/website-analysis/analyze";

export const runtime = "nodejs";

const demoTurnSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(2500),
  action: z
    .enum(["message", "analyze_url", "explore_idea", "refine_idea", "propose_idea"])
    .default("message"),
  history: z
    .array(
      z.object({
        role: z.enum(["visitor", "assistant"]),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .max(8)
    .default([]),
  ideaContext: z.string().trim().max(2400).optional(),
  idempotencyKey: z.string().min(8).max(100).optional(),
});

const acmeContext = [
  "Name: AcmeMonitor",
  "Summary: An observability platform for teams building and operating AI applications.",
  "Audience: AI engineers, platform teams, and technical leaders.",
  "Offers: Tracing, evaluations, production monitoring, and practical reliability guidance.",
  "Wants: Educational collaborations that help technical teams build safer, more dependable AI systems.",
].join("\n");

export async function POST(request: Request) {
  let body: z.infer<typeof demoTurnSchema>;
  try {
    body = demoTurnSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Send a shorter, valid message." }, { status: 400 });
  }

  const limit = await consumeRateLimit({
    keyHash: hashVisitorIp(getRequestIp(request)),
    action: "demo_message_ip",
    limit: 45,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return Response.json(
      { error: "The demo needs a short pause. Please try again soon." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(
      and(
        eq(profiles.handle, "darren"),
        eq(profiles.isDemo, true),
        eq(profiles.isPublished, true),
      ),
    )
    .limit(1);
  if (!profile || !body.conversationId) {
    return Response.json(
      {
        code: "verification_required",
        error: "Complete the introduction and verify your email before using Agent Chat.",
      },
      { status: 403 },
    );
  }
  const conversationId = body.conversationId;

  const visitorSession = await getOrCreateVisitorSession(request);
  const [verifiedIntake] = await db
    .select({ conversationId: conversations.id })
    .from(conversations)
    .innerJoin(
      conversationLeads,
      eq(conversationLeads.conversationId, conversations.id),
    )
    .innerJoin(
      conversationContacts,
      eq(conversationContacts.conversationId, conversations.id),
    )
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.profileId, profile.id),
        eq(conversations.visitorSessionId, visitorSession.id),
        eq(conversations.mode, "demo"),
        isNotNull(conversationLeads.personName),
        isNotNull(conversationLeads.companyName),
        isNotNull(conversationLeads.companyDescription),
        isNotNull(conversationLeads.intakeCompletedAt),
        isNotNull(conversationContacts.emailVerifiedAt),
      ),
    )
    .limit(1);
  if (!verifiedIntake) {
    return Response.json(
      { code: "verification_required", error: "Verify your email before using Agent Chat." },
      { status: 403 },
    );
  }

  const idempotencyKey = body.idempotencyKey ?? randomUUID();
  const messageCreatedAt = new Date();
  const claimedMessage = (await neonSql`
    WITH visitor_message AS (
      INSERT INTO messages (
        conversation_id, role, content, status, client_idempotency_key, created_at
      )
      SELECT id, 'visitor', ${body.message}, 'complete', ${idempotencyKey}, ${messageCreatedAt}
      FROM conversations
      WHERE id = ${conversationId} AND mode = 'demo' AND visitor_message_count < 30
      ON CONFLICT (conversation_id, client_idempotency_key) DO NOTHING
      RETURNING conversation_id
    )
    UPDATE conversations
    SET visitor_message_count = visitor_message_count + 1,
        last_message_at = ${messageCreatedAt}, updated_at = ${messageCreatedAt}
    WHERE id IN (SELECT conversation_id FROM visitor_message)
    RETURNING id
  `) as Array<{ id: string }>;
  if (!claimedMessage.length) {
    return Response.json(
      { error: "That message was already received, or this demo conversation is complete." },
      { status: 409 },
    );
  }

  const encoder = new TextEncoder();
  const send = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    event: PublicAgentEvent,
  ) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        send(controller, {
          type: "conversation",
          conversationId,
        });
        send(controller, { type: "status", stage: "understand_business", state: "active" });

        let websiteContext: string | undefined;
        const normalizedMessage = body.message.toLowerCase();
        const isAcmeExample = normalizedMessage.includes("acmemonitor");
        const isUrl = body.action === "analyze_url" || /^https?:\/\/\S+$/i.test(body.message);

        if (isAcmeExample) {
          websiteContext = acmeContext;
        } else if (isUrl) {
          const analysisLimit = await consumeRateLimit({
            keyHash: hashVisitorIp(getRequestIp(request)),
            action: "demo_url_analysis_ip",
            limit: 5,
            windowMs: 60 * 60 * 1000,
          });
          if (!analysisLimit.allowed) {
            send(controller, {
              type: "error",
              code: "rate_limited",
              message: "Website analysis is temporarily limited. Describe the business instead.",
            });
            return;
          }
          try {
            const analysis = await analyzeWebsite(body.message, request.signal);
            websiteContext = [
              `URL: ${analysis.url}`,
              `Title: ${analysis.title}`,
              `Description: ${analysis.description}`,
              `Headings: ${analysis.headings.join(" | ")}`,
              `Page text: ${analysis.text}`,
            ].join("\n");
          } catch {
            send(controller, {
              type: "error",
              code: "website_unavailable",
              message:
                "I couldn’t safely read that site. Describe the business, or try the AcmeMonitor example.",
            });
            return;
          }
        }

        send(controller, { type: "status", stage: "understand_business", state: "done" });
        send(controller, { type: "status", stage: "compare_audiences", state: "active" });
        const context = profile
          ? await getAgentContext(profile.id)
          : {
              publicContext: [
                `Name: ${demoProfile.displayName}`,
                `Headline: ${demoProfile.headline}`,
                `Bio: ${demoProfile.bio.join(" ")}`,
                `Interests: ${demoProfile.interests.join(", ")}`,
                `Capabilities: ${demoProfile.capabilities.map((item) => item.label).join(", ")}`,
                `Projects: ${demoProfile.projects.map((item) => `${item.name} — ${item.description}`).join(" | ")}`,
                `Guidelines: ${demoProfile.guidelines.join("; ")}`,
              ].join("\n"),
              privateContext: [
                `Tone: ${defaultAgentSettings.tone}`,
                `Priorities: ${defaultAgentSettings.priorities}`,
                `Things to avoid: ${defaultAgentSettings.thingsToAvoid}`,
                `Rejection rules: ${defaultAgentSettings.rejectionRules}`,
                `Private notes: ${defaultAgentSettings.privateEvaluationNotes}`,
              ].join("\n"),
              privateFragments: Object.values(defaultAgentSettings),
            };
        send(controller, { type: "status", stage: "compare_audiences", state: "done" });
        send(controller, { type: "status", stage: "find_angles", state: "active" });

        const provider = await getPartnerBirdProvider("free");
        const result = await provider.runTurn(
          {
            message: body.message,
            action: body.action,
            actionContext:
              body.action === "message"
                ? undefined
                : [
                    "This is an isolated product demo. Never create or submit a real proposal.",
                    body.ideaContext
                      ? `Continue from this selected idea:\n${body.ideaContext}`
                      : "Continue from the idea described in the visitor message and recent history.",
                  ].join("\n"),
            profileName: profile?.displayName ?? demoProfile.displayName,
            ownerPublicContext: context.publicContext,
            ownerPrivateContext: context.privateContext,
            websiteContext,
            history: body.history,
          },
          request.signal,
        );

        if (containsPrivateContextLeak(JSON.stringify(result), context.privateFragments)) {
          throw new Error("PRIVATE_CONTEXT_LEAK");
        }
        if (profile) {
          await recordIsolatedUsage({
            profileId: profile.id,
            scope: "demo",
            includesWebsiteAnalysis: Boolean(isUrl && websiteContext && !isAcmeExample),
          });
        }

        const persistedAt = new Date();
        const ideasJson = JSON.stringify(result.ideas);
        const [persistence] = (await neonSql`
          WITH assessment AS (
            INSERT INTO fit_assessments (
              conversation_id, label, public_rationale, strengths, concerns, created_at
            ) VALUES (
              ${conversationId}, ${result.fit.label}, ${result.fit.rationale},
              ${JSON.stringify(result.fit.strengths)}::jsonb,
              ${JSON.stringify(result.fit.concerns)}::jsonb, ${persistedAt}
            )
            RETURNING id
          ),
          ideas_input AS (
            SELECT value, (ordinality - 1)::integer AS sort_order
            FROM jsonb_array_elements(${ideasJson}::jsonb) WITH ORDINALITY
          ),
          inserted_ideas AS (
            INSERT INTO partnership_ideas (
              conversation_id, assessment_id, fit_label, type, title, description,
              why_it_works, owner_contribution, visitor_contribution, mutual_value,
              activation, sort_order, created_at, updated_at
            )
            SELECT
              ${conversationId}, assessment.id, value->>'fitLabel', value->>'type',
              value->>'title', value->>'description', value->>'whyItWorks',
              value->>'ownerContribution', value->>'visitorContribution',
              value->>'mutualValue', value->>'activation', sort_order,
              ${persistedAt}, ${persistedAt}
            FROM ideas_input CROSS JOIN assessment
            RETURNING
              id, fit_label AS "fitLabel", type, title, description,
              why_it_works AS "whyItWorks",
              owner_contribution AS "ownerContribution",
              visitor_contribution AS "visitorContribution",
              mutual_value AS "mutualValue", activation, sort_order
          ),
          assistant_message AS (
            INSERT INTO messages (
              conversation_id, role, content, model, status, created_at
            ) VALUES (
              ${conversationId}, 'assistant', ${result.response}, ${provider.model},
              'complete', ${persistedAt}
            )
          ),
          conversation_update AS (
            UPDATE conversations
            SET state = ${result.nextState}, provider = ${provider.name},
                model = ${provider.model}, last_message_at = ${persistedAt},
                updated_at = ${persistedAt}
            WHERE id = ${conversationId} AND mode = 'demo'
          )
          SELECT COALESCE(
            (SELECT jsonb_agg(to_jsonb(inserted_ideas) ORDER BY sort_order)
             FROM inserted_ideas),
            '[]'::jsonb
          ) AS ideas
        `) as Array<{
          ideas: Array<{
            id: string;
            fitLabel: string;
            type: string;
            title: string;
            description: string;
            whyItWorks: string;
            ownerContribution: string;
            visitorContribution: string;
            mutualValue: string;
            activation: string;
          }>;
        }>;

        send(controller, { type: "status", stage: "find_angles", state: "done" });
        send(controller, { type: "status", stage: "assess_fit", state: "active" });
        send(controller, { type: "status", stage: "assess_fit", state: "done" });

        for (const chunk of chunkResponse(result.response)) {
          if (request.signal.aborted) break;
          send(controller, { type: "assistant_delta", delta: chunk });
          if (provider.name === "mock") await delay(20);
        }
        send(controller, { type: "fit", fit: result.fit });
        send(controller, {
          type: "ideas",
          ideas: (persistence?.ideas ?? []).map((idea) => ({
            ...idea,
            fitLabel:
              idea.fitLabel === "Strong Fit" ||
              idea.fitLabel === "Good Fit" ||
              idea.fitLabel === "Worth Exploring" ||
              idea.fitLabel === "Weak Fit" ||
              idea.fitLabel === "Not a Fit"
                ? idea.fitLabel
                : "Worth Exploring",
          })),
        });
        send(controller, { type: "done", state: result.nextState });
      } catch (error) {
        const reference = reportAgentTurnFailure("demo", error, {
          action: body.action,
        });
        const temporarilyLimited =
          error instanceof Error && error.message === "OPENROUTER_RATE_LIMITED";
        send(controller, {
          type: "error",
          code: temporarilyLimited ? "temporarily_limited" : "service_unavailable",
          message: temporarilyLimited
            ? "The live model is busy. Please retry the demo shortly."
            : `The demo is temporarily unavailable. Please try again. Reference: ${reference}`,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function chunkResponse(value: string) {
  const words = value.split(/(\s+)/);
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += 3) {
    chunks.push(words.slice(index, index + 3).join(""));
  }
  return chunks;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
