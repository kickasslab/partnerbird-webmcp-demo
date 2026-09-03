INSERT INTO "webmcp_settings" (
  "profile_id",
  "enabled",
  "allow_public_profile_read",
  "allow_discovery",
  "allow_matching"
)
SELECT
  "id",
  true,
  true,
  true,
  true
FROM "profiles"
WHERE lower("handle") = 'darren'
  AND "is_demo" = true
ON CONFLICT ("profile_id") DO UPDATE SET
  "enabled" = true,
  "allow_public_profile_read" = true,
  "allow_discovery" = true,
  "allow_matching" = true,
  "updated_at" = now();
