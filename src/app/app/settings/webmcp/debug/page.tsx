import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import Link from "next/link";

import { PageHeader, ownerStyles as styles } from "@/components/owner/owner-ui";
import { WebMCPDebugPanel } from "@/components/webmcp/webmcp-debug-panel";
import { getReadyOwnerProfile } from "@/server/profiles/owner";

export default async function WebMCPDebugPage() {
  if (process.env.NODE_ENV === "production") notFound();
  await getReadyOwnerProfile();
  return <><PageHeader eyebrow="Development only" title="WebMCP debug" description="Inspect browser support, route-scoped registration, annotations, and registration errors without exposing server security internals." actions={<Link href="/app/settings/webmcp" className={styles.secondaryButton}><ArrowLeft size={13} /> WebMCP settings</Link>} /><WebMCPDebugPanel /></>;
}
