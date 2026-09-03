export const webmcpToolNames = [
  "get_profile",
  "get_partnership_interests",
  "prepare_agent_handoff",
  "search_partners",
  "get_my_profile",
  "get_my_preferences",
  "save_partner",
  "list_saved_partners",
  "create_request_draft",
  "update_request_draft",
  "list_my_requests",
  "get_request",
  "submit_request",
  "withdraw_request",
  "respond_to_request",
] as const;

export type WebMCPToolName = (typeof webmcpToolNames)[number];
export type WebMCPRisk = "low" | "medium" | "high";

export const highRiskWebMCPToolNames = [
  "submit_request",
  "withdraw_request",
  "respond_to_request",
] as const satisfies readonly WebMCPToolName[];

export type HighRiskWebMCPToolName = (typeof highRiskWebMCPToolNames)[number];

export function isHighRiskWebMCPTool(toolName: WebMCPToolName): toolName is HighRiskWebMCPToolName {
  return (highRiskWebMCPToolNames as readonly WebMCPToolName[]).includes(toolName);
}

export type WebMCPSettings = {
  enabled: boolean;
  allowPublicProfileRead: boolean;
  allowDiscovery: boolean;
  allowMatching: boolean;
  allowSavePartners: boolean;
  allowCreateDrafts: boolean;
  allowSubmitRequests: boolean;
  allowIncomingRequests: boolean;
  requireVerifiedEmail: boolean;
  requireCompleteProfile: boolean;
  interestMatchMode: "off" | "prefer" | "require";
  inboundStrictness: "standard" | "strict" | "very_strict";
};

export const defaultWebMCPSettings: WebMCPSettings = {
  enabled: false,
  allowPublicProfileRead: false,
  allowDiscovery: false,
  allowMatching: false,
  allowSavePartners: false,
  allowCreateDrafts: false,
  allowSubmitRequests: false,
  allowIncomingRequests: false,
  requireVerifiedEmail: true,
  requireCompleteProfile: true,
  interestMatchMode: "prefer",
  inboundStrictness: "strict",
};

export type WebMCPErrorCode =
  | "AUTH_REQUIRED"
  | "WEBMCP_DISABLED"
  | "NOT_AUTHORIZED"
  | "PROFILE_NOT_DISCOVERABLE"
  | "RECIPIENT_NOT_ACCEPTING_AGENT_REQUESTS"
  | "VERIFIED_EMAIL_REQUIRED"
  | "PROFILE_REQUIREMENTS_NOT_MET"
  | "RATE_LIMITED"
  | "DUPLICATE_REQUEST"
  | "BLOCKED"
  | "INVALID_REQUEST"
  | "REQUEST_NOT_FOUND"
  | "ACCOUNT_SUSPENDED"
  | "CONFIRMATION_REQUIRED"
  | "ORIGIN_NOT_ALLOWED";

export type WebMCPToolResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: WebMCPErrorCode; message: string; retryAfterSeconds?: number } };
