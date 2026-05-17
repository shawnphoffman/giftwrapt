import { useCallback, useEffect, useRef, useState } from 'react'

import type { ScrapeResult } from './scrapers/types'
import { resizeImageForUpload } from './storage/client-resize'

// Single-shot photo → ScrapeResult hook, parallel to `useScrapeUrl` but
// for the vision flow. Posts a multipart `file` field to
// `/api/scrape/photo` and surfaces the parsed result (or an error
// message) via a small state machine the add-item dialog can observe.

export type ExtractPhotoPhase = 'idle' | 'extracting' | 'done' | 'failed'

export type ExtractPhotoState = {
	phase: ExtractPhotoPhase
	result?: ScrapeResult
	ms?: number
	error?: string
	startedAt?: number
	elapsedMs: number
}

const initialState: ExtractPhotoState = { phase: 'idle', elapsedMs: 0 }

export function useExtractPhoto(): {
	state: ExtractPhotoState
	start: (file: File) => Promise<void>
	cancel: () => void
	reset: () => void
} {
	const [state, setState] = useState<ExtractPhotoState>(initialState)
	const abortRef = useRef<AbortController | null>(null)
	const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
	const startedAtRef = useRef<number>(0)

	const stopTicker = useCallback(() => {
		if (tickRef.current !== null) {
			clearInterval(tickRef.current)
			tickRef.current = null
		}
	}, [])

	const cancel = useCallback(() => {
		if (abortRef.current) {
			abortRef.current.abort()
			abortRef.current = null
		}
		stopTicker()
		setState(prev => {
			if (prev.phase === 'idle' || prev.phase === 'done' || prev.phase === 'failed') return prev
			return { ...prev, phase: 'failed', error: 'cancelled' }
		})
	}, [stopTicker])

	const reset = useCallback(() => {
		cancel()
		setState(initialState)
	}, [cancel])

	const start = useCallback(
		async (file: File) => {
			cancel()
			const controller = new AbortController()
			abortRef.current = controller
			startedAtRef.current = Date.now()
			setState({ phase: 'extracting', elapsedMs: 0, startedAt: startedAtRef.current })
			tickRef.current = setInterval(() => {
				setState(prev => {
					if (prev.phase !== 'extracting') return prev
					return { ...prev, elapsedMs: Date.now() - startedAtRef.current }
				})
			}, 250)

			let upload: File
			try {
				// Pre-shrink so we stay under the function-runtime payload cap.
				// Server validates magic bytes regardless.
				upload = await resizeImageForUpload(file)
			} catch (err) {
				stopTicker()
				abortRef.current = null
				setState({
					phase: 'failed',
					elapsedMs: Date.now() - startedAtRef.current,
					error: err instanceof Error ? err.message : 'resize failed',
				})
				return
			}

			const formData = new FormData()
			formData.append('file', upload)

			try {
				const response = await fetch('/api/scrape/photo', {
					method: 'POST',
					body: formData,
					signal: controller.signal,
				})
				if (!response.ok) {
					let message = response.statusText
					try {
						const body = (await response.json()) as { error?: string; message?: string }
						message = body.message || body.error || message
					} catch {
						// non-JSON body; fall through with statusText
					}
					stopTicker()
					abortRef.current = null
					setState({
						phase: 'failed',
						elapsedMs: Date.now() - startedAtRef.current,
						error: message,
					})
					return
				}
				const body = (await response.json()) as { result: ScrapeResult; ms: number }
				stopTicker()
				abortRef.current = null
				setState({
					phase: 'done',
					result: body.result,
					ms: body.ms,
					elapsedMs: Date.now() - startedAtRef.current,
				})
			} catch (err) {
				stopTicker()
				abortRef.current = null
				if (err instanceof DOMException && err.name === 'AbortError') {
					setState({
						phase: 'failed',
						elapsedMs: Date.now() - startedAtRef.current,
						error: 'cancelled',
					})
					return
				}
				setState({
					phase: 'failed',
					elapsedMs: Date.now() - startedAtRef.current,
					error: err instanceof Error ? err.message : 'extract failed',
				})
			}
		},
		[cancel, stopTicker]
	)

	useEffect(() => {
		return () => {
			if (abortRef.current) abortRef.current.abort()
			stopTicker()
		}
	}, [stopTicker])

	return { state, start, cancel, reset }
}
