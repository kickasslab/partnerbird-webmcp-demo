import type { WebMCPRisk, WebMCPToolName } from "./types";

type JSONSchema = Record<string, unknown>;

export type PartnerBirdWebMCPTool = {
  name: WebMCPToolName;
  title: string;
  description: string;
  risk: WebMCPRisk;
  inputSchema: JSONSchema;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
};

const object = (properties: Record<string, unknown>, required: string[] = []): JSONSchema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const username = { type: "string", minLength: 2, maxLength: 48, description: "Public PartnerBird username without @." };
const requestId = { type: "string", format: "uuid", description: "Opaque request identifier returned by PartnerBird." };
const idempotencyKey = { type: "string", minLength: 8, maxLength: 100, description: "Stable retry key for this exact action." };

const tool = (
  name: WebMCPToolName,
  title: string,
  description: string,
  risk: WebMCPRisk,
  inputSchema: JSONSchema,
  readOnlyHint: boolean,
): PartnerBirdWebMCPTool => ({
  name,
  title,
  description,
  risk,
  inputSchema,
  annotations: { readOnlyHint, untrustedContentHint: true },
});

export const webmcpToolCatalog: Record<WebMCPToolName, PartnerBirdWebMCPTool> = {
  get_profile: tool("get_profile", "Get public profile", "Read the WebMCP-safe public partnership profile for one opted-in PartnerBird username.", "low", object({ username }, ["username"]), true),
  get_partnership_interests: tool("get_partnership_interests", "Get partnership interests", "Read publicly shared partnership interests for one opted-in PartnerBird username.", "low", object({ username }, ["username"]), true),
  prepare_agent_handoff: tool(
    "prepare_agent_handoff",
    "Prepare PartnerBird Agent handoff",
    "Create a short-lived, private handoff preview for an opted-in profile. This does not call PartnerBird AI, consume AI credits, contact the profile owner, or start Agent Chat. The user must open the returned URL and explicitly choose Evaluate with PartnerBird Agent.",
    "medium",
    object({
      recipientUsername: username,
      personName: { type: "string", minLength: 2, maxLength: 120 },
      companyName: { type: "string", minLength: 2, maxLength: 180 },
      companyDescription: { type: "string", minLength: 10, maxLength: 600 },
      partnershipGoal: { type: "string", minLength: 5, maxLength: 600 },
      contextSummary: { type: "string", minLength: 10, maxLength: 1200 },
    }, ["recipientUsername", "personName", "companyName", "companyDescription", "partnershipGoal"]),
    false,
  ),
  search_partners: tool("search_partners", "Search partners", "Search a capped set of PartnerBird profiles that opted into WebMCP discovery.", "low", object({ query: { type: "string", maxLength: 120 }, limit: { type: "integer", minimum: 1, maximum: 10, default: 5 }, cursor: username }), true),
  get_my_profile: tool("get_my_profile", "Get my partnership profile", "Read the authenticated user's WebMCP-safe partnership profile.", "low", object({}), true),
  get_my_preferences: tool("get_my_preferences", "Get my WebMCP preferences", "Read the authenticated user's own WebMCP and matching controls.", "low", object({}), true),
  save_partner: tool("save_partner", "Save partner", "Save one opted-in PartnerBird profile to the authenticated user's private shortlist.", "medium", object({ username }, ["username"]), false),
  list_saved_partners: tool("list_saved_partners", "List saved partners", "List the authenticated user's private saved-partner shortlist using safe public profile fields.", "low", object({ limit: { type: "integer", minimum: 1, maximum: 20, default: 10 } }), true),
  create_request_draft: tool("create_request_draft", "Create request draft", "Create a private partnership request draft owned by the authenticated user; this does not contact the recipient.", "medium", object({ recipientUsername: username, title: { type: "string", minLength: 5, maxLength: 180 }, body: { type: "string", minLength: 20, maxLength: 4000 } }, ["recipientUsername", "title", "body"]), false),
  update_request_draft: tool("update_request_draft", "Update request draft", "Update a private partnership request draft owned by the authenticated user.", "medium", object({ requestId, title: { type: "string", minLength: 5, maxLength: 180 }, body: { type: "string", minLength: 20, maxLength: 4000 } }, ["requestId"]), false),
  list_my_requests: tool("list_my_requests", "List my requests", "List partnership requests where the authenticated user is the sender or recipient.", "low", object({ direction: { type: "string", enum: ["all", "incoming", "outgoing"], default: "all" }, status: { type: "string", enum: ["all", "draft", "submitted", "accepted", "declined", "withdrawn"], default: "all" }, limit: { type: "integer", minimum: 1, maximum: 20, default: 10 } }), true),
  get_request: tool("get_request", "Get request", "Read one partnership request only when the authenticated user is its sender or recipient.", "low", object({ requestId }, ["requestId"]), true),
  submit_request: tool("submit_request", "Submit partnership request", "Submit one owned draft to its recipient only after the user approves the exact action in PartnerBird's visible confirmation dialog.", "high", object({ requestId, idempotencyKey }, ["requestId", "idempotencyKey"]), false),
  withdraw_request: tool("withdraw_request", "Withdraw partnership request", "Withdraw one eligible outgoing request only after the user approves the exact action in PartnerBird's visible confirmation dialog.", "high", object({ requestId, idempotencyKey }, ["requestId", "idempotencyKey"]), false),
  respond_to_request: tool("respond_to_request", "Respond to partnership request", "Accept or decline one incoming request only after the user approves the exact action in PartnerBird's visible confirmation dialog.", "high", object({ requestId, response: { type: "string", enum: ["accept", "decline"] }, idempotencyKey }, ["requestId", "response", "idempotencyKey"]), false),
};

export function toolsForRoute(pathname: string, publicUsername?: string | null): WebMCPToolName[] {
  if (publicUsername) return ["get_profile", "get_partnership_interests"];
  if (!pathname.startsWith("/app")) return [];
  if (pathname.startsWith("/app/settings/webmcp")) {
    return [
      "get_my_profile",
      "get_my_preferences",
      "search_partners",
      "save_partner",
      "list_saved_partners",
      "create_request_draft",
      "update_request_draft",
      "list_my_requests",
      "get_request",
      "submit_request",
      "withdraw_request",
      "respond_to_request",
    ];
  }
  if (pathname === "/app") {
    return ["get_my_profile", "search_partners", "save_partner", "list_saved_partners", "create_request_draft", "update_request_draft", "list_my_requests", "get_request", "submit_request", "withdraw_request", "respond_to_request"];
  }
  return ["get_my_profile", "get_my_preferences"];
}

export function selectWebMCPTools(input: {
  pathname: string;
  publicUsername?: string;
  publicProfileAvailable: boolean;
  authenticatedWebMCPEnabled: boolean;
  targetMatchingEnabled?: boolean;
  permissions?: { allowMatching: boolean; allowSavePartners: boolean; allowCreateDrafts: boolean } | null;
}) {
  const names = new Set<WebMCPToolName>();
  if (input.publicUsername && input.publicProfileAvailable) {
    for (const name of toolsForRoute(input.pathname, input.publicUsername)) names.add(name);
    if (input.authenticatedWebMCPEnabled && input.permissions?.allowSavePartners) names.add("save_partner");
    if (input.authenticatedWebMCPEnabled && input.permissions?.allowCreateDrafts) names.add("create_request_draft");
    if (
      input.authenticatedWebMCPEnabled &&
      input.permissions?.allowMatching &&
      input.targetMatchingEnabled
    ) names.add("prepare_agent_handoff");
  } else if (!input.publicUsername && input.authenticatedWebMCPEnabled) {
    for (const name of toolsForRoute(input.pathname)) names.add(name);
  }
  return [...names];
}
