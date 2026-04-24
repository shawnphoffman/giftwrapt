/**
 * V1 → V2 list_type migration script.
 *
 * The V1 schema stored `lists.type` as a plain `text` column with a default
 * of 'wishlist'. The V2 schema uses a `list_type` Postgres enum with values:
 *
 *   wishlist | christmas | birthday | giftideas | todos | test
 *
 * This script:
 *   1. Checks whether the column is still `text` (V1) or already `list_type` (V2).
 *   2. If text → normalizes free-text values into valid enum values, then
 *      converts the column to use the enum.
 *   3. If already enum → no-op.
 *
 * Run BEFORE `pnpm db:migrate` when upgrading a V1 database to V2 schema.
 *
 *   DATABASE_URL=... tsx scripts/migrate-v1-list-types.ts
 *
 * Safe to run multiple times (idempotent).
 */

import { config } from 'dotenv'
import pg from 'pg'

config()

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
	console.error('DATABASE_URL is required')
	process.exit(1)
}

const pool = new pg.Pool({ connectionString: DATABASE_URL })

// ===============================
// V1 → V2 value mapping
// ===============================
// Left side: known V1 free-text values (case-insensitive).
// Right side: the canonical V2 enum value.
const VALUE_MAP: Record<string, string> = {
	wishlist: 'wishlist',
	wish_list: 'wishlist',
	'wish list': 'wishlist',
	christmas: 'christmas',
	xmas: 'christmas',
	birthday: 'birthday',
	giftideas: 'giftideas',
	gift_ideas: 'giftideas',
	'gift ideas': 'giftideas',
	todos: 'todos',
	todo: 'todos',
	test: 'test',
}

const DEFAULT_VALUE = 'wishlist'

async function main() {
	console.log('Checking lists.type column type...')

	// Check current column type.
	const colInfo = await pool.query(`
		SELECT data_type, udt_name
		FROM information_schema.columns
		WHERE table_name = 'lists' AND column_name = 'type'
	`)

	if (colInfo.rows.length === 0) {
		console.log('No lists.type column found - nothing to migrate.')
		return
	}

	const { data_type, udt_name } = colInfo.rows[0]

	if (udt_name === 'list_type') {
		console.log('Column already uses list_type enum - nothing to do.')
		return
	}

	if (data_type !== 'text' && data_type !== 'character varying') {
		console.log(`Unexpected column type: ${data_type} (${udt_name}). Aborting.`)
		process.exit(1)
	}

	console.log(`Column is ${data_type}. Migrating V1 → V2 values...`)

	// Ensure the list_type enum exists.
	await pool.query(`
		DO $$ BEGIN
			CREATE TYPE list_type AS ENUM ('wishlist', 'christmas', 'birthday', 'giftideas', 'todos', 'test');
		EXCEPTION
			WHEN duplicate_object THEN NULL;
		END $$;
	`)

	// Normalize values.
	const distinctValues = await pool.query('SELECT DISTINCT type FROM lists')
	const unknowns: Array<string> = []

	for (const row of distinctValues.rows) {
		const raw = (row.type ?? '').toString().toLowerCase().trim()
		const mapped = VALUE_MAP[raw]
		if (!mapped && raw) {
			unknowns.push(raw)
		}
	}

	if (unknowns.length > 0) {
		console.log(`Found unknown V1 values that will map to '${DEFAULT_VALUE}': ${unknowns.join(', ')}`)
	}

	// Apply the mapping. Each known value gets its canonical form; everything
	// else (including NULL and empty) gets the default.
	for (const [v1, v2] of Object.entries(VALUE_MAP)) {
		await pool.query('UPDATE lists SET type = $1 WHERE LOWER(TRIM(type)) = $2', [v2, v1])
	}
	// Catch-all for NULLs, empties, and unrecognized values.
	await pool.query(
		`UPDATE lists SET type = $1 WHERE type IS NULL OR TRIM(type) = '' OR type NOT IN ('wishlist', 'christmas', 'birthday', 'giftideas', 'todos', 'test')`,
		[DEFAULT_VALUE]
	)

	// Convert the column to use the enum.
	await pool.query('ALTER TABLE lists ALTER COLUMN type TYPE list_type USING type::list_type')
	await pool.query(`ALTER TABLE lists ALTER COLUMN type SET DEFAULT 'wishlist'::list_type`)

	// Verify.
	const check = await pool.query(`
		SELECT data_type, udt_name
		FROM information_schema.columns
		WHERE table_name = 'lists' AND column_name = 'type'
	`)
	console.log(`Done. Column is now: ${check.rows[0].udt_name}`)

	const counts = await pool.query('SELECT type, COUNT(*) AS n FROM lists GROUP BY type ORDER BY type')
	console.log('Value distribution:')
	for (const row of counts.rows) {
		console.log(`  ${row.type}: ${row.n}`)
	}
}

main()
	.catch(err => {
		console.error('Migration failed:', err)
		process.exit(1)
	})
	.finally(() => pool.end())
