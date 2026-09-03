# PartnerBird WebMCP

Last specification review: 3 September 2026.

PartnerBird implements the current imperative WebMCP API (`document.modelContext`) described by the [WebMCP Community Group draft](https://webmachinelearning.github.io/webmcp/) and [Chrome's imperative API guide](https://developer.chrome.com/docs/ai/webmcp/imperative-api). Chrome still treats WebMCP as experimental. The integration therefore uses progressive enhancement and does not affect ordinary PartnerBird behavior when the API is absent.

## Architecture

```text
PartnerBird React UI ─┐
                     ├─ authenticated PartnerBird data and policy layer ─ database
WebMCP registration ─┘
       │
       └─ same-origin /api/webmcp/tools/[tool] route
```

The browser registers small, route-relevant tools. Every execution calls a same-origin Route Handler with the normal secure session cookie. The handler validates origin, content type, input, authentication, account status, ownership, permissions, blocks, plan-aware limits, recipient rules, duplicates, and idempotency before the database changes. JSON Schema is agent guidance; Zod and database constraints are authoritative.

No tool imports or calls PartnerBird's agent provider, Agent Chat endpoints, OpenRouter provider, AI usage reservations, or AI credit code. The external agent performs search reasoning and drafts text itself. `src/server/webmcp/ai-boundary.test.ts` mocks the AI modules to throw and statically rejects forbidden imports while ordinary WebMCP serialization still succeeds.

Tools are registered with an `AbortSignal` and unregistered on route change or component unmount. No `exposedTo` option is used. `Permissions-Policy: tools=(self)` and `Origin-Agent-Cluster: ?1` keep registration same-origin and origin-isolated. State-changing fetches additionally require a matching `Origin`, same-origin Fetch Metadata when present, JSON, and the authenticated SameSite session.

## Tool inventory

| Tool | Auth? | Read/write | Data returned | Side effect | Confirmation | Rate limited | Opt-in | PartnerBird AI | OpenRouter |
|---|---:|---|---|---|---|---:|---|---:|---:|
| `get_profile` | No | Read | Safe public profile DTO | Activity entry | No | Yes | Target master + public read | NO | NO |
| `get_partnership_interests` | No | Read | Public interests, capabilities, activations | None | No | Yes | Target master + public read | NO | NO |
| `search_partners` | Yes | Read | Capped safe result DTOs and cursor | Activity entry | No | Yes | Caller master; targets discovery + matching | NO | NO |
| `get_my_profile` | Yes | Read | Caller's partnership profile allowlist | None | No | Yes | Caller master | NO | NO |
| `get_my_preferences` | Yes | Read | Caller's WebMCP settings and limit class | None | No | Yes | Caller master | NO | NO |
| `prepare_agent_handoff` | Yes | Write | Short-lived handoff URL and safe target summary | Creates private pending handoff only | Explicit evaluation happens on the handoff page | Yes | Caller matching; target public discovery + matching | NO | NO |
| `save_partner` | Yes | Write | Safe saved-partner result | Private bookmark | No | Yes | Caller save; target discovery | NO | NO |
| `list_saved_partners` | Yes | Read | Caller's visible saved partners | None | No | Yes | Caller master; target public read | NO | NO |
| `create_request_draft` | Yes | Write | Party-safe draft DTO | Private draft | No | Yes | Caller draft; target public read | NO | NO |
| `update_request_draft` | Yes | Write | Party-safe draft DTO | Updates owned draft | No | Yes | Caller draft | NO | NO |
| `list_my_requests` | Yes | Read | Capped party-safe request DTOs | None | No | Yes | Caller master | NO | NO |
| `get_request` | Yes | Read | One party-safe request DTO | None | No | Yes | Caller master + party check | NO | NO |
| `submit_request` | Yes | Write | Submitted request DTO | Contacts recipient | Visible human approval + server ticket | Yes, strict | Both parties | NO | NO |
| `withdraw_request` | Yes | Write | Withdrawn request DTO | Changes external status | Visible human approval + server ticket | Yes | Caller submit | NO | NO |
| `respond_to_request` | Yes | Write | Accepted/declined request DTO | Changes external status | Visible human approval + server ticket | Yes | Caller master + recipient ownership | NO | NO |

`list_opportunities` is intentionally absent: current PartnerBird opportunities are private owner CRM records, not published opportunities. Exposing them would violate the current product privacy boundary. No bulk outreach, mass messaging, all-user listing, or export tool exists.

## Registration strategy

- Public `@username` pages: `get_profile`, `get_partnership_interests`; authenticated `save_partner` and `create_request_draft` appear only when the caller enabled those permissions.
- An authenticated, verified owner who enabled matching can also receive `prepare_agent_handoff` on an opted-in target profile. Anonymous visitors never receive this tool.
- Focused WebMCP setup page: discovery, saved-partner, draft, request lifecycle,
  own-profile, and own-preferences tools.
- The general owner dashboard is intentionally absent from this challenge edition.
- Disabled accounts: no authenticated tools.
- Unsupported browsers: no registration, fetch, or console error.

### Darren challenge profile

`/@darren` is the one explicitly configured challenge/demo profile. Its server-rendered page loads the same database-backed public WebMCP policy used by the context endpoint and passes the safe availability decision to the client registry. This lets `get_profile` and `get_partnership_interests` register as soon as Chrome exposes `document.modelContext`, without waiting for the secondary authenticated-context request. The registry still refreshes that context before adding authenticated tools, and every execution is re-authorized by the normal server service.

The registry waits up to ten seconds when Chrome exposes `document.modelContext` after hydration, registers tools sequentially with AbortSignal cleanup, and confirms retention through native `getTools()`. Temporary console diagnostics use the `[WebMCP]` prefix and report API detection, policy loading, each registration, success, skipped-policy reasons, failures, and genuine route cleanup.

## WebMCP Agent Chat handoff

`prepare_agent_handoff` creates a 30-minute bearer URL at `/agent/handoff/[token]`. The database stores only the SHA-256 token hash. The route independently validates expiry, target publication and availability, current WebMCP policy, authentication, verified email, activation ownership, rate limits, and the one-time state transition. It never infers handoff mode from a query string, referrer, user agent, or the presence of the browser API.

Before the visitor clicks **Evaluate with PartnerBird Agent**, preparation and preview use no PartnerBird Agent endpoint, AI reservation, OpenRouter provider, or AI credits and do not contact the profile owner. Existing sign-in, sign-up, and verification preserve the exact internal return path. Activation transfers only the already-collected introduction fields into a normal verified conversation. The first turn then uses the existing demo/live turn endpoint, so the established provider, accounting, abuse, prompt, and request rules begin at that point. The ordinary `/@handle` path always passes the explicit `NORMAL` mode and retains its existing intake and **Continue to Agent Chat** action. See `docs/AGENT_CHAT_ENTRY_MODES.md` for the side-by-side contract.

## Exposed fields

### Public profile and search DTOs

- `username`
- `displayName`
- `profileUrl`
- public `avatarUrl`
- public `headline`
- public `bio`
- public `websiteUrl`
- public `socialLinks`
- `acceptingPartnerships`
- public `partnershipInterests`
- public capabilities: `label`, `detail`
- public projects: `name`, `description`, public fit label; search returns only the compact fields
- public activation options: `label`, `note`
- search-only count of exact shared public interests. This is derived exclusively from the caller's own enabled interest labels and the target's already-returned public `partnershipInterests`; it does not consult private guidance or hidden preferences. Duplicate/case variants count once.

### Authenticated caller-only fields

- own `isPublished` and `partnershipStatus`
- own WebMCP settings listed below
- own subscription limit class (not billing records or internal thresholds)
- saved timestamp for private saved partners
- opaque request ID, direction, counterparty public username/name/profile URL, title, body, status, and lifecycle timestamps for requests where the caller is a party

The serializers construct new allowlisted objects. They never return Drizzle rows.

## Deliberately excluded fields

Private/authentication email, visitor email, phone, private location/address, owner/auth user ID, raw profile foreign keys, passwords, password reset data, session/auth tokens, API keys, OpenRouter credentials, database credentials, Stripe IDs, payment/billing details and history, IPs and IP hashes, device fingerprints, admin/moderation notes, internal spam/trust/risk values, security flags, private saved partners belonging to another user, private notes, hidden/deleted fields, other users' conversations, Agent Chat conversations or prompts, OpenRouter prompts/responses, analytics, private agent settings and rules, private knowledge, full database rows, and internal rate-limit thresholds.

Location is currently excluded from the public DTO because the existing public `@username` payload does not display it. Verification status is also excluded because PartnerBird does not currently publish an owner verification badge.

## Focused demo account settings

Settings → WebMCP & Agent Access includes:

1. Master enable/disable control (off by default for existing and new users).
2. Allow public profile reads.
3. Allow WebMCP discovery search inclusion.
4. Allow use of public profile fields for matching.
5. Allow agents to save partners for the user.
6. Allow agents to create and update private request drafts.
7. Allow agents to submit requests after confirmation.
8. Allow incoming WebMCP requests.
9. Require sender verified email.
10. Require sender profile completion.
11. No/prefer/require listed-interest matching.
12. Standard/strict/very-strict inbound protection.

The page also shows the precise data allowlist, exclusions, recent meaningful activity, saved partners, request status, and bilateral account blocks. Turning off the master control causes the context endpoint to return disabled and the browser registry to unregister authenticated tools on the next React update; every server operation also rechecks the database setting, so an already registered callback fails closed immediately.

## Spam, abuse, authorization, and privacy

- Current Neon Auth session resolved server-side; no agent-supplied user ID is accepted.
- Managed Auth account is rechecked by immutable user ID on every authenticated execution; suspended users fail closed.
- Verified email and completed onboarding are mandatory for authenticated WebMCP.
- Bilateral block checks apply to reads (when authenticated), search, saves, drafts, submission, and responses.
- Only published/open profiles with explicit target consent can be discovered.
- Search uses a maximum page size of 10, opaque cursor behavior, and a bounded candidate window; it cannot enumerate all users in one call.
- Writes are owner-scoped. Request reads require sender or recipient ownership.
- Submissions enforce recipient opt-in, recipient availability, optional verified/completed-profile requirements, optional interest match, plan-aware sender limits, recipient limits, IP limits, content bounds, simple abuse-pattern checks, duplicate checks, and cooldown windows.
- Database constraints permit only one active submitted request per sender/recipient pair.
- Submit, withdraw, and respond use stable idempotency keys and conditional status updates. Retries with the same key return the existing result rather than repeating a side effect.
- High-risk actions pause in a visible PartnerBird dialog showing the exact request, counterparty, message, and intended state change. A trusted click creates a two-minute, account/tool/payload-bound, single-use approval ticket in an HttpOnly SameSite cookie. The ticket is absent from tool schemas and results, so `confirmed: true` cannot be asserted by an agent to bypass the dialog.
- Errors use safe categories and never disclose private recipient rules, trust scores, moderation details, or numeric anti-spam thresholds.
- All returned user-authored profile and request content is annotated `untrustedContentHint: true`; descriptions are static application text.
- Read-only tools alone use `readOnlyHint: true`.
- Activity logs store actor/subject references, action, outcome, sanitized category, resource/idempotency reference, timestamp, and small non-sensitive metadata. They never store the external prompt.

Rate policies use separate fixed-window buckets for reads, searches, medium writes, hourly/daily outreach, recipient inbound traffic, and IP traffic. Search is more permissive than writes; outreach is tightest. Paid plans receive modestly larger sender quotas, while mandatory global and recipient controls remain in effect. Recipient `standard`, `strict`, and `very_strict` settings progressively reduce incoming volume. Exact abuse thresholds are intentionally not returned to agents.

| Sender plan | Outreach/hour | Outreach/day |
|---|---:|---:|
| Free | 5 | 10 |
| Pro | 10 | 20 |
| Business | 12 | 25 |

The Business daily ceiling was deliberately reduced from 100 to 25. PartnerBird requests are high-context introductions rather than bulk marketing; plan level improves useful capacity without granting a mass-outreach entitlement. All plans remain additionally bounded by 40 submissions per IP/day, recipient limits of 20/8/3 per day, one active submitted pair, and the seven-day sender/recipient cooldown.

## Testing

Run deterministic checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Relevant suites cover safe allowlist serialization, private-field absence, disabled registration, target discovery opt-in, block enforcement, recipient settings, verified email, profile completion, suspended accounts, duplicates, party-only request access, confirmation and idempotency schemas, database uniqueness, WebMCP annotations, same-origin protections, unsupported browsers, and the AI/OpenRouter boundary.

### Chrome manual test

1. Apply migrations and seed: `npm run db:migrate && npm run db:seed`.
2. Start PartnerBird with `npm run dev`.
3. Use a Chrome build supporting the current origin trial, or enable `chrome://flags/#enable-webmcp-testing` and relaunch.
4. Install Chrome's Model Context Tool Inspector extension referenced by the official docs.
5. Open `/@darren`; confirm the two public read tools register and return only documented fields.
6. Sign in with a verified, onboarded test owner and open `/app/settings/webmcp` to enable selected permissions.
7. On that focused page, use the inspector to search, save one partner, create a draft, and confirm it appears in the activity/read models.
8. Invoke `submit_request`; verify the visible PartnerBird confirmation dialog shows the exact recipient and message. Cancel once and verify no request is sent. Invoke it again, click **Confirm and send**, and verify one request is submitted. A direct API call without the HttpOnly approval ticket must return `CONFIRMATION_REQUIRED`.
9. Sign in as the recipient, verify the incoming request, then accept or decline with confirmation and a stable key.
10. Disable WebMCP and verify authenticated tools unregister and direct endpoint execution returns `WEBMCP_DISABLED`.

For ChatGPT/Codex built-in browser testing, open the same local or deployed origin in a browser version exposing `document.modelContext`, inspect the registered tool list, and run the same workflow. Browser clients must visit the page to discover its route-scoped tools.

Chrome DevTools verification on `http://localhost:3000/@darren`:

```js
(await document.modelContext.getTools()).map(({ name }) => name)
```

The result must contain `get_profile` and `get_partnership_interests`. `getTools()` returns metadata rather than the page's execution callback, so execute `get_profile` through Chrome's Model Context Tool Inspector or another WebMCP client with `{ "username": "darren" }`.

## Development debug view

In development only, `/app/settings/webmcp/debug` shows whether `document.modelContext` exists, current route, whether tools are enabled, registered names, annotations, and client registration errors. It is authenticated and returns 404 in production. Development console messages contain registration metadata only.

## Per-tool smoke inputs

Use Chrome's inspector on the route listed below. UUIDs and idempotency keys are examples; substitute IDs returned by earlier calls. Confirm every result has the `{ ok, data }` or `{ ok: false, error }` envelope.

| Tool | Route | Minimal test input | Expected check |
|---|---|---|---|
| `get_profile` | `/@darren` | `{"username":"darren"}` | Safe Darren profile; no email/auth/private fields |
| `get_partnership_interests` | `/@darren` | `{"username":"darren"}` | Public interests/capabilities/activations only |
| `search_partners` | `/app/settings/webmcp` | `{"query":"AI","limit":3}` | At most 3 opted-in, unblocked results and optional cursor |
| `get_my_profile` | `/app/settings/webmcp` | `{}` | Signed-in owner's allowlisted partnership fields |
| `get_my_preferences` | `/app/settings/webmcp` | `{}` | Signed-in owner's settings, plan, limit class; no thresholds/billing IDs |
| `prepare_agent_handoff` | opted-in target profile | `{"recipientUsername":"darren","personName":"Avery","companyName":"AcmeMonitor","companyDescription":"Observability tooling for teams building AI applications.","partnershipGoal":"A practical newsletter collaboration."}` | Pending same-origin URL, zero AI credits, owner not contacted; URL requires auth and explicit evaluation |
| `save_partner` | `/app/settings/webmcp` or opted-in public profile | `{"username":"darren"}` | One private saved item; retry reports already saved |
| `list_saved_partners` | `/app/settings/webmcp` | `{"limit":10}` | Only caller's visible shortlist |
| `create_request_draft` | `/app/settings/webmcp` | `{"recipientUsername":"darren","title":"Joint safety guide","body":"A concrete collaboration proposal of at least twenty characters."}` | Private `draft`; recipient cannot read it |
| `update_request_draft` | `/app/settings/webmcp` | `{"requestId":"<draft UUID>","title":"Updated joint safety guide"}` | Owned draft changes; another user gets not found/unauthorized |
| `list_my_requests` | `/app/settings/webmcp` | `{"direction":"outgoing","status":"draft","limit":10}` | Caller-owned outgoing drafts only |
| `get_request` | `/app/settings/webmcp` | `{"requestId":"<request UUID>"}` | Sender can read draft; recipient only after submission |
| `submit_request` | `/app/settings/webmcp` | `{"requestId":"<draft UUID>","idempotencyKey":"submit-demo-0001"}` | Visible exact-action approval, then one submitted request; exact retry creates no duplicate |
| `withdraw_request` | `/app/settings/webmcp` | `{"requestId":"<submitted UUID>","idempotencyKey":"withdraw-demo-0001"}` | Visible exact-action approval, then status becomes withdrawn once |
| `respond_to_request` | `/app/settings/webmcp` as recipient | `{"requestId":"<submitted UUID>","response":"accept","idempotencyKey":"respond-demo-0001"}` | Visible exact-action approval, then status becomes accepted once; decline is equivalent |

For every high-risk tool, cancel the first visible approval and verify that no state changes. Also call its endpoint directly without the approval cookie and verify `CONFIRMATION_REQUIRED`. For request delivery, repeat with blocked, unverified, incomplete, opted-out, duplicated, suspended, and rate-limited fixtures and verify the safe error category without internal thresholds.

## Database migrations

- `drizzle/0012_large_taskmaster.sql`: settings, saved partners, request lifecycle, bilateral blocks, activity log, foreign keys/indexes, default-off consent, and existing Darren opt-in.
- `drizzle/0013_clammy_rhodey.sql`: partial unique index allowing only one active submitted request per sender/recipient pair.
- `drizzle/0014_flaky_spyke.sql`: withdrawal idempotency key and uniqueness.
- `drizzle/0016_bright_celestials.sql`: short-lived, payload-bound human-confirmation tickets. (`0015` belongs to the pre-existing conversation-intake work.)
- `drizzle/0018_enable-darren-webmcp-demo.sql`: idempotently repairs only the `is_demo = true`, `@darren` profile's master, public-read, discovery, and matching flags.
- `drizzle/0019_webmcp_agent_handoffs.sql`: hashed, expiring, one-time WebMCP handoffs bound to creator, target, activation account, and eventual conversation.
- Corresponding Drizzle snapshots and journal entries are included. `scripts/seed.ts` also idempotently enables the Darren demo after a fresh migrate-then-seed sequence.

`npm run db:check-webmcp-demo` reports Darren's four public flags plus aggregate enabled/demo counts without printing credentials or private profile data.

## File inventory

Core and integration changes:

- `ARCHITECTURE.md`, `README.md`, `next.config.ts`, `package.json`, `package-lock.json`
- `scripts/seed.ts`, `scripts/check-webmcp-demo.ts`
- `src/server/db/schema.ts`
- `src/server/webmcp/agent-handoffs.ts`, `src/app/agent/handoff/[token]/page.tsx`, `src/app/api/agent/handoffs/[token]/activate/route.ts`
- `src/components/webmcp/webmcp-handoff-preview.tsx`, `docs/AGENT_CHAT_ENTRY_MODES.md`
- `src/app/[handle]/page.tsx`, `src/app/app/layout.tsx`, `src/app/app/onboarding/page.tsx`
- `src/app/app/settings/webmcp/page.tsx`
- `src/components/owner/owner-ui.tsx`
- `src/types/webmcp.d.ts`

WebMCP implementation and tests:

- `src/lib/webmcp/types.ts`, `schemas.ts`, `tool-catalog.ts`, `safe-serializers.ts`, `limits.ts` and their colocated tests
- `src/server/webmcp/auth.ts`, `audit.ts`, `confirmation.ts`, `errors.ts`, `policy.ts`, `read-models.ts`, `request-security.ts`, `service.ts` and their colocated tests
- `src/app/api/webmcp/context/route.ts`
- `src/app/api/webmcp/confirmations/route.ts` and `route.test.ts`
- `src/app/api/webmcp/tools/[tool]/route.ts` and `route.test.ts`
- `src/components/webmcp/webmcp-registry.tsx`, `webmcp-registry.test.tsx`, `webmcp-debug-panel.tsx`
- `src/components/owner/webmcp-settings-form.tsx`, `webmcp-settings-form.test.tsx`
- `src/app/app/settings/webmcp/actions.ts`, `page.tsx`, `debug/page.tsx`
- `src/server/security/rate-limit.test.ts`
- `tests/e2e/webmcp.spec.ts`
- `docs/WEBMCP.md`
- `artifacts/qa/webmcp-public-darren.png`

Generated migration state:

- `drizzle/0012_large_taskmaster.sql`, `0013_clammy_rhodey.sql`, `0014_flaky_spyke.sql`, `0016_bright_celestials.sql`
- `drizzle/meta/0012_snapshot.json`, `0013_snapshot.json`, `0014_snapshot.json`, `0016_snapshot.json`, `_journal.json`

## Known limitations

- WebMCP is experimental and its browser implementation can change. The pinned `webmcp-types` package and Chrome/spec links must be reviewed during upgrades.
- The current specification has no standardized destructive-action or user-interaction hint. PartnerBird therefore implements its own visible exact-action approval dialog and opaque server ticket. Browser automation with broader permission to operate arbitrary page UI is outside the WebMCP-only threat boundary and must be governed by the browser agent's own human-control policy.
- Current PartnerBird CRM opportunities are private and are not exposed as public opportunities.
- Automated browser tests can validate progressive enhancement and a simulated model-context implementation. A real Chrome origin-trial/flag run and a two-account authenticated request/response test require suitable local test accounts and a compatible interactive Chrome build.
