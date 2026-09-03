ALTER TABLE "appearance_settings" ADD COLUMN "primary_color" varchar(7);
--> statement-breakpoint
ALTER TABLE "appearance_settings"
  ADD CONSTRAINT "appearance_settings_primary_color_check"
  CHECK (
    "primary_color" IS NULL OR
    "primary_color" ~ '^#[0-9A-Fa-f]{6}$'
  ) NOT VALID;
--> statement-breakpoint
ALTER TABLE "appearance_settings"
  VALIDATE CONSTRAINT "appearance_settings_primary_color_check";
--> statement-breakpoint
ALTER TABLE "appearance_settings"
  ADD CONSTRAINT "appearance_settings_accent_preset_check"
  CHECK (
    "accent_preset" IN ('forest', 'jade', 'ocean', 'cobalt', 'plum', 'coral')
  ) NOT VALID;
--> statement-breakpoint
ALTER TABLE "appearance_settings"
  VALIDATE CONSTRAINT "appearance_settings_accent_preset_check";
