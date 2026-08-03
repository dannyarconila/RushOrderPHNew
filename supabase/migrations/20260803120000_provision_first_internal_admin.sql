-- Provision the first internal-portal administrator for a fresh deployment.
-- Authentication remains in src/lib/admin/auth.server.ts: PBKDF2 credentials
-- in public.admin_accounts, read only by the server-side service-role client.
-- The temporary credential must be replaced by the mandatory setup screen on
-- first login; no plaintext password is stored in this migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.admin_accounts
    WHERE is_active = true AND role = 'super_admin'
  ) THEN
    INSERT INTO public.admin_accounts (
      username,
      password_hash,
      role,
      is_active,
      is_default_credentials,
      must_change_credentials,
      failed_attempts,
      locked_until
    )
    VALUES (
      'RushOrderAdmin',
      'pbkdf2$100000$24cced297352dd55d8536000de0ea5d3$dbf2ec88db88e89f3a47bb3576ebe6d9336329931dd053bac2c4fddc909efeea',
      'super_admin',
      true,
      false,
      true,
      0,
      NULL
    );

    INSERT INTO public.admin_audit_logs (
      admin_username,
      action,
      entity_type,
      details
    )
    VALUES (
      'RushOrderAdmin',
      'initial_admin_provisioned',
      'admin_accounts',
      jsonb_build_object('must_change_credentials', true)
    );
  END IF;
END;
$$;
