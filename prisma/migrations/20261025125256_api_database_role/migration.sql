-- The API connects as a login user that is a member of hms_api. Migrations run as the role that owns
-- the tables (DIRECT_URL). hms_api owns nothing, so it cannot alter or drop tables, disable triggers
-- or truncate. See docs/decisions.md, "The API runs as a database role that owns nothing".

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hms_api') THEN
    CREATE ROLE hms_api NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO hms_api;

-- Read, insert and update everywhere. Rules on what may change are enforced by triggers.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO hms_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hms_api;

-- Tables created by later migrations get the same rights. This applies to tables the migration
-- role creates, which is every table.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO hms_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO hms_api;

-- Migration history is for the migration role only.
REVOKE ALL ON "_prisma_migrations" FROM hms_api;

-- Audit history is append only: insert and read, never change.
REVOKE UPDATE ON "audit_events", "login_events" FROM hms_api;

-- The only rows the API deletes: grants of a role being edited or synced, roles of a user being
-- edited, and an idempotency key freed after its handler failed. Every other DELETE is refused by
-- the missing privilege, before any trigger runs.
GRANT DELETE ON "role_permissions", "user_roles", "idempotency_keys" TO hms_api;
