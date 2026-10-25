-- Supabase lockdown: the app uses Supabase only as plain PostgreSQL through Prisma (CLAUDE.md
-- section 3), so the roles behind Supabase's REST and GraphQL APIs get no access to the app's tables.
-- Run in the SQL editor of each project (staging and production) as `postgres`, after the first
-- migration and again after any migration that adds a schema. Safe to run more than once.
-- Turn the Data API off in the dashboard as well (docs/runbooks/supabase.md).

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON SCHEMA public FROM anon, authenticated;

-- Tables created later by migrations (run as postgres) get no grants for these roles either.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- Functions are executable by PUBLIC by default, which anon and authenticated inherit. Triggers
-- still fire. A restricted API role (go-live checklist stage 4) needs explicit EXECUTE grants for
-- any function it calls directly.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Check: both queries must return no rows. (USAGE on the schema itself comes from PUBLIC and gives
-- nothing without table or function privileges.)
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'PUBLIC');

SELECT p.proname AS function_name, r.rolname AS grantee
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN pg_roles r
WHERE n.nspname = 'public'
  AND r.rolname IN ('anon', 'authenticated')
  AND has_function_privilege(r.rolname, p.oid, 'EXECUTE');
