export const profileThemePresetIds = [
  "forest",
  "jade",
  "ocean",
  "cobalt",
  "plum",
  "coral",
] as const;

export type ProfileThemePresetId = (typeof profileThemePresetIds)[number];

export type ProfileThemePreset = {
  id: ProfileThemePresetId;
  label: string;
  description: string;
  primary: `#${string}`;
};

export const profileThemePresets: readonly ProfileThemePreset[] = [
  {
    id: "forest",
    label: "Partner Green",
    description: "Grounded, familiar, and distinctly PartnerBird.",
    primary: "#168D4A",
  },
  {
    id: "jade",
    label: "Jade",
    description: "Fresh and modern with a polished founder feel.",
    primary: "#079A68",
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Clear, calm, and quietly trustworthy.",
    primary: "#2479A9",
  },
  {
    id: "cobalt",
    label: "Cobalt",
    description: "Confident and precise for technical profiles.",
    primary: "#4B63C6",
  },
  {
    id: "plum",
    label: "Plum",
    description: "Thoughtful and creative without feeling playful.",
    primary: "#8060A6",
  },
  {
    id: "coral",
    label: "Coral",
    description: "Warm, personable, and made to feel inviting.",
    primary: "#C85D4A",
  },
] as const;

const presetById = new Map(
  profileThemePresets.map((preset) => [preset.id, preset] as const),
);

export function isProfileThemePresetId(value: unknown): value is ProfileThemePresetId {
  return typeof value === "string" && presetById.has(value as ProfileThemePresetId);
}

export function getProfileThemePreset(value: unknown): ProfileThemePreset {
  return presetById.get(
    isProfileThemePresetId(value) ? value : "forest",
  ) ?? profileThemePresets[0];
}

export function normalizeProfilePrimaryColor(value: unknown): `#${string}` | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(normalized)
    ? (normalized as `#${string}`)
    : null;
}

function channelToLinear(channel: number) {
  const srgb = channel / 255;
  return srgb <= 0.04045
    ? srgb / 12.92
    : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: string) {
  const normalized = normalizeProfilePrimaryColor(color);
  if (!normalized) return 0;
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return (
    0.2126 * channelToLinear(red) +
    0.7152 * channelToLinear(green) +
    0.0722 * channelToLinear(blue)
  );
}

export function contrastRatio(first: string, second: string) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getOnAccentColor(primary: string): "#000000" | "#FFFFFF" {
  return contrastRatio(primary, "#FFFFFF") >= contrastRatio(primary, "#000000")
    ? "#FFFFFF"
    : "#000000";
}

const actionHoverMix = 0.16;
const minimumActionContrast = 4.5;

function mixHexColors(
  primary: `#${string}`,
  target: "#000000" | "#FFFFFF",
): `#${string}` {
  const channels = [1, 3, 5].map((offset) => {
    const start = Number.parseInt(primary.slice(offset, offset + 2), 16);
    const end = Number.parseInt(target.slice(offset, offset + 2), 16);
    return Math.round(start + (end - start) * actionHoverMix)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${channels.join("")}`.toUpperCase() as `#${string}`;
}

function deriveProfilePrimaryHover(
  primary: `#${string}`,
  onAccent: "#000000" | "#FFFFFF",
): `#${string}` {
  // Moving away from the foreground increases contrast. The alternate handles
  // near-black/near-white colors whose preferred mix rounds to the same hex.
  const contrastTarget = onAccent === "#FFFFFF" ? "#000000" : "#FFFFFF";
  const preferred = mixHexColors(primary, contrastTarget);
  if (
    preferred !== primary &&
    contrastRatio(preferred, onAccent) >= minimumActionContrast
  ) {
    return preferred;
  }

  const alternate = mixHexColors(primary, onAccent);
  return alternate !== primary &&
    contrastRatio(alternate, onAccent) >= minimumActionContrast
    ? alternate
    : primary;
}

export function getProfilePrimaryHoverColor(primary: unknown): `#${string}` {
  const normalized =
    normalizeProfilePrimaryColor(primary) ?? profileThemePresets[0].primary;
  return deriveProfilePrimaryHover(normalized, getOnAccentColor(normalized));
}

export function resolveProfileTheme(
  accentPreset: unknown,
  primaryColor?: unknown,
) {
  const preset = getProfileThemePreset(accentPreset);
  const customPrimary = normalizeProfilePrimaryColor(primaryColor);
  const primary = customPrimary ?? preset.primary;
  const onAccent = getOnAccentColor(primary);

  return {
    preset,
    primary,
    primaryHover: deriveProfilePrimaryHover(primary, onAccent),
    onAccent,
    isCustom: Boolean(customPrimary),
  } as const;
}

export function getProfileThemeVariables(
  accentPreset: unknown,
  primaryColor?: unknown,
) {
  const theme = resolveProfileTheme(accentPreset, primaryColor);
  return {
    "--profile-primary": theme.primary,
    "--profile-primary-hover": theme.primaryHover,
    "--profile-on-accent": theme.onAccent,
    "--brand-mark-color": theme.primary,
  } as const;
}
