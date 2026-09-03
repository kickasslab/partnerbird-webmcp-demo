DELETE FROM "profile_projects"
WHERE "profile_id" IN (
  SELECT "id"
  FROM "profiles"
  WHERE "handle" = 'darren' AND "is_demo" = true
)
AND lower("name") IN ('vibecodingjam', 'aizarro');
