// Client-side navigation perf instrumentation, gated on `VITE_PERF_DEBUG`.
//
// In production builds without the flag, every export here is a no-op so we
// pay nothing. Read once at module load; flipping the env var requires a
// dev server restart.

const enabled =
	typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_PERF_DEBUG === 'true'

export const perfEnabled = enabled

export function perfLog(label: string, payload?: Record<string, unknown>) {
	if (!enabled) return
	if (payload) {
		console.log(`[perf] ${label}`, payload)
	} else {
		console.log(`[perf] ${label}`)
	}
}

export function perfMark(name: string) {
	if (!enabled) return
	performance.mark(`perf:${name}`)
}

export async function perfTime<T>(label: string, fn: () => Promise<T>): Promise<T> {
	if (!enabled) return fn()
	const t0 = performance.now()
	try {
		return await fn()
	} finally {
		const dt = performance.now() - t0
		console.log(`[perf] ${label} ${dt.toFixed(1)}ms`)
	}
}
