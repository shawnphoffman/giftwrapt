-- Give every grouped item a position. Items added to a group by hand got none until someone used the arrows, and the claim gate skips members without one, so "in order" groups went unenforced. Unplaced members go after the placed ones, by id, which is the order the list already shows them in.
UPDATE "items" i
SET "group_sort_order" = s.pos
FROM (
	SELECT
		x."id",
		COALESCE((SELECT MAX(m."group_sort_order") FROM "items" m WHERE m."group_id" = x."group_id"), -1)
			+ ROW_NUMBER() OVER (PARTITION BY x."group_id" ORDER BY x."id") AS pos
	FROM "items" x
	WHERE x."group_id" IS NOT NULL AND x."group_sort_order" IS NULL
) s
WHERE i."id" = s."id";
