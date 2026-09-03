# Agent Chat entry-mode contract

This document records the observable normal Agent Chat workflow before the WebMCP handoff entry is added. It is a regression contract, not a redesign brief.

## NORMAL

`/@handle` renders the existing public profile lobby. Opening Agent Chat transitions into the existing deterministic introduction, which collects the visitor's name, company name, and company description. The existing authentication and email-verification UI remains authoritative. No AI usage occurs during intake. A verified visitor explicitly chooses **Continue to Agent Chat**, after which the existing demo or live turn endpoint applies the existing abuse limits, AI usage accounting, provider selection, OpenRouter behavior, prompts, conversation sequence, and request workflow.

The normal profile route never receives, reads, or infers WebMCP handoff state. WebMCP browser support, referrers, user agents, and arbitrary query parameters do not alter this mode.

## WEBMCP_HANDOFF

`/agent/handoff/[token]` is a separate entry route. The token is an unguessable bearer value whose hash is stored in the database. The server must validate that the handoff exists, is unexpired, targets an open profile that still permits WebMCP matching, and belongs to the authenticated user before activation or conversation restoration.

Before authentication, the route presents only the existing sign-in/sign-up path with `returnTo` set to the same handoff route. Existing email verification preserves that return path. Before the user explicitly chooses **Evaluate with PartnerBird Agent**, the handoff creates no Agent Chat message, calls no provider, and consumes no AI credit. Activation creates a verified conversation using the supplied introduction fields; only the handoff entry may skip those already-answered deterministic intake questions. The first Agent turn then uses the existing demo/live endpoint and its unchanged accounting and provider behavior.

## Failure-safe rule

Only a server-validated handoff route can pass `WEBMCP_HANDOFF` to the shared shell. Every ordinary profile render passes `NORMAL`. A known expired, mismatched, disabled, or unauthorized handoff redirects to its target's ordinary `/@handle` profile and therefore receives `NORMAL`; a malformed or unknown token has no trustworthy target and returns not found. Neither path can enter handoff chat.
