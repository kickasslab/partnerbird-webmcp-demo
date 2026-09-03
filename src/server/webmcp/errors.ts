import type { WebMCPErrorCode, WebMCPToolResult } from "@/lib/webmcp/types";

export class WebMCPServiceError extends Error {
  constructor(
    readonly code: WebMCPErrorCode,
    message: string,
    readonly status = 400,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export function webmcpErrorResult(error: unknown): {
  body: WebMCPToolResult;
  status: number;
  retryAfterSeconds?: number;
} {
  if (error instanceof WebMCPServiceError) {
    return {
      body: {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
        },
      },
      status: error.status,
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }
  return {
    body: {
      ok: false,
      error: { code: "INVALID_REQUEST", message: "PartnerBird could not complete this WebMCP action." },
    },
    status: 500,
  };
}
