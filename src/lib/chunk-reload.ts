/**
 * Recover from stale lazy-loaded chunks after a new deploy.
 *
 * When the server ships a new build, previously-loaded tabs still reference the
 * old hashed asset filenames. Navigating to a route that lazy-loads one of those
 * chunks produces a 404 and a dynamic-import failure. Reloading the page picks
 * up the new HTML (and therefore the new chunk hashes).
 *
 * We do a one-shot reload per session (guarded by sessionStorage) so a genuinely
 * broken deploy doesn't put the user in an infinite reload loop.
 */

const STORAGE_KEY = '__chunk_reload_attempted_at'
// Don't re-attempt a reload within this window; if the reload didn't fix it,
// the second navigation will surface the error normally.
const REATTEMPT_COOLDOWN_MS = 10_000

const DYNAMIC_IMPORT_ERROR_PATTERNS = [
	// Chromium
	'Failed to fetch dynamically imported module',
	// Safari
	'Importing a module script failed',
	// Firefox
	'error loading dynamically imported module',
	// Webpack-style (defensive; Vite uses native imports)
	'ChunkLoadError',
	'Loading chunk',
	'Loading CSS chunk',
]

function isChunkLoadError(value: unknown): boolean {
	if (!value) return false

	if (value instanceof Error) {
		if (value.name === 'ChunkLoadError') return true
		return DYNAMIC_IMPORT_ERROR_PATTERNS.some(pattern => value.message.includes(pattern))
	}

	if (typeof value === 'string') {
		return DYNAMIC_IMPORT_ERROR_PATTERNS.some(pattern => value.includes(pattern))
	}

	if (typeof value === 'object' && 'message' in value && typeof (value as { message: unknown }).message === 'string') {
		const message = (value as { message: string }).message
		return DYNAMIC_IMPORT_ERROR_PATTERNS.some(pattern => message.includes(pattern))
	}

	return false
}

function shouldAttemptReload(): boolean {
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY)
		if (!raw) return true
		const lastAttempt = Number(raw)
		if (!Number.isFinite(lastAttempt)) return true
		return Date.now() - lastAttempt > REATTEMPT_COOLDOWN_MS
	} catch {
		// sessionStorage can throw in private modes / sandboxed iframes; fall through.
		return true
	}
}

function markReloadAttempt(): void {
	try {
		sessionStorage.setItem(STORAGE_KEY, String(Date.now()))
	} catch {
		// Best-effort; if storage is unavailable we still reload once per tab load.
	}
}

let installed = false

export function setupChunkReloadHandler(): void {
	if (installed) return
	if (typeof window === 'undefined') return
	installed = true

	const recover = (error: unknown): void => {
		if (!isChunkLoadError(error)) return
		if (!shouldAttemptReload()) return
		markReloadAttempt()
		// Hard reload picks up the latest HTML and its new chunk hashes.
		window.location.reload()
	}

	window.addEventListener('error', event => {
		recover(event.error ?? event.message)
	})

	window.addEventListener('unhandledrejection', event => {
		recover(event.reason)
	})
}
