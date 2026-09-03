import { defaultAgentSettings } from "@/lib/agent-defaults";
import type { ProfileThemePresetId } from "@/lib/profile-themes";

export type PublicProfile = {
  handle: string;
  displayName: string;
  headline: string;
  bio: string[];
  avatarUrl: string;
  websiteUrl?: string;
  socialLinks: Record<string, string>;
  isOpen: boolean;
  isDemo: boolean;
  appearance?: {
    accentPreset: ProfileThemePresetId;
    primaryColor: string | null;
    surfacePreset: string;
    cardPreset: string;
    density: string;
  };
  agentName: string;
  agentGreeting: string;
  agentIntroduction: string;
  interests: string[];
  capabilities: Array<{ label: string; detail: string }>;
  projects: Array<{
    name: string;
    description: string;
    fit: "Strong fit" | "Good fit";
    tone: "emerald" | "violet" | "indigo" | "ink";
  }>;
  guidelines: string[];
  activations: Array<{ label: string; note: string }>;
  metrics: Array<{ value: string; label: string }>;
  collaborations: Array<{
    left: string;
    right: string;
    fit: "Strong fit" | "Good fit";
    description: string;
    formats: string;
  }>;
};

export const demoProfile: PublicProfile = {
  handle: "darren",
  displayName: "Darren",
  headline: "AI · Safety · SaaS · Creator",
  bio: [
    "I’m Darren, building a portfolio of projects at the intersection of AI, safety, and developer productivity.",
    "I’m open to thoughtful, relevant partnerships that create useful work for both audiences.",
  ],
  avatarUrl: "/assets/darren-avatar.png",
  socialLinks: {},
  isOpen: true,
  isDemo: true,
  appearance: {
    accentPreset: "forest",
    primaryColor: null,
    surfacePreset: "clean",
    cardPreset: "soft",
    density: "comfortable",
  },
  agentName: "PartnerBird",
  agentGreeting: "Hi! I’m Darren’s PartnerBird.",
  agentIntroduction: defaultAgentSettings.introduction,
  interests: [
    "Sponsorships",
    "Research collaborations",
    "Creator partnerships",
    "Product partnerships",
    "AI industry partnerships",
    "Newsletter collaborations",
    "Tool integrations",
  ],
  capabilities: [
    { label: "Audience", detail: "AI builders" },
    { label: "Content", detail: "Editorial" },
    { label: "Distribution", detail: "Multi-channel" },
    { label: "Community", detail: "Practitioners" },
    { label: "Expertise", detail: "AI safety" },
    { label: "Research", detail: "Independent" },
  ],
  projects: [
    {
      name: "Agenticert",
      description: "AI agent security evaluations and certification.",
      fit: "Strong fit",
      tone: "emerald",
    },
    {
      name: "AI Safety Review",
      description: "Human-centred reviews of AI systems, tools, and models.",
      fit: "Strong fit",
      tone: "ink",
    },
  ],
  guidelines: [
    "Only genuine fits",
    "No overly sales-focused content",
    "Educational value preferred",
    "Strong audience relevance matters",
    "Mutual benefit is expected",
  ],
  activations: [
    { label: "Logo exchange widget", note: "Easy to activate" },
    { label: "Link exchange widget", note: "Easy to activate" },
    { label: "Newsletter spotlight", note: "Editorial review" },
    { label: "Co-marketing ideas", note: "Built together" },
    { label: "X / social concepts", note: "Useful, not salesy" },
  ],
  metrics: [
    { value: "43", label: "opportunities screened" },
    { value: "12", label: "strong fits" },
    { value: "6", label: "activations completed" },
  ],
  collaborations: [
    {
      left: "Agenticert",
      right: "Snyk",
      fit: "Strong fit",
      description: "AI agent security meets trusted developer security.",
      formats: "Article · Resources · X posts",
    },
    {
      left: "AI Safety Review",
      right: "Papers with Code",
      fit: "Good fit",
      description: "Research visibility for the AI safety community.",
      formats: "Newsletter · Resource exchange",
    },
    {
      left: "AI Safety Review",
      right: "LangChain",
      fit: "Good fit",
      description: "Tools and frameworks for safer AI applications.",
      formats: "X posts · Resource exchange",
    },
  ],
};
