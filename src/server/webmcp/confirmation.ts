import "server-only";

import { createHash } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";

import { webmcpInputSchemas, type WebMCPInputMap } from "@/lib/webmcp/schemas";
import {
  isHighRiskWebMCPTool,
  type HighRiskWebMCPToolName,
} from "@/lib/webmcp/types";
import { db } from "@/server/db/client";
import { webmcpActionConfirmations } from "@/server/db/schema";
import { requireWebMCPActor, type WebMCPActor } from "./auth";
import { WebMCPServiceError } from "./errors";

export const webmcpConfirmationCookieName = "partnerbird_webmcp_confirmation";
const confirmationLifetimeMs = 2 * 60 * 1000;

export async function issueWebMCPConfirmation(
  toolName: HighRiskWebMCPToolName,
  untrustedInput: unknown,
) {
  const actor = await requireWebMCPActor();
  const input = parseHighRiskInput(toolName, untrustedInput);
  const [confirmation] = await db.insert(webmcpActionConfirmations).values({
    profileId: actor.profile.id,
    toolName,
    inputHash: hashWebMCPConfirmationInput(toolName, input),
    expiresAt: new Date(Date.now() + confirmationLifetimeMs),
  }).returning({ id: webmcpActionConfirmations.id });
  if (!confirmation) throw confirmationRequired();
  return confirmation.id;
}

export async function consumeWebMCPConfirmation<K extends HighRiskWebMCPToolName>(
  actor: WebMCPActor,
  toolName: K,
  input: WebMCPInputMap[K],
  request: Request,
) {
  const confirmationId = readCookie(request.headers.get("cookie"), webmcpConfirmationCookieName);
  if (!confirmationId) throw confirmationRequired();
  const now = new Date();
  const [consumed] = await db.update(webmcpActionConfirmations).set({ consumedAt: now }).where(and(
    eq(webmcpActionConfirmations.id, confirmationId),
    eq(webmcpActionConfirmations.profileId, actor.profile.id),
    eq(webmcpActionConfirmations.toolName, toolName),
    eq(webmcpActionConfirmations.inputHash, hashWebMCPConfirmationInput(toolName, input)),
    isNull(webmcpActionConfirmations.consumedAt),
    gt(webmcpActionConfirmations.expiresAt, now),
  )).returning({ id: webmcpActionConfirmations.id });
  if (!consumed) throw confirmationRequired();
}

export function webmcpConfirmationCookie(value: string, requestUrl: string, maxAgeSeconds = 120) {
  return [
    `${webmcpConfirmationCookieName}=${encodeURIComponent(value)}`,
    "Path=/api/webmcp/tools",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAgeSeconds}`,
    ...(new URL(requestUrl).protocol === "https:" ? ["Secure"] : []),
  ].join("; ");
}

export function clearWebMCPConfirmationCookie(requestUrl: string) {
  return webmcpConfirmationCookie("", requestUrl, 0);
}

export function hashWebMCPConfirmationInput(
  toolName: HighRiskWebMCPToolName,
  input: WebMCPInputMap[HighRiskWebMCPToolName],
) {
  return createHash("sha256").update(JSON.stringify([toolName, input])).digest("hex");
}

function parseHighRiskInput<K extends HighRiskWebMCPToolName>(toolName: K, input: unknown): WebMCPInputMap[K] {
  if (!isHighRiskWebMCPTool(toolName)) throw confirmationRequired();
  const parsed = webmcpInputSchemas[toolName].safeParse(input);
  if (!parsed.success) {
    throw new WebMCPServiceError("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Review the tool input.", 400);
  }
  return parsed.data as WebMCPInputMap[K];
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }
  return null;
}

function confirmationRequired() {
  return new WebMCPServiceError(
    "CONFIRMATION_REQUIRED",
    "Approve this exact action in PartnerBird before trying again.",
    403,
  );
}
