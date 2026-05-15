/**
 * Asserts that `src/db/schema/**` and `drizzle/**` agree. Fails the build if
 * someone edited a schema source file without running `pnpm db:generate` and
 * committing the resulting migration + snapshot.
 *
 * The "drift" we care about is the other half of the migrate/push split:
 *   - migrate-only DBs trust __drizzle_migrations; if the source schema has
 *     drifted ahead of the committed migrations, prod migrations will run
 *     fine but the DB shape will lag the application code.
 *   - schema source files are the developer's reading comprehension surface;
 *     if the SQL diverges from them, future generators produce inscrutable
 *     diffs (or worse, generate a migration that contradicts an earlier one).
 *
 * Strategy: run `drizzle-kit generate` against a clean working tree. If the
 * tool emits any new files under drizzle/ or modifies _journal.json, that
 * means the schema source has changed since the last migration was committed.
 * Always restore drizzle/ to HEAD on exit so re-running the script is safe.
 *
 * Required pre-state: drizzle/ must be clean WRT git (no staged or unstaged
 * changes). The script refuses to run otherwise — a dirty tree would make
 * the post-generate diff meaningless.
 */

import { execSync } from 'node:child_process'

function run(cmd: string, opts: { capture?: boolean } = {}): string {
	if (opts.capture) {
		return execSync(cmd, { encoding: 'utf8' }).toString()
	}
	execSync(cmd, { stdio: 'inherit' })
	return ''
}

function drizzleStatus(): string {
	return run('git status --porcelain -- drizzle/', { capture: true }).trim()
}

function restoreDrizzle(): void {
	// Discard any working-tree changes under drizzle/ and remove any untracked
	// files drizzle-kit generated. Scoped to drizzle/ so unrelated edits in the
	// rest of the working tree are untouched.
	run('git checkout -- drizzle/')
	run('git clean -fd -- drizzle/')
}

const pre = drizzleStatus()
if (pre) {
	console.error('drizzle/ has uncommitted changes; refusing to run drift check.\n')
	console.error(pre)
	process.exit(2)
}

try {
	console.log('Running drizzle-kit generate to detect schema drift...')
	run('pnpm db:generate')
	const post = drizzleStatus()
	if (post) {
		console.error(
			'\nSchema drift detected: `drizzle-kit generate` produced new or modified files.\n' +
				'This means src/db/schema/** has diverged from the committed migrations.\n\n' +
				'Fix: run `pnpm db:generate` locally, review the generated migration, and commit it ' +
				'alongside your schema change.\n\n' +
				'Files affected:'
		)
		console.error(post)
		process.exit(1)
	}
	console.log('No schema drift detected.')
} finally {
	restoreDrizzle()
}
