-- restrict_violation (23001) is also the code for ON DELETE RESTRICT foreign keys, so Prisma reported
-- these rejections as "Foreign key constraint violated" and dropped the message. insufficient_privilege
-- (42501) says what happened: nobody may run this, and Prisma passes the message through.
CREATE OR REPLACE FUNCTION "reject_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
