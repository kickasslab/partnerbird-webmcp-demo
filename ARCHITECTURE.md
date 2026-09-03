# PartnerBird WebMCP Demo architecture

This challenge edition preserves the real WebMCP and Agent Chat boundaries while
removing unrelated product surfaces.

## Request path

```text
Browser agent
  → document.modelContext tool registered on /@darren
  → same-origin /api/webmcp request
  → schema validation and server-side session authorization
  → WebMCP policy, block, rate-limit, and recipient checks
  → allowlisted serializer
  → safe structured result
```

User-authored profile and request content is marked as untrusted. Tool
descriptions are static application text. Public tools never return database
rows directly.

## Handoff path

```text
External agent prepares context
  → prepare_agent_handoff
  → hashed, expiring, one-time pending record
  → /agent/handoff/[token]
  → sign in / sign up / verify email (same return path)
  → explicit "Evaluate with PartnerBird Agent" click
  → verified conversation in WEBMCP_HANDOFF mode
  → normal Agent provider, usage, and abuse controls begin
  → human approves any final partnership request
```

No Agent endpoint, OpenRouter provider, or PartnerBird AI reservation is touched
before the explicit activation click. A normal visit to `/@darren` always uses
`NORMAL` entry mode and retains the original intake sequence.

## Retained modules

- `src/components/webmcp`: browser registration and handoff UI.
- `src/lib/webmcp`: catalog, schemas, types, limits, and safe serializers.
- `src/server/webmcp`: authorization, policy, service, audit, confirmation,
  request security, and handoff persistence.
- `src/app/api/webmcp`: same-origin execution and confirmation boundaries.
- `src/app/api/agent/handoffs`: explicit handoff activation.
- `src/app/api/public` and `src/server/agent`: unchanged regular Agent Chat,
  conversation, and human-approved proposal path.
- `src/server/security`: visitor sessions, rate limiting, and network safety.
- `src/server/billing/usage.ts` and entitlements: Agent usage accounting after
  activation.

## Deliberately omitted

Admin/CMS pages, the owner dashboard and navigation, marketing/pricing pages,
analytics, Stripe management routes, exports, unrelated internal tools, and
their screenshots are not part of this public challenge edition. Only
onboarding and WebMCP permission controls remain under `/app` because they are
required to reproduce authenticated WebMCP behavior without weakening consent.

See [docs/WEBMCP.md](docs/WEBMCP.md) and
[docs/AGENT_CHAT_ENTRY_MODES.md](docs/AGENT_CHAT_ENTRY_MODES.md) for the detailed
security contract.
