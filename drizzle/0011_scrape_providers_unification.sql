-- Lift the legacy `scrapeCustomHttpProviders` JSONB array under
-- `scrapeProviders`, tagging each entry with `type: 'custom-http'`. The
-- new shape is a discriminated union covering all configurable providers
-- (browserless / flaresolverr / browserbase-fetch / browserbase-stagehand /
-- custom-http); existing custom-http entries become the first wave of
-- entries under the new key. Built-in providers (browserless / flaresolverr)
-- get seeded from env on first boot via src/db/bootstrap.ts.
--
-- Idempotent on re-run: ON CONFLICT DO NOTHING means a second pass after
-- success is a no-op. The DELETE only fires when an old row exists.
--
-- Rollback: copy `scrapeProviders` back into `scrapeCustomHttpProviders`
-- with the `type` field stripped:
--   INSERT INTO app_settings (key, value)
--   SELECT 'scrapeCustomHttpProviders',
--     (SELECT jsonb_agg(elem - 'type') FROM jsonb_array_elements(value) AS elem
--      WHERE elem->>'type' = 'custom-http')
--   FROM app_settings WHERE key = 'scrapeProviders';
--   DELETE FROM app_settings WHERE key = 'scrapeProviders';

INSERT INTO "app_settings" ("key", "value")
SELECT
	'scrapeProviders',
	COALESCE(
		(
			SELECT jsonb_agg(jsonb_set(elem, '{type}', '"custom-http"'::jsonb))
			FROM jsonb_array_elements(value) AS elem
		),
		'[]'::jsonb
	)
FROM "app_settings"
WHERE "key" = 'scrapeCustomHttpProviders'
	AND jsonb_typeof(value) = 'array'
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
DELETE FROM "app_settings" WHERE "key" = 'scrapeCustomHttpProviders';
