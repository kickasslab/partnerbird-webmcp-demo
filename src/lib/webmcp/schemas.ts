import { z } from "zod";

const username = z.string().trim().toLowerCase().min(2).max(48).regex(/^[a-z0-9-]+$/);
const requestId = z.string().uuid();
const idempotencyKey = z.string().trim().min(8).max(100).regex(/^[A-Za-z0-9._:-]+$/);

export const webmcpInputSchemas = {
  get_profile: z.object({ username }),
  get_partnership_interests: z.object({ username }),
  prepare_agent_handoff: z.object({
    recipientUsername: username,
    personName: z.string().trim().min(2).max(120),
    companyName: z.string().trim().min(2).max(180),
    companyDescription: z.string().trim().min(10).max(600),
    partnershipGoal: z.string().trim().min(5).max(600),
    contextSummary: z.string().trim().min(10).max(1200).optional(),
  }).strict(),
  search_partners: z.object({
    query: z.string().trim().max(120).default(""),
    limit: z.number().int().min(1).max(10).default(5),
    cursor: username.optional(),
  }),
  get_my_profile: z.object({}),
  get_my_preferences: z.object({}),
  save_partner: z.object({ username }),
  list_saved_partners: z.object({ limit: z.number().int().min(1).max(20).default(10) }),
  create_request_draft: z.object({
    recipientUsername: username,
    title: z.string().trim().min(5).max(180),
    body: z.string().trim().min(20).max(4000),
  }),
  update_request_draft: z.object({
    requestId,
    title: z.string().trim().min(5).max(180).optional(),
    body: z.string().trim().min(20).max(4000).optional(),
  }).refine((value) => value.title !== undefined || value.body !== undefined, {
    message: "Provide a title or body to update.",
  }),
  list_my_requests: z.object({
    direction: z.enum(["all", "incoming", "outgoing"]).default("all"),
    status: z.enum(["all", "draft", "submitted", "accepted", "declined", "withdrawn"]).default("all"),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  get_request: z.object({ requestId }),
  submit_request: z.object({ requestId, idempotencyKey }).strict(),
  withdraw_request: z.object({ requestId, idempotencyKey }).strict(),
  respond_to_request: z.object({
    requestId,
    response: z.enum(["accept", "decline"]),
    idempotencyKey,
  }).strict(),
} as const;

export type WebMCPInputMap = {
  [K in keyof typeof webmcpInputSchemas]: z.infer<(typeof webmcpInputSchemas)[K]>;
};
