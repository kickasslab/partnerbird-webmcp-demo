import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  getOnAccentColor,
  getProfilePrimaryHoverColor,
  getProfileThemeVariables,
  normalizeProfilePrimaryColor,
  profileThemePresetIds,
  profileThemePresets,
  resolveProfileTheme,
} from "@/lib/profile-themes";

describe("profile themes", () => {
  it("exposes six distinct, accessible preset colors", () => {
    expect(profileThemePresets).toHaveLength(6);
    expect(new Set(profileThemePresetIds).size).toBe(6);
    expect(new Set(profileThemePresets.map((preset) => preset.primary)).size).toBe(6);

    for (const preset of profileThemePresets) {
      expect(normalizeProfilePrimaryColor(preset.primary)).toBe(preset.primary);
      const foreground = getOnAccentColor(preset.primary);
      const hover = getProfilePrimaryHoverColor(preset.primary);
      expect(contrastRatio(preset.primary, foreground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(hover, foreground)).toBeGreaterThanOrEqual(4.5);
      expect(hover).not.toBe(preset.primary);
    }
  });

  it("keeps one accessible foreground across primary and hover custom colors", () => {
    const channelValues = [0, 16, 48, 96, 112, 116, 117, 118, 119, 160, 208, 240, 254, 255];

    for (const red of channelValues) {
      for (const green of channelValues) {
        for (const blue of channelValues) {
          const primary = `#${[red, green, blue]
            .map((channel) => channel.toString(16).padStart(2, "0"))
            .join("")}`;
          const theme = resolveProfileTheme("forest", primary);
          expect(contrastRatio(theme.primary, theme.onAccent)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(theme.primaryHover, theme.onAccent)).toBeGreaterThanOrEqual(4.5);
          expect(theme.primaryHover).toMatch(/^#[0-9A-F]{6}$/);
          expect(theme.primaryHover).not.toBe(theme.primary);
        }
      }
    }
  });

  it("normalizes safe six-digit colors and rejects CSS payloads", () => {
    expect(normalizeProfilePrimaryColor("  #2563eb ")).toBe("#2563EB");
    expect(normalizeProfilePrimaryColor("#abc")).toBeNull();
    expect(normalizeProfilePrimaryColor("#2563EBCC")).toBeNull();
    expect(normalizeProfilePrimaryColor("red")).toBeNull();
    expect(normalizeProfilePrimaryColor("#fff; color: red")).toBeNull();
  });

  it("uses a valid custom color without losing its preset fallback", () => {
    const custom = resolveProfileTheme("ocean", "#2563eb");
    expect(custom.preset.id).toBe("ocean");
    expect(custom.primary).toBe("#2563EB");
    expect(custom.isCustom).toBe(true);

    const fallback = resolveProfileTheme("unknown", "not-a-color");
    expect(fallback.preset.id).toBe("forest");
    expect(fallback.primary).toBe("#168D4A");
    expect(fallback.isCustom).toBe(false);
  });

  it("returns the variables consumed by the profile and bird mark", () => {
    expect(getProfileThemeVariables("plum", "#2563EB")).toEqual({
      "--profile-primary": "#2563EB",
      "--profile-primary-hover": "#1F53C5",
      "--profile-on-accent": "#FFFFFF",
      "--brand-mark-color": "#2563EB",
    });
  });
});
