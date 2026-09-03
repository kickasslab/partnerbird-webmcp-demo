import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PartnerBirdShell } from "@/components/partnerbird/partnerbird-shell";
import { WebMCPRegistry } from "@/components/webmcp/webmcp-registry";
import { auth } from "@/lib/auth/server";
import { getPublicProfileByHandle } from "@/server/profiles/repository";
import { getPublicWebMCPPolicy } from "@/server/webmcp/read-models";

type PageProps = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ chat?: string; conversation?: string }>;
};

export async function generateMetadata({ params }: Pick<PageProps, "params">): Promise<Metadata> {
  const { handle } = await params;
  const publicHandle = decodeURIComponent(handle);
  if (!publicHandle.startsWith("@")) return {};
  const profile = await getPublicProfileByHandle(publicHandle.slice(1));
  if (!profile) return {};

  return {
    title: `${profile.displayName}’s PartnerBird · AI Partnership Agent`,
    description:
      `Explore genuine collaboration opportunities with ${profile.displayName} through their PartnerBird AI partnership agent.`,
    alternates: { canonical: `/@${profile.handle}` },
  };
}

export default async function PublicProfilePage({ params, searchParams }: PageProps) {
  const [{ handle }, query] = await Promise.all([params, searchParams]);
  const publicHandle = decodeURIComponent(handle);

  if (!publicHandle.startsWith("@")) {
    notFound();
  }

  const profileHandle = publicHandle.slice(1);
  const [profile, { data: authSession }, webmcpPolicy] = await Promise.all([
    getPublicProfileByHandle(profileHandle),
    auth.getSession(),
    getPublicWebMCPPolicy(profileHandle),
  ]);
  if (!profile) notFound();

  return (
    <>
      <WebMCPRegistry
        initialPublicProfileAvailable={webmcpPolicy.publicProfileAvailable}
        publicUsername={profile.handle}
      />
      <PartnerBirdShell
      entryMode="NORMAL"
      profile={profile}
      initialChat={query.chat === "1"}
      initialConversationId={
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          query.conversation ?? "",
        )
          ? query.conversation
          : undefined
      }
      experience={profile.isDemo ? "demo" : "profile"}
      initialViewer={
        authSession?.user?.email && authSession.user.emailVerified
          ? { email: authSession.user.email, verified: true }
          : null
      }
      />
    </>
  );
}
