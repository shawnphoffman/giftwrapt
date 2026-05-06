// Helpers for the better-auth cookie dance the mobile-api uses to
// chain `auth.api.*` calls server-side. Better-auth returns
// authentication state via `Set-Cookie` headers on its Response; the
// next call has to send those cookies back via `headers.cookie`.
//
// `mergeSetCookiesToCookieHeader` collects every Set-Cookie entry on
// a Response, strips per-cookie attributes (Path, HttpOnly, etc.),
// and returns a single `cookie:` request-header string.
//
// **Last-wins deduplication.** When the same cookie name is set
// multiple times on one response (e.g. `signInEmail` mints a session
// cookie and the `twoFactor` after-hook then deletes it), browsers
// honor the LAST `Set-Cookie` for that name. We mirror that behavior
// so the next `auth.api.*` call sees the same effective state. Without
// this, `verifyTOTP` would see the to-be-deleted session cookie *and*
// take the "existing session" branch instead of the 2FA-cookie path,
// silently breaking the mobile sign-in flow.

export function mergeSetCookiesToCookieHeader(res: Response): string {
	const headers = res.headers as unknown as { getSetCookie?: () => Array<string> } & Headers
	let list: Array<string>
	if (typeof headers.getSetCookie === 'function') {
		list = headers.getSetCookie()
	} else {
		// Fallback for runtimes without `getSetCookie()`. The
		// comma-split is fragile (cookie attributes can include commas
		// inside dates) but every reasonably-modern Node + undici we
		// run on exposes `getSetCookie`, so the path is unlikely to
		// trigger in practice.
		const single = res.headers.get('set-cookie')
		list = single ? single.split(',') : []
	}

	// Map to `name=value`, dropping attributes after the first `;`.
	// Empty entries are kept; better-auth uses empty values to delete
	// cookies (e.g. clearing the session cookie when 2FA is required),
	// and the next request still needs to see "this cookie is gone".
	const pairs: Array<{ name: string; value: string }> = []
	for (const sc of list) {
		const head = sc.split(';')[0]?.trim() ?? ''
		if (!head) continue
		const eq = head.indexOf('=')
		if (eq < 0) continue
		const name = head.slice(0, eq)
		const value = head.slice(eq + 1)
		if (!name) continue
		pairs.push({ name, value })
	}

	// Last-wins dedupe.
	const final = new Map<string, string>()
	for (const { name, value } of pairs) {
		final.set(name, value)
	}

	return Array.from(final.entries())
		.map(([name, value]) => `${name}=${value}`)
		.join('; ')
}
