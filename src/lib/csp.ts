// Content-Security-Policy for every response, built once at server start
// (server/plugins/security-headers.ts) from the runtime environment. It used
// to be baked into the build by vite.config.ts, which meant a prebuilt image
// (the published Docker image) could never allow the operator's Sentry
// origin: setting SENTRY_DSN and restarting left connect-src at 'self' and
// the browser SDK was blocked.

export type CspInput = {
	// Sentry-compatible error reporting is opt-in (default off). When set, the
	// browser SDK has to reach the DSN's origin (sentry.io, a self-hosted
	// Glitchtip, an operator-run proxy), so it is appended to connect-src.
	// Without it the policy is the strict default. The admin toggle
	// (`enableSentry`) can still kill emission without changing the policy.
	sentryDsn?: string
	// The Vercel preview overlay (live comments / toolbar) is the only
	// third-party script we ever load, and Vercel injects it only on preview
	// deploys: never on production, never on self-host. Its origins are
	// allowlisted only when VERCEL_ENV is 'preview'; everyone else gets the
	// tighter 'self'-only posture. SRI is moot for the same reason: there is no
	// third-party origin to hash on production or self-host, and Vercel rotates
	// its preview script per deploy. See docs/security/2026-05-checklist-audit.md
	// item 46.
	vercelEnv?: string
}

function originOf(url: string | undefined): string | undefined {
	if (!url) return undefined
	try {
		return new URL(url).origin
	} catch {
		// Malformed DSN: leave connect-src untouched. src/env.ts validation
		// reports the parse error.
		return undefined
	}
}

export function buildContentSecurityPolicy({ sentryDsn, vercelEnv }: CspInput): string {
	const isVercelPreview = vercelEnv === 'preview'
	const sentryOrigin = originOf(sentryDsn)

	const scriptSrc = ["'self'", "'unsafe-inline'", ...(isVercelPreview ? ['https://vercel.live'] : [])]
	const connectSrc = [
		"'self'",
		...(isVercelPreview ? ['https://vercel.live', 'wss://ws-us3.pusher.com'] : []),
		...(sentryOrigin ? [sentryOrigin] : []),
	]

	return [
		"default-src 'self'",
		// `'unsafe-eval'` was previously needed by the `qrcode` client lib
		// loaded on /settings/security for 2FA enrollment. QR rendering moved
		// server-side (see `src/api/totp-qr.ts`) so the dep no longer reaches
		// the client bundle. If a future TanStack/wasm dep reintroduces
		// `Function()`/`eval()` in the bundle and the app stalls with a CSP
		// error in the browser console, re-add `'unsafe-eval'` here as a
		// short-term unblock and file a TODO to track down the source.
		`script-src ${scriptSrc.join(' ')}`,
		"style-src 'self' 'unsafe-inline'",
		// `blob:` covers `URL.createObjectURL(file)` previews for client-picked
		// images: avatar cropper, add-item Upload Image, item-edit photo, and
		// the /admin/photo extract tester. Chromium does NOT treat blob: as
		// matching `'self'` for non-network schemes, so it has to be listed
		// explicitly. Same-origin only by construction (only same-origin JS
		// can call createObjectURL), so the attack surface is essentially zero.
		"img-src 'self' data: blob: https:",
		"font-src 'self' data:",
		`connect-src ${connectSrc.join(' ')}`,
		`frame-src ${isVercelPreview ? 'https://vercel.live' : "'none'"}`,
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
	].join('; ')
}
