/**
 * Aliased in place of `@/lib/use-scrape-url` for Storybook.
 *
 * The real hook streams from `/api/scrape/stream`, which doesn't exist in
 * Storybook. Stories script the hook through the `scrape` parameter (see
 * `.storybook/preview.tsx`):
 *
 *   parameters: { scrape: { initial?: ScrapeUiState, onStart?: ScrapeUiState } }
 *
 * `initial` is the state on mount (default idle); `onStart` is the state the
 * hook jumps to when the component calls `start()` (default: stay put).
 */

import { useCallback, useState } from 'react'

import type { ScrapeUiState, StartOptions } from '../../src/lib/use-scrape-url'

export type { ScrapeUiState, StartOptions }

const idle: ScrapeUiState = { phase: 'idle', providers: [], providerNames: {}, elapsedMs: 0 }

type ScrapeScript = { initial?: ScrapeUiState; onStart?: ScrapeUiState }

let script: ScrapeScript = {}

export function __setStorybookScrape(next: ScrapeScript | undefined) {
	script = next ?? {}
}

export function useScrapeUrl(): {
	state: ScrapeUiState
	start: (url: string, opts?: StartOptions) => void
	cancel: () => void
	reset: () => void
} {
	const [state, setState] = useState<ScrapeUiState>(script.initial ?? idle)
	// Stable identities, like the real hook's useCallbacks. Callers list these
	// in effect deps (e.g. a closed dialog calls cancel() in an effect), so a
	// fresh function per render would loop forever.
	const start = useCallback((_url: string, _opts?: StartOptions) => {
		if (script.onStart) setState(script.onStart)
	}, [])
	const cancel = useCallback(() => setState(idle), [])
	return { state, start, cancel, reset: cancel }
}
