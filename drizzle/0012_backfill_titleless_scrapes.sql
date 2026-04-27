-- Backfill: bring historical `item_scrapes` rows in line with the
-- orchestrator's new minimum-signal gate (introduced alongside this
-- migration). The gate treats any extracted result without a non-empty
-- `title` as an `invalid_response` failure, persisting `ok = false,
-- error_code = 'invalid_response', score = NULL`. Rows persisted before
-- the gate shipped could land as `ok = true, score = 0` with a null or
-- empty title; this migration retro-corrects them so /admin/scrapes
-- and any analytics that count `ok` as a win don't over-count empties.
--
-- Scope: rows currently `ok = true` whose title is null or whitespace-
-- only. Already-failed rows are untouched. The `response` JSONB column
-- (raw provider output) is left intact for debugging.
--
-- No clean reversal: the original `ok = true` was inferred state, not a
-- recoverable column.

UPDATE "item_scrapes"
SET
	"ok" = false,
	"error_code" = 'invalid_response',
	"score" = NULL
WHERE "ok" = true
	AND ("title" IS NULL OR length(trim("title")) = 0);
