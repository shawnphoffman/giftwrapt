// Aliased in place of `@tanstack/start-storage-context` for Storybook.
//
// The real module imports `AsyncLocalStorage` from `node:async_hooks`, which
// Vite externalizes to a browser stub - and that stub doesn't export
// `AsyncLocalStorage`, so the rollup graph fails to resolve the symbol and
// the whole Storybook build aborts. The module is pulled in transitively
// from anything that imports `@tanstack/react-start` (server fns,
// middleware factories) even though the stories never actually invoke a
// handler. Stub the two exports as no-ops so the graph stays consistent.

export function runWithStartContext<T>(_context: unknown, fn: () => T | Promise<T>): Promise<T> {
	return Promise.resolve(fn())
}

export function getStartContext(opts?: { throwIfNotFound?: boolean }): undefined {
	if (opts?.throwIfNotFound === false) return undefined
	// In real code this throws when no context is active; in stories there is
	// never an active context, but components that read it always pass
	// `{ throwIfNotFound: false }`, so the throw path shouldn't be hit. Throw
	// loudly anyway so a missing storybook stub is obvious.
	throw new Error('getStartContext stub called without throwIfNotFound:false (storybook)')
}
