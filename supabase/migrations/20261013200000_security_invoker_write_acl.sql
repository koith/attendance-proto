-- SEC-01: defense in depth for field-tested RPC-owned business tables.
-- Public/authenticated table grants were historically copied as full CRUD even
-- when table RLS had NO DML policy. Revoke all anonymous mutation grants,
-- then require an explicit RLS DML policy for authenticated direct writes.
-- Keep SELECT grants and SELECT policies unchanged for compatibility; preserve
-- store-scoped inventory_manual_items direct authenticated CRUD policy.
-- SECURITY DEFINER RPC owners and service_role have their own explicit grants.
-- No production rows, triggers, policies, PINs or RPC implementations change.
DO $security_acl$
DECLARE v_table record;
BEGIN
  FOR v_table IN
    SELECT n.nspname,c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity
    ORDER BY c.relname
  LOOP
    -- All POS and public employee operations use explicitly authorized RPCs.
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %I.%I FROM PUBLIC, anon',
      v_table.nspname,v_table.relname
    );
    -- Keep direct authenticated CRUD ONLY where an intentional RLS DML
    -- policy already exists (e.g., own-store inventory_manual_items).
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname=v_table.nspname AND p.tablename=v_table.relname
        AND p.cmd IN ('ALL','INSERT','UPDATE','DELETE')
    ) THEN
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %I.%I FROM authenticated',
        v_table.nspname,v_table.relname
      );
    END IF;
  END LOOP;
END
$security_acl$;
