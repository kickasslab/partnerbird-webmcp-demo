import { DemoAccountShell } from "@/components/demo-account-shell";
import { WebMCPRegistry } from "@/components/webmcp/webmcp-registry";
import { getOwnerContext } from "@/server/profiles/owner";

export const dynamic = "force-dynamic";

export default async function DemoAccountLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getOwnerContext();

  return (
    <DemoAccountShell handle={profile.handle} isPublished={profile.isPublished}>
      <WebMCPRegistry />
      {children}
    </DemoAccountShell>
  );
}
