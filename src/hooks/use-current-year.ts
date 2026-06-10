import { useState } from 'react'

// Current calendar year, computed once on mount via a lazy state initializer.
// Keeping `new Date()` out of the render body avoids the time-in-render
// hydration/purity smell, and unlike a useEffect it never leaves a
// date-bounded input's `max` unset on first paint (the initializer runs
// synchronously). The only theoretical hydration mismatch is rendering across
// the New Year instant, which is acceptable for a year `max` bound.
export function useCurrentYear(): number {
	const [year] = useState(() => new Date().getFullYear())
	return year
}
