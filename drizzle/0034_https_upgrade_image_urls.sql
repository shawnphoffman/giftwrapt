-- Backfill: rewrite any legacy `http://` image URLs to `https://` so
-- they stop tripping the CSP `img-src 'self' data: https:` directive.
-- Application code now upgrades on write (httpsUpgrade in
-- src/lib/image-url.ts) and on render, but historical rows still hold
-- the raw http:// values returned by scrapes pre-upgrade.
--
-- Scope:
--   - items.image_url (single text)
--   - item_scrapes.image_urls (text[], order-preserved via WITH ORDINALITY)
--
-- users.image / dependents.image are uploaded to internal storage or
-- come from OAuth providers (both already https), so they're skipped.

UPDATE "items"
SET "image_url" = 'https://' || substring("image_url" FROM 8)
WHERE "image_url" LIKE 'http://%';

UPDATE "item_scrapes"
SET "image_urls" = (
	SELECT array_agg(
		CASE WHEN u LIKE 'http://%' THEN 'https://' || substring(u FROM 8) ELSE u END
		ORDER BY ord
	)
	FROM unnest("image_urls") WITH ORDINALITY AS t(u, ord)
)
WHERE "image_urls" IS NOT NULL
	AND EXISTS (SELECT 1 FROM unnest("image_urls") AS u WHERE u LIKE 'http://%');
