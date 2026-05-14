-- Hoist `mobileRedirectUris` out of the `oidcClient` settings blob
-- and into its own top-level `mobileApp` settings row. The whitelist
-- gates BOTH passkey and OIDC begin endpoints on the mobile API; it
-- isn't OIDC-specific. Living under the OIDC editor made it invisible
-- to admins who never configure OIDC, silently disabling passkey on
-- canonical-iOS-app deployments.
--
-- Backfill behavior: fresh deployments (and pre-existing rows with an
-- empty URI list) get the canonical iOS app's scheme
-- `wishlists://oauth` so passkey works out of the box. Admins who had
-- a non-empty list keep it verbatim. Admins who genuinely want the
-- list empty can re-empty via the new admin UI after the migration;
-- the "default-empty" and "deliberately-empty" states were
-- indistinguishable before this change, so we side with the
-- "passkey-on-by-default" behavior the new schema promises.
--
-- Idempotent on re-run: ON CONFLICT DO NOTHING means the second pass
-- won't overwrite an admin's later edits, and the second statement is
-- a no-op once `mobileRedirectUris` has been stripped from
-- `oidcClient`.
--
-- Rollback: copy `mobileApp.redirectUris` back under
-- `oidcClient.mobileRedirectUris`, then drop the `mobileApp` row:
--   UPDATE app_settings AS o
--   SET value = jsonb_set(o.value, '{mobileRedirectUris}',
--     (SELECT value->'redirectUris' FROM app_settings WHERE key = 'mobileApp'))
--   WHERE o.key = 'oidcClient';
--   DELETE FROM app_settings WHERE key = 'mobileApp';

INSERT INTO "app_settings" ("key", "value")
SELECT
	'mobileApp',
	jsonb_build_object(
		'redirectUris',
		CASE
			WHEN o.value ? 'mobileRedirectUris'
				AND jsonb_typeof(o.value->'mobileRedirectUris') = 'array'
				AND jsonb_array_length(o.value->'mobileRedirectUris') > 0
			THEN o.value->'mobileRedirectUris'
			ELSE '["wishlists://oauth"]'::jsonb
		END
	)
FROM (
	SELECT value FROM "app_settings" WHERE "key" = 'oidcClient'
	UNION ALL
	SELECT '{}'::jsonb WHERE NOT EXISTS (SELECT 1 FROM "app_settings" WHERE "key" = 'oidcClient')
) AS o
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
UPDATE "app_settings"
SET "value" = value - 'mobileRedirectUris'
WHERE "key" = 'oidcClient'
	AND value ? 'mobileRedirectUris';
