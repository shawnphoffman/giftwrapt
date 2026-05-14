// Only allow same-origin paths to prevent open-redirect via the `redirect`
// search param. Reject protocol-relative (`//evil.com`), absolute URLs, and
// backslash tricks. Reject TanStack Start internal paths (`/_serverFn`, etc.)
// so post-auth navigation can't land on a server-fn endpoint and render raw
// seroval data instead of a page. Falls back to `/` for anything malformed.
//
// Shared by every sign-in / re-auth flow that takes a `redirect` query
// param ([src/routes/(auth)/sign-in.tsx], [sign-in.two-factor.tsx], etc.).
// Update behavior here, not in any caller.
export function safeRedirect(raw: unknown): string {
	if (typeof raw !== 'string') return '/'
	if (raw.length === 0 || raw.length > 2000) return '/'
	if (!raw.startsWith('/')) return '/'
	if (raw.startsWith('//') || raw.startsWith('/\\')) return '/'
	if (raw.startsWith('/_')) return '/'
	try {
		const parsed = new URL(raw, 'http://placeholder.invalid')
		if (parsed.origin !== 'http://placeholder.invalid') return '/'
	} catch {
		return '/'
	}
	return raw
}
