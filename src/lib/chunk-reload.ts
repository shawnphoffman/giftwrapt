/**
 * Recover from stale lazy-loaded chunks after a new deploy.
 *
 * When the server ships a new build, previously-loaded tabs still reference the
 * old hashed asset filenames. Navigating to a route that lazy-loads one of those
 * chunks produces a 404 and a dynamic-import failure. Reloading the page picks
 * up the new HTML (and therefore the new chunk hashes).
 *
 * Two surfaces drive recovery:
 *   1. The global `error` / `unhandledrejection` listeners installed here catch
 *      chunk failures that bubble to `window` (preload links, non-router dynamic
 *      imports, event handlers).
 *   2. The error-boundary fallbacks call `attemptChunkReload()` directly, because
 *      TanStack Router awaits a matched route's dynamic import and *handles* the
 *      rejection itself - so it never reaches `window` and only surfaces through
 *      the router's `errorComponent`.
 *
 * Reloads are bounded (see `consumeReloadBudget`) so a genuinely broken deploy
 * can't trap the user in an infinite reload loop.
 */

const STORAGE_KEY = '__chunk_reload_state'
// At most this many reloads within WINDOW_MS. A rolling deploy / CDN propagation
// can need a couple of tries seconds apart; past this we give up and let the real
// error surface rather than loop forever.
const MAX_RELOADS = 5
const WINDOW_MS = 30_000

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

export function isChunkLoadError(value: unknown): boolean {
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

interface ReloadState {
	count: number
	firstAt: number
}

function readState(): ReloadState | null {
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY)
		if (!raw) return null
		const parsed = JSON.parse(raw) as Partial<ReloadState> | null
		if (!parsed || typeof parsed.count !== 'number' || typeof parsed.firstAt !== 'number') return null
		return { count: parsed.count, firstAt: parsed.firstAt }
	} catch {
		// sessionStorage can throw in private modes / sandboxed iframes, or the
		// value could be malformed. Treat as "no prior attempt".
		return null
	}
}

function writeState(state: ReloadState): void {
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
	} catch {
		// Best-effort; if storage is unavailable we still reload (a successful
		// reload normally fixes the stale chunk anyway).
	}
}

/**
 * Decide whether a reload is allowed and, if so, record it. Bounded to at most
 * MAX_RELOADS reloads within WINDOW_MS; a stale window (older than WINDOW_MS)
 * resets the counter, treating it as a fresh incident rather than a loop.
 */
function consumeReloadBudget(): boolean {
	const now = Date.now()
	const state = readState()
	if (!state || now - state.firstAt > WINDOW_MS) {
		writeState({ count: 1, firstAt: now })
		return true
	}
	if (state.count >= MAX_RELOADS) return false
	writeState({ count: state.count + 1, firstAt: state.firstAt })
	return true
}

/**
 * Attempt a guarded hard reload to pick up the latest HTML and its new chunk
 * hashes. Returns true if a reload was initiated, false if we're out of budget
 * (so callers can fall through to showing the real error) or running on the
 * server.
 */
export function attemptChunkReload(): boolean {
	if (typeof window === 'undefined') return false
	if (!consumeReloadBudget()) return false
	window.location.reload()
	return true
}

let installed = false

export function setupChunkReloadHandler(): void {
	if (installed) return
	if (typeof window === 'undefined') return
	installed = true

	const recover = (error: unknown): void => {
		if (!isChunkLoadError(error)) return
		attemptChunkReload()
	}

	window.addEventListener('error', event => {
		recover(event.error ?? event.message)
	})

	window.addEventListener('unhandledrejection', event => {
		recover(event.reason)
	})
}
