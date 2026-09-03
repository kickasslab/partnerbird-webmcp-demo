import "server-only";

export function reportAgentTurnFailure(
  surface: "demo" | "owner-test" | "public-profile",
  error: unknown,
  context: Record<string, string | number | undefined> = {},
): string {
  const reference = crypto.randomUUID().slice(0, 8).toUpperCase();
  console.error(`[agent-turn/${surface}] failed`, {
    reference,
    errorCode: safeErrorCode(error),
    ...context,
  });
  return reference;
}

export function safeErrorCode(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 120);
  return "UNKNOWN_AGENT_ERROR";
}
