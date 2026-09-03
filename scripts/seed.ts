import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "../src/server/db/schema";

config({ path: ".env.local" });

async function seed() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed the database.");
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle({ client: sql, schema });
  const {
    activationCapabilities,
    agentPrivateSettings,
    agentPublicSettings,
    profileItems,
    profileProjects,
    profiles,
    webmcpSettings,
  } = schema;

  const existing = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.handle, "darren"))
    .limit(1);

  if (existing.length) {
    await enableDarrenWebMCP(db, webmcpSettings, existing[0].id);
    console.log("Demo profile already seeded.");
    return;
  }

  const [profile] = await db
    .insert(profiles)
    .values({
      handle: "darren",
      displayName: "Darren",
      headline: "AI · Safety · SaaS · Creator",
      bio:
        "I’m Darren, building a portfolio of projects at the intersection of AI, safety, and developer productivity.\n\nI’m open to thoughtful, relevant partnerships that create useful work for both audiences.",
      avatarUrl: "/assets/darren-avatar.png",
      isOpen: true,
      isPublished: true,
      isDemo: true,
      onboardingComplete: true,
    })
    .returning();

  await db.insert(profileProjects).values([
    {
      profileId: profile.id,
      name: "Agenticert",
      description: "AI agent security evaluations and certification.",
      category: "AI security",
      fitLabel: "Strong fit",
      tone: "emerald",
      sortOrder: 0,
    },
    {
      profileId: profile.id,
      name: "AI Safety Review",
      description: "Human-centred reviews of AI systems, tools, and models.",
      category: "Editorial",
      fitLabel: "Strong fit",
      tone: "ink",
      sortOrder: 1,
    },
  ]);

  const interestLabels = [
    "Sponsorships",
    "Research collaborations",
    "Creator partnerships",
    "Product partnerships",
    "AI industry partnerships",
    "Newsletter collaborations",
    "Tool integrations",
  ];
  const capabilityValues = [
    ["Audience", "AI builders"],
    ["Content", "Editorial"],
    ["Distribution", "Multi-channel"],
    ["Community", "Practitioners"],
    ["Expertise", "AI safety"],
    ["Research", "Independent"],
  ];
  const guidelines = [
    "Only genuine fits",
    "No overly sales-focused content",
    "Educational value preferred",
    "Strong audience relevance matters",
    "Mutual benefit is expected",
  ];

  await db.insert(profileItems).values([
    ...interestLabels.map((label, sortOrder) => ({
      profileId: profile.id,
      kind: "interest",
      label,
      sortOrder,
    })),
    ...capabilityValues.map(([label, detail], sortOrder) => ({
      profileId: profile.id,
      kind: "capability",
      label,
      detail,
      sortOrder,
    })),
    ...guidelines.map((label, sortOrder) => ({
      profileId: profile.id,
      kind: "guideline",
      label,
      sortOrder,
    })),
  ]);

  await db.insert(activationCapabilities).values([
    ["logo_exchange", "Logo exchange widget", "Easy to activate"],
    ["link_exchange", "Link exchange widget", "Easy to activate"],
    ["newsletter", "Newsletter spotlight", "Editorial review"],
    ["co_marketing", "Co-marketing ideas", "Built together"],
    ["social", "X / social concepts", "Useful, not salesy"],
  ].map(([typeKey, label, note], sortOrder) => ({
    profileId: profile.id,
    typeKey,
    status: typeKey === "logo_exchange" ? "coming_soon" : typeKey === "link_exchange" ? "beta" : "available",
    isAvailable: typeKey !== "logo_exchange",
    label,
    note,
    sortOrder,
  })));

  await db.insert(agentPublicSettings).values({
    profileId: profile.id,
    introduction:
      "I’ll learn what you do, look for genuine overlap, and suggest partnership ideas that create real value. If it’s not a strong fit, I’ll tell you.",
  });

  await db.insert(agentPrivateSettings).values({
    profileId: profile.id,
    tone: "Warm, intelligent, candid, and discerning",
    priorities:
      "Educational value, genuine audience overlap, complementary expertise, and balanced contribution.",
    thingsToAvoid:
      "Overtly promotional articles, disguised advertisements, spammy reciprocal links, and one-sided asks.",
    rejectionRules:
      "Reject partnerships with no credible audience or topical overlap, and proposals where value is materially one-sided.",
    privateEvaluationNotes:
      "Prefer one or two excellent ideas to a long list. Never expose these private notes verbatim.",
  });

  await enableDarrenWebMCP(db, webmcpSettings, profile.id);

  console.log("Seeded the Darren PartnerBird demo profile.");
}

async function enableDarrenWebMCP(
  db: ReturnType<typeof drizzle<typeof schema>>,
  table: typeof schema.webmcpSettings,
  profileId: string,
) {
  const values = {
    enabled: true,
    allowPublicProfileRead: true,
    allowDiscovery: true,
    allowMatching: true,
    allowSavePartners: true,
    allowCreateDrafts: true,
    allowSubmitRequests: true,
    allowIncomingRequests: true,
    requireVerifiedEmail: true,
    requireCompleteProfile: true,
    interestMatchMode: "prefer" as const,
    inboundStrictness: "strict" as const,
    updatedAt: new Date(),
  };
  await db.insert(table).values({ profileId, ...values }).onConflictDoUpdate({
    target: table.profileId,
    set: values,
  });
}

seed().catch((error) => {
  console.error(error instanceof Error ? error.message : "Seed failed.");
  process.exitCode = 1;
});
