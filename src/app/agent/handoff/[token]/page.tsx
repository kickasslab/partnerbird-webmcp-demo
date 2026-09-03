import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PartnerBirdShell } from "@/components/partnerbird/partnerbird-shell";
import { WebMCPHandoffPreview } from "@/components/webmcp/webmcp-handoff-preview";
import { auth } from "@/lib/auth/server";
import { getPublicProfileByHandle } from "@/server/profiles/repository";
import {
  readAgentHandoff,
  readAgentHandoffNormalFallback,
} from "@/server/webmcp/agent-handoffs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PartnerBird Agent handoff",
  robots: { index: false, follow: false },
};

export default async function AgentHandoffPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [handoff, { data: authSession }] = await Promise.all([
    readAgentHandoff(token),
    auth.getSession({ query: { disableCookieCache: "true" } }),
  ]);
  if (!handoff) {
    const normalHandle = await readAgentHandoffNormalFallback(token);
    if (normalHandle) redirect(`/@${normalHandle}`);
    notFound();
  }

  const user = authSession?.user;
  const verified = Boolean(user?.email && user.emailVerified === true);

  if (handoff.status === "activated") {
    if (!verified || handoff.activatedByUserId !== user?.id || !handoff.conversationId) {
      redirect(`/@${handoff.targetHandle}`);
    }
    const profile = await getPublicProfileByHandle(handoff.targetHandle);
    if (!profile) notFound();
    return (
      <PartnerBirdShell
        entryMode="WEBMCP_HANDOFF"
        experience={profile.isDemo ? "demo" : "profile"}
        initialChat
        initialConversationId={handoff.conversationId}
        initialViewer={{ email: user!.email, verified: true }}
        profile={profile}
      />
    );
  }

  return (
    <WebMCPHandoffPreview
      handoff={{
        personName: handoff.personName,
        companyName: handoff.companyName,
        companyDescription: handoff.companyDescription,
        partnershipGoal: handoff.partnershipGoal,
        contextSummary: handoff.contextSummary,
        expiresAt: handoff.expiresAt.toISOString(),
      }}
      target={{ username: handoff.targetHandle, displayName: handoff.targetDisplayName }}
      token={token}
      viewer={{
        authenticated: Boolean(user),
        verified,
        email: user?.email,
      }}
    />
  );
}
