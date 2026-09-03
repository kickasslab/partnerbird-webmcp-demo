import { randomUUID } from "node:crypto";

import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { containsPrivateContextLeak, getAgentContext } from "@/server/agent/context";
import { reportAgentTurnFailure } from "@/server/agent/failure-reporting";
import { getPartnerBirdProvider } from "@/server/agent/provider";
import type { PublicAgentEvent } from "@/server/agent/types";
import { getEntitlements } from "@/lib/billing/plans";
import { getCurrentPlan } from "@/server/billing/entitlements";
import {
  recordUsageEvent,
  releaseUsageReservation,
  reservePublicUsage,
} from "@/server/billing/usage";
import { db, neonSql } from "@/server/db/client";
import {
  conversationContacts,
  conversationLeads,
  conversations,
  messages,
  partnershipIdeas,
  visitorBusinesses,
} from "@/server/db/schema";
import { consumeRateLimit } from "@/server/security/rate-limit";
import {
  getOrCreateVisitorSession,
  getRequestIp,
  hashVisitorIp,
} from "@/server/security/visitor-session";
import { analyzeWebsite } from "@/server/website-analysis/analyze";
import { getProfileRecordByHandle } from "@/server/profiles/repository";

export const runtime = "nodejs";

const turnSchema = z
  .object({
    conversationId: z.string().uuid().optional(),
    ideaId: z.string().uuid().optional(),
    message: z.string().trim().min(1).max(4000),
    action: z
      .enum(["message", "analyze_url", "explore_idea", "refine_idea", "propose_idea"])
      .default("message"),
    idempotencyKey: z.string().min(8).max(100).optional(),
  })
  .superRefine((value, context) => {
    if (
      ["explore_idea", "refine_idea", "propose_idea"].includes(value.action) &&
      !value.ideaId
    ) {
      context.addIssue({
        code: "custom",
        message: "Select a partnership idea first.",
        path: ["ideaId"],
      });
    }
  });

type RouteContext = { params: Promise<{ handle: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  let body: z.infer<typeof turnSchema>;
  try {
    body = turnSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Send a shorter, valid message." }, { status: 400 });
  }

  const { handle } = await params;
  const profile = await getProfileRecordByHandle(decodeURIComponent(handle).toLowerCase());
  if (!profile?.isPublished) {
    return Response.json({ error: "Profile not found." }, { status: 404 });
  }
  if (profile.isDemo) {
    return Response.json(
      { error: "This example profile is available through the isolated live demo." },
      { status: 409 },
    );
  }
  if (!profile.isOpen) {
    return Response.json(
      { error: "This PartnerBird is not accepting new conversations right now." },
      { status: 409 },
    );
  }

  const plan = await getCurrentPlan(profile.id);
  const entitlements = getEntitlements(plan);

  const session = await getOrCreateVisitorSession(request);
  const messageLimit = positiveInteger(process.env.PARTNERBIRD_MESSAGE_LIMIT, 30, 100);
  const [sessionLimit, ipLimit] = await Promise.all([
    consumeRateLimit({
      keyHash: session.tokenHash,
      action: "message",
      limit: 60,
      windowMs: 60 * 60 * 1000,
    }),
    consumeRateLimit({
      keyHash: hashVisitorIp(getRequestIp(request)),
      action: "message_ip",
      limit: 150,
      windowMs: 60 * 60 * 1000,
    }),
  ]);

  if (!sessionLimit.allowed || !ipLimit.allowed) {
    const retryAfter = Math.max(
      sessionLimit.retryAfterSeconds,
      ipLimit.retryAfterSeconds,
    );
    return Response.json(
      { error: "PartnerBird needs a short pause. Please try again soon." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  if (!body.conversationId) {
    return Response.json(
      {
        code: "verification_required",
        error: "Complete the introduction and verify your email before using Agent Chat.",
      },
      { status: 403 },
    );
  }

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, body.conversationId),
        eq(conversations.profileId, profile.id),
        eq(conversations.visitorSessionId, session.id),
        eq(conversations.mode, "live"),
      ),
    )
    .limit(1);
  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }
  if (conversation.controlMode === "owner") {
    return Response.json(
      {
        code: "owner_controlled",
        error: `${profile.displayName} has joined this conversation. Reply in the open chat instead.`,
      },
      { status: 409 },
    );
  }

  const [verifiedIntake] = await db
    .select({ conversationId: conversationLeads.conversationId })
    .from(conversationLeads)
    .innerJoin(
      conversationContacts,
      eq(conversationContacts.conversationId, conversationLeads.conversationId),
    )
    .where(
      and(
        eq(conversationLeads.conversationId, conversation.id),
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
      {
        code: "verification_required",
        error: "Verify your email before using Agent Chat.",
      },
      { status: 403 },
    );
  }
  if (conversation.visitorMessageCount >= messageLimit) {
    return Response.json(
      { error: "This conversation has reached its message limit." },
      { status: 429 },
    );
  }

  const [priorMessagesNewestFirst, [storedBusiness]] = await Promise.all([
    db
      .select({ role: messages.role, content: messages.content })
      .from(messages)
      .where(eq(messages.conversationId, conversation.id))
      .orderBy(desc(messages.createdAt))
      .limit(10),
    db
      .select()
      .from(visitorBusinesses)
      .where(eq(visitorBusinesses.conversationId, conversation.id))
      .limit(1),
  ]);

  let selectedIdea: typeof partnershipIdeas.$inferSelect | undefined;
  if (body.ideaId) {
    [selectedIdea] = await db
      .select()
      .from(partnershipIdeas)
      .where(
        and(
          eq(partnershipIdeas.id, body.ideaId),
          eq(partnershipIdeas.conversationId, conversation.id),
        ),
      )
      .limit(1);
    if (!selectedIdea) {
      return Response.json({ error: "Partnership idea not found." }, { status: 404 });
    }
  }

  const history = priorMessagesNewestFirst
    .reverse()
    .filter(
      (item): item is { role: "visitor" | "assistant"; content: string } =>
        item.role === "visitor" || item.role === "assistant",
    );

  const idempotencyKey = body.idempotencyKey ?? randomUUID();
  const messageCreatedAt = new Date();
  let claimedMessage: Array<{ id: string }>;
  try {
    claimedMessage = (await neonSql`
      WITH capacity AS (
        UPDATE conversations
        SET visitor_message_count = visitor_message_count + 1,
            active_turn_key = ${idempotencyKey},
            active_turn_started_at = ${messageCreatedAt},
            last_message_at = ${messageCreatedAt}, updated_at = ${messageCreatedAt}
        WHERE id = ${conversation.id}
          AND visitor_message_count < ${messageLimit}
          AND control_mode = 'agent'
          AND (
            active_turn_key IS NULL OR
            active_turn_started_at < ${new Date(messageCreatedAt.getTime() - 90_000)}
          )
        RETURNING id
      )
      INSERT INTO messages (
        conversation_id, role, content, status, client_idempotency_key, created_at
      )
      SELECT id, 'visitor', ${body.message}, 'complete', ${idempotencyKey},
             ${messageCreatedAt}
      FROM capacity
      RETURNING id
    `) as Array<{ id: string }>;
  } catch (error) {
    if (databaseErrorCode(error) === "23505") {
      return Response.json(
        { error: "That message has already been received." },
        { status: 409 },
      );
    }
    throw error;
  }

  if (!claimedMessage.length) {
    const [currentConversation] = await db
      .select({
        visitorMessageCount: conversations.visitorMessageCount,
        activeTurnKey: conversations.activeTurnKey,
        controlMode: conversations.controlMode,
      })
      .from(conversations)
      .where(eq(conversations.id, conversation.id))
      .limit(1);
    const atMessageLimit =
      (currentConversation?.visitorMessageCount ?? messageLimit) >= messageLimit;
    if (currentConversation?.controlMode === "owner") {
      return Response.json(
        {
          code: "owner_controlled",
          error: `${profile.displayName} has joined this conversation. Reply in the open chat instead.`,
        },
        { status: 409 },
      );
    }
    return Response.json(
      {
        error:
          atMessageLimit
            ? "This conversation has reached its message limit."
            : "PartnerBird is already responding to this conversation.",
      },
      { status: atMessageLimit ? 429 : 409 },
    );
  }

  const includesWebsiteAnalysis =
    body.action === "analyze_url" || /^https?:\/\/\S+$/i.test(body.message);
  let usageReservation;
  try {
    usageReservation = await reservePublicUsage({
      profileId: profile.id,
      conversationId: conversation.id,
      idempotencyKey,
      plan,
      includesWebsiteAnalysis,
    });
  } catch {
    await clearActiveTurn(conversation.id, idempotencyKey);
    return Response.json(
      {
        code: "usage_unavailable",
        error: "PartnerBird could not check this profile’s allowance. Please retry shortly.",
      },
      { status: 503 },
    );
  }

  if (!usageReservation.allowed) {
    await clearActiveTurn(conversation.id, idempotencyKey);
    await recordUsageEvent({
      profileId: profile.id,
      eventType: "usage_limit_reached",
      idempotencyKey: `usage-limit:${conversation.id}:${usageReservation.code}`,
      metadata: { code: usageReservation.code, plan },
    }).catch(() => undefined);
    return usageLimitResponse({
      code: usageReservation.code,
      profileName: profile.displayName,
      conversationId: conversation.id,
    });
  }

  if (
    usageReservation.monthlyAiConversations >=
      Math.ceil(entitlements.aiConversationsPerMonth * 0.8) ||
    usageReservation.monthlyWebsiteAnalyses >=
      Math.ceil(entitlements.websiteAnalysesPerMonth * 0.8)
  ) {
    await recordUsageEvent({
      profileId: profile.id,
      eventType: "usage_limit_approaching",
      idempotencyKey: `usage-approaching:${conversation.id}:${idempotencyKey}`,
      metadata: {
        plan,
        aiConversations: usageReservation.monthlyAiConversations,
        websiteAnalyses: usageReservation.monthlyWebsiteAnalyses,
      },
    }).catch(() => undefined);
  }

  const encoder = new TextEncoder();
  const send = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    event: PublicAgentEvent,
  ) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let usageCompleted = false;
      try {
        send(controller, { type: "conversation", conversationId: conversation.id });
        let websiteContext =
          storedBusiness?.analysisStatus === "complete"
            ? [
                `URL: ${storedBusiness.url ?? ""}`,
                `Name: ${storedBusiness.name ?? ""}`,
                `Summary: ${storedBusiness.summary ?? ""}`,
                `Page text: ${storedBusiness.extractedText ?? ""}`,
              ].join("\n")
            : undefined;
        const isUrl = includesWebsiteAnalysis;

        send(controller, {
          type: "status",
          stage: "understand_business",
          state: "active",
        });

        if (isUrl) {
          const urlLimit = await consumeRateLimit({
            keyHash: session.tokenHash,
            action: "url_analysis",
            limit: positiveInteger(
              process.env.PARTNERBIRD_URL_ANALYSIS_LIMIT,
              3,
              20,
            ),
            windowMs: 60 * 60 * 1000,
          });
          if (!urlLimit.allowed) {
            send(controller, {
              type: "error",
              code: "rate_limited",
              message: "Website analysis is temporarily limited. Try again a little later.",
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
            await db
              .insert(visitorBusinesses)
              .values({
                conversationId: conversation.id,
                url: analysis.url,
                hostname: analysis.hostname,
                name: analysis.title,
                summary: analysis.description,
                extractedText: analysis.text,
                contentDigest: analysis.digest,
                analysisStatus: "complete",
              })
              .onConflictDoUpdate({
                target: visitorBusinesses.conversationId,
                set: {
                  url: analysis.url,
                  hostname: analysis.hostname,
                  name: analysis.title,
                  summary: analysis.description,
                  extractedText: analysis.text,
                  contentDigest: analysis.digest,
                  analysisStatus: "complete",
                  analysisError: null,
                  updatedAt: new Date(),
                },
              });
          } catch (error) {
            await db
              .insert(visitorBusinesses)
              .values({
                conversationId: conversation.id,
                url: body.message,
                analysisStatus: "failed",
                analysisError: publicWebsiteError(error),
              })
              .onConflictDoUpdate({
                target: visitorBusinesses.conversationId,
                set: {
                  analysisStatus: "failed",
                  analysisError: publicWebsiteError(error),
                  updatedAt: new Date(),
                },
              });
            send(controller, {
              type: "error",
              code: "website_unavailable",
              message:
                "I couldn’t safely read that website. You can still tell me what the business does.",
            });
            return;
          }
        }

        send(controller, {
          type: "status",
          stage: "understand_business",
          state: "done",
        });
        send(controller, {
          type: "status",
          stage: "compare_audiences",
          state: "active",
        });

        const context = await getAgentContext(profile.id);
        send(controller, {
          type: "status",
          stage: "compare_audiences",
          state: "done",
        });
        send(controller, {
          type: "status",
          stage: "find_angles",
          state: "active",
        });

        const provider = await getPartnerBirdProvider(plan);
        const result = await provider.runTurn(
          {
            message: body.message,
            action: body.action,
            actionContext: selectedIdea
              ? [
                  `Title: ${selectedIdea.title}`,
                  `Type: ${selectedIdea.type}`,
                  `Description: ${selectedIdea.description}`,
                  `Why it works: ${selectedIdea.whyItWorks}`,
                  `Activation: ${selectedIdea.activation}`,
                ].join("\n")
              : undefined,
            history,
            profileName: profile.displayName,
            ownerPublicContext: context.publicContext,
            ownerPrivateContext: context.privateContext,
            websiteContext,
            responseBudget: {
              current: usageReservation.conversationAiReplies,
              maximum: entitlements.aiRepliesPerConversation,
            },
          },
          request.signal,
        );

        if (
          containsPrivateContextLeak(
            JSON.stringify(result),
            context.privateFragments,
          )
        ) {
          throw new Error("PRIVATE_CONTEXT_LEAK");
        }

        send(controller, {
          type: "status",
          stage: "find_angles",
          state: "done",
        });
        send(controller, {
          type: "status",
          stage: "assess_fit",
          state: "active",
        });

        const persistedAt = new Date();
        const ideasJson = JSON.stringify(result.ideas);
        const [persistence] = (await neonSql`
          WITH turn_guard AS (
            SELECT id
            FROM conversations
            WHERE id = ${conversation.id}
              AND active_turn_key = ${idempotencyKey}
              AND control_mode = 'agent'
            FOR UPDATE
          ),
          assessment AS (
            INSERT INTO fit_assessments (
              conversation_id, label, public_rationale, strengths, concerns, created_at
            )
            SELECT
              turn_guard.id, ${result.fit.label}, ${result.fit.rationale},
              ${JSON.stringify(result.fit.strengths)}::jsonb,
              ${JSON.stringify(result.fit.concerns)}::jsonb,
              ${persistedAt}
            FROM turn_guard
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
              ${conversation.id}, assessment.id, value->>'fitLabel', value->>'type',
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
            )
            SELECT
              turn_guard.id, 'assistant', ${result.response}, ${provider.model},
              'complete', ${persistedAt}
            FROM turn_guard
          ),
          conversation_update AS (
            UPDATE conversations
            SET state = ${result.nextState}, provider = ${provider.name},
                model = ${provider.model}, last_message_at = ${persistedAt},
                active_turn_key = NULL, active_turn_started_at = NULL,
                updated_at = ${persistedAt}
            WHERE id IN (SELECT id FROM turn_guard)
            RETURNING id
          ),
          usage_completion AS (
            UPDATE usage_reservations
            SET status='completed', updated_at=${persistedAt}
            WHERE id=${usageReservation.reservationId}
              AND status='reserved'
              AND EXISTS(SELECT 1 FROM conversation_update)
            RETURNING id
          )
          SELECT
            EXISTS(SELECT 1 FROM conversation_update) AS persisted,
            COALESCE(
              (SELECT jsonb_agg(to_jsonb(inserted_ideas) ORDER BY sort_order)
               FROM inserted_ideas),
              '[]'::jsonb
            ) AS ideas
        `) as Array<{
          persisted: boolean;
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

        if (!persistence?.persisted) {
          send(controller, {
            type: "error",
            code: "owner_controlled",
            message: `${profile.displayName} has joined this conversation. PartnerBird is paused.`,
          });
          return;
        }
        const savedIdeas = persistence.ideas;
        usageCompleted = true;

        send(controller, {
          type: "status",
          stage: "assess_fit",
          state: "done",
        });

        for (const chunk of chunkResponse(result.response)) {
          if (request.signal.aborted) break;
          send(controller, { type: "assistant_delta", delta: chunk });
          if (provider.name === "mock") await delay(22);
        }

        send(controller, { type: "fit", fit: result.fit });
        send(controller, {
          type: "ideas",
          ideas: savedIdeas.map((idea) => ({
            id: idea.id,
            fitLabel:
              idea.fitLabel === "Strong Fit" ||
              idea.fitLabel === "Good Fit" ||
              idea.fitLabel === "Worth Exploring" ||
              idea.fitLabel === "Weak Fit" ||
              idea.fitLabel === "Not a Fit"
                ? idea.fitLabel
                : "Worth Exploring",
            type: idea.type,
            title: idea.title,
            description: idea.description,
            whyItWorks: idea.whyItWorks,
            ownerContribution: idea.ownerContribution,
            visitorContribution: idea.visitorContribution,
            mutualValue: idea.mutualValue,
            activation: idea.activation,
          })),
        });
        send(controller, { type: "done", state: result.nextState });
      } catch (error) {
        const reference = reportAgentTurnFailure("public-profile", error, {
          action: body.action,
          profileHandle: profile.handle,
        });
        send(controller, {
          type: "error",
          code: publicAgentErrorCode(error),
          message: publicAgentErrorMessage(error, reference),
        });
      } finally {
        if (!usageCompleted) {
          await releaseUsageReservation(usageReservation.reservationId).catch(
            () => undefined,
          );
        }
        await clearActiveTurn(conversation.id, idempotencyKey).catch(() => undefined);
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

function publicWebsiteError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 180) : "WEBSITE_UNAVAILABLE";
}

function publicAgentErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "OPENROUTER_RATE_LIMITED") return "temporarily_limited";
  if (message === "OPENROUTER_NOT_CONFIGURED") return "not_configured";
  return "service_unavailable";
}

function publicAgentErrorMessage(error: unknown, reference: string) {
  const code = publicAgentErrorCode(error);
  if (code === "temporarily_limited") {
    return "PartnerBird is receiving a lot of interest. Please retry shortly.";
  }
  if (code === "not_configured") {
    return "Live AI is not configured yet. Switch back to mock mode or finish the deployment setup.";
  }
  return `PartnerBird is temporarily unavailable. Your message wasn’t lost—please retry. Reference: ${reference}`;
}

function positiveInteger(value: string | undefined, fallback: number, maximum: number) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) return fallback;
  return parsed;
}

function databaseErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return "";
  return typeof error.code === "string" ? error.code : "";
}

async function clearActiveTurn(conversationId: string, idempotencyKey: string) {
  await neonSql`
    UPDATE conversations
    SET active_turn_key = NULL, active_turn_started_at = NULL,
        updated_at = ${new Date()}
    WHERE id = ${conversationId} AND active_turn_key = ${idempotencyKey}
  `;
}

function usageLimitResponse({
  code,
  profileName,
  conversationId,
}: {
  code:
    | "monthly_ai_conversations"
    | "daily_ai_conversations"
    | "conversation_ai_replies"
    | "monthly_website_analyses"
    | "conversation_website_analyses";
  profileName: string;
  conversationId: string;
}) {
  const websiteLimit = code.includes("website");
  const dailyLimit = code === "daily_ai_conversations";
  const replyLimit = code === "conversation_ai_replies";
  const error = websiteLimit
    ? "This PartnerBird has reached its website-analysis allowance. Describe the business instead, or leave a proposal."
    : dailyLimit
      ? "This PartnerBird has reached today’s new-conversation allowance. You can still leave a partnership proposal."
      : replyLimit
        ? "This PartnerBird conversation has reached a useful stopping point. You can still leave a partnership proposal."
        : `${profileName}’s PartnerBird has reached its AI conversation allowance for now, but you can still send ${profileName} a partnership proposal.`;
  return Response.json(
    {
      code,
      error,
      conversationId,
      fallback: {
        title: "The profile is still open to proposals",
        description: error,
        actionLabel: "Leave partnership proposal",
      },
    },
    { status: 429 },
  );
}
