UPDATE "activation_capabilities"
SET "status" = CASE
  WHEN "type_key" = 'logo_exchange' THEN 'coming_soon'
  WHEN "type_key" = 'link_exchange' THEN 'beta'
  ELSE 'available'
END,
"is_available" = CASE
  WHEN "type_key" = 'logo_exchange' THEN false
  ELSE true
END,
"updated_at" = now();
--> statement-breakpoint
ALTER TABLE "activation_capabilities"
  ADD CONSTRAINT "activation_capabilities_status_check"
  CHECK ("status" IN ('available', 'beta', 'coming_soon')) NOT VALID;
--> statement-breakpoint
ALTER TABLE "activation_capabilities"
  VALIDATE CONSTRAINT "activation_capabilities_status_check";
