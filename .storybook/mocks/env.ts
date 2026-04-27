/**
 * Aliased in place of `@/env` for Storybook.
 *
 * The real `@/env` uses `@t3-oss/env-core` which imports `dotenv` and runs
 * validation at module load. In the browser it mostly works but pulls in
 * server dependencies we don't need. This stub exposes only what client
 * code reads.
 */
export const env = {
	VITE_APP_TITLE: 'GiftWrapt',
	VITE_SERVER_URL: 'http://localhost:3000',
}
