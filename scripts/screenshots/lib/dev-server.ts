/**
 * Dev-server health check.
 *
 * The screenshot script doesn't try to spawn `pnpm dev` itself — booting a
 * Vite dev server with DB migrations from inside another tsx process is
 * fragile, and the user almost always has one running already. We just
 * verify the URL is reachable and bail with a helpful error if not.
 */

export async function waitForServer(url: string, timeoutMs = 5000): Promise<void> {
	const target = new URL(url)
	const start = Date.now()
	let lastErr: unknown

	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(target, { redirect: 'manual' })
			if (res.status < 500) return
			lastErr = new Error(`HTTP ${res.status}`)
		} catch (err) {
			lastErr = err
		}
		await new Promise(r => setTimeout(r, 250))
	}

	throw new Error(
		`Dev server at ${url} did not respond within ${timeoutMs}ms. ` +
			`Start it with \`pnpm dev\` in another terminal, then re-run.\n` +
			`Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
	)
}
