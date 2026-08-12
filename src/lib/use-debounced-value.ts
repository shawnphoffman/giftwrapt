import { useEffect, useState } from 'react'

/**
 * Trailing-edge debounce of a value.
 *
 * Returns `value` immediately on first render, then follows it only after
 * `delayMs` has passed with no further change. Use it to keep an input
 * controlled (so keystrokes paint instantly) while the expensive work it drives
 * - a server round trip, a heavy filter - runs on the settled value.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value)

	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs)
		return () => clearTimeout(timer)
	}, [value, delayMs])

	return debounced
}
