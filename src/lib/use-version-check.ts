import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { BUILD_INFO } from '@/lib/build-info'
import { isEmbeddedClient } from '@/lib/embedded'

// How often to ping /api/version while the tab is visible. The endpoint is
// trivial (no DB hit) so a 5-minute beat is fine; visibilitychange covers
// the long-tail "tab was backgrounded for hours" case.
const POLL_INTERVAL_MS = 5 * 60 * 1000
// Floor between checks to avoid hammering when the tab flickers
// visible/hidden rapidly (some OS-level focus events fire repeatedly).
const MIN_INTERVAL_BETWEEN_CHECKS_MS = 30 * 1000
// SessionStorage key: once the user dismisses the toast for a given server
// commit, don't nag again for the same one this tab session.
const DISMISSED_KEY = '__version_check_dismissed_commit'
// Sonner merges toasts by id; default `toast()` always appends, so repeated
// polls would stack. Use `toast.message()` + stable id instead.
const VERSION_TOAST_ID = '__version_check_toast'
// SessionStorage key: the server commit the embedded shell last reloaded
// itself for. One automatic reload per commit; if the mismatch survives it
// (deploy skew, a cached document), fall back to the toast instead of looping.
const AUTO_RELOADED_KEY = '__version_check_auto_reloaded_commit'

/** What started a check: the hook mounting, the page becoming visible, or the poll. */
export type VersionCheckTrigger = 'mount' | 'visible' | 'interval'

/**
 * What to do about a build mismatch.
 *
 * A browser tab always gets the toast: the user owns the reload. The iOS web
 * tab reloads itself, because that web view lives for days, has no browser
 * chrome to refresh with, and a dismissed toast would leave the old bundle
 * running against the new server. It only does so at a moment that cannot
 * interrupt anything: on mount or when the page comes back into view, never
 * on the poll while the user is looking at it, never mid-task, and at most
 * once per server commit.
 */
export function resolveMismatchAction(input: {
	embedded: boolean
	trigger: VersionCheckTrigger
	serverCommit: string
	autoReloadedCommit: string | null
	midTask: boolean
}): 'reload' | 'toast' {
	if (!input.embedded) return 'toast'
	if (input.trigger === 'interval') return 'toast'
	if (input.midTask) return 'toast'
	if (input.autoReloadedCommit === input.serverCommit) return 'toast'
	return 'reload'
}

interface VersionResponse {
	commit: string
	version: string
	buildTime: string
}

async function fetchServerVersion(signal: AbortSignal): Promise<VersionResponse | null> {
	try {
		const res = await fetch('/api/version', { cache: 'no-store', credentials: 'same-origin', signal })
		if (!res.ok) return null
		return (await res.json()) as VersionResponse
	} catch {
		return null
	}
}

function getDismissedCommit(): string | null {
	try {
		return sessionStorage.getItem(DISMISSED_KEY)
	} catch {
		return null
	}
}

function setDismissedCommit(commit: string): void {
	try {
		sessionStorage.setItem(DISMISSED_KEY, commit)
	} catch {
		// best-effort
	}
}

function getAutoReloadedCommit(): string | null {
	try {
		return sessionStorage.getItem(AUTO_RELOADED_KEY)
	} catch {
		return null
	}
}

// Returns false when the commit could not be recorded. Without the record
// nothing bounds the reloads, so the caller must not reload.
function recordAutoReload(commit: string): boolean {
	try {
		sessionStorage.setItem(AUTO_RELOADED_KEY, commit)
		return true
	} catch {
		return false
	}
}

// A reload would throw away an open dialog or whatever is being typed.
function isMidTask(): boolean {
	if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return true
	const active = document.activeElement
	if (!(active instanceof HTMLElement)) return false
	return active.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)
}

/**
 * Background poll for build-version mismatches.
 *
 * The client bundle bakes in the build commit at compile time
 * (BUILD_INFO.commit). After a deploy, a long-lived tab still runs the old
 * JS until something forces a reload. This hook compares the baked-in
 * commit against the server's current commit; on mismatch it raises a
 * non-blocking sonner toast with a "Refresh" action, or, in the iOS web
 * tab, reloads the page itself (see `resolveMismatchAction`).
 *
 * Disabled in dev builds (where BUILD_INFO.commit is empty) and on the
 * server (no window). Safe to call from any client component, but mount
 * once near the top of the authenticated tree.
 */
export function useVersionCheck(): void {
	// Guard so React strict-mode double-invocations don't double-poll.
	const installedRef = useRef(false)

	useEffect(() => {
		if (typeof window === 'undefined') return
		// In dev / unbuilt environments BUILD_INFO.commit is '' and there's
		// no meaningful comparison to make. Bail early.
		if (!BUILD_INFO.commit) return
		if (installedRef.current) return
		installedRef.current = true

		const clientCommit = BUILD_INFO.commit
		const aborter = new AbortController()
		let lastCheckAt = 0

		const check = async (trigger: VersionCheckTrigger): Promise<void> => {
			const now = Date.now()
			if (now - lastCheckAt < MIN_INTERVAL_BETWEEN_CHECKS_MS) return
			lastCheckAt = now

			// fetch will reject with AbortError if the controller fires; the
			// helper swallows that into null. Re-check the signal after the
			// await in case the unmount raced the fetch resolving normally.
			const server = await fetchServerVersion(aborter.signal)
			if (aborter.signal.aborted || !server) return
			if (!server.commit) return
			if (server.commit === clientCommit) return

			const action = resolveMismatchAction({
				embedded: isEmbeddedClient(),
				trigger,
				serverCommit: server.commit,
				autoReloadedCommit: getAutoReloadedCommit(),
				midTask: isMidTask(),
			})
			if (action === 'reload' && recordAutoReload(server.commit)) {
				window.location.reload()
				return
			}

			if (getDismissedCommit() === server.commit) return

			toast.message('A new version is available', {
				id: VERSION_TOAST_ID,
				description: 'Refresh to load the latest update.',
				duration: Number.POSITIVE_INFINITY,
				action: {
					label: 'Refresh',
					onClick: () => {
						window.location.reload()
					},
				},
				onDismiss: () => {
					setDismissedCommit(server.commit)
				},
				onAutoClose: () => {
					setDismissedCommit(server.commit)
				},
			})
		}

		// Initial check on mount, then a steady interval. Visibility change
		// covers the case where the tab was backgrounded long enough to miss
		// several intervals.
		void check('mount')
		const interval = window.setInterval(() => {
			void check('interval')
		}, POLL_INTERVAL_MS)

		const onVisibility = (): void => {
			if (document.visibilityState === 'visible') {
				void check('visible')
			}
		}
		document.addEventListener('visibilitychange', onVisibility)

		return () => {
			aborter.abort()
			window.clearInterval(interval)
			document.removeEventListener('visibilitychange', onVisibility)
		}
	}, [])
}
