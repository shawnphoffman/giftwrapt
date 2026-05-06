import { passkey } from '@better-auth/passkey'
import type { BetterAuthOptions } from 'better-auth'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, apiKey, customSession, genericOAuth, twoFactor } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { account, apikey, passkey as passkeyTable, rateLimit, session, twoFactor as twoFactorTable, users, verification } from '@/db/schema'
import { env } from '@/env'
import { createLogger } from '@/lib/logger'
import { sendPasswordResetEmail } from '@/lib/resend'
import type { OidcClientConfig } from '@/lib/settings'
import { getAppSettings } from '@/lib/settings-loader'

// Password-reset tokens issued by better-auth's `forgetPassword` API are
// good for this many minutes. Used both as the better-auth option and
// in the email body so the user-facing "good for N minutes" copy can't
// drift from reality.
const PASSWORD_RESET_TOKEN_TTL_MINUTES = 60

const trustedOrigins = env.TRUSTED_ORIGINS?.split(',')
	.map(o => o.trim())
	.filter(Boolean)

const authLog = createLogger('auth')

// Guard against accidentally booting an HTTPS deployment with the
// Secure-flag-disabled escape hatch on. INSECURE_COOKIES exists for
// HTTP-only LAN setups (browsers refuse to store Secure cookies on
// HTTP pages); it has no business being on once the server is reached
// via HTTPS, where it just makes session cookies stealable on a MITM.
// Refuse to start instead of silently shipping a misconfigured
// production. See sec-review M1.
const baseUrl = env.BETTER_AUTH_URL || env.SERVER_URL || ''
if (env.INSECURE_COOKIES && baseUrl.startsWith('https://')) {
	throw new Error(
		`INSECURE_COOKIES=true is set but ${env.BETTER_AUTH_URL ? 'BETTER_AUTH_URL' : 'SERVER_URL'} is HTTPS (${baseUrl}). Drop one of them; the Secure flag must be on for HTTPS deployments.`
	)
}
if (env.INSECURE_COOKIES) {
	authLog.warn('INSECURE_COOKIES=true: auth cookies will be sent without the Secure flag. Only safe for plain-HTTP dev / LAN deployments.')
}

// Map LOG_LEVEL to the narrower set better-auth accepts. 'fatal' collapses to
// 'error', 'trace' to 'debug', 'silent' disables entirely.
const betterAuthLevel: 'info' | 'warn' | 'error' | 'debug' | undefined =
	env.LOG_LEVEL === 'silent' ? undefined : env.LOG_LEVEL === 'fatal' ? 'error' : env.LOG_LEVEL === 'trace' ? 'debug' : env.LOG_LEVEL

// Load the admin-managed OIDC client config from `app_settings`
// before constructing the better-auth instance. Top-level await is
// load-bearing here: better-auth's `genericOAuth` plugin reads its
// provider list once at construction time, so the only way for an
// admin form save to take effect is a server restart (matches
// Audiobookshelf's "restart server after saving" semantics; the form
// surfaces this in a banner).
//
// Failure mode: if the DB read throws (cold deploy with empty
// app_settings, network blip, bad encryption key on `clientSecret`),
// fall back to "OIDC disabled" rather than crashing the whole auth
// stack. Operators can still sign in with email + password and fix
// the config from the admin UI.
async function loadOidcClientConfig(): Promise<OidcClientConfig | null> {
	try {
		const settings = await getAppSettings(db)
		const cfg = settings.oidcClient
		if (!cfg.enabled) return null
		if (!cfg.clientId || !cfg.clientSecret) return null
		const hasEndpoints = cfg.issuerUrl.length > 0 || (cfg.authorizationUrl.length > 0 && cfg.tokenUrl.length > 0)
		if (!hasEndpoints) return null
		return cfg
	} catch (err) {
		authLog.warn({ err }, 'OIDC client settings unreadable at boot; sign-in via OIDC disabled until next restart.')
		return null
	}
}

const oidcClientConfig = await loadOidcClientConfig()

/** Build the `genericOAuth` plugin args from the admin-managed config. */
function buildGenericOAuthPlugins(cfg: OidcClientConfig | null) {
	if (!cfg) return [] as const
	const scopes = cfg.scopes.length > 0 ? cfg.scopes : ['openid', 'email', 'profile']
	// Prefer explicit endpoints if all three are set; fall back to
	// constructing a discovery URL from the issuer otherwise.
	const explicitEndpoints = cfg.authorizationUrl.length > 0 && cfg.tokenUrl.length > 0
	const discoveryUrl =
		!explicitEndpoints && cfg.issuerUrl.length > 0 ? cfg.issuerUrl.replace(/\/+$/u, '') + '/.well-known/openid-configuration' : undefined
	return [
		genericOAuth({
			config: [
				{
					providerId: 'oidc',
					clientId: cfg.clientId,
					clientSecret: cfg.clientSecret,
					...(discoveryUrl ? { discoveryUrl } : {}),
					...(explicitEndpoints ? { authorizationUrl: cfg.authorizationUrl, tokenUrl: cfg.tokenUrl } : {}),
					...(cfg.userinfoUrl.length > 0 ? { userInfoUrl: cfg.userinfoUrl } : {}),
					scopes,
					pkce: true,
					disableSignUp: !cfg.autoRegister,
				},
			],
		}),
	] as const
}

const options = {
	baseURL: env.BETTER_AUTH_URL || env.SERVER_URL || 'http://localhost:3000',
	// Required by the env zod schema (`min(1)`); no `|| ''` fallback so a
	// future refactor that imports `auth` before env validation runs (or
	// strips the schema check) crashes loudly instead of silently booting
	// with an empty HMAC secret. See sec-review H7.
	secret: env.BETTER_AUTH_SECRET,
	// Pipe better-auth's internal logs into pino so auth warnings/errors show
	// up alongside the rest of the app output and honor LOG_LEVEL.
	logger: {
		disabled: env.LOG_LEVEL === 'silent',
		level: betterAuthLevel,
		log: (level: 'info' | 'warn' | 'error' | 'debug', message: string, ...args: Array<unknown>) => {
			authLog[level]({ args: args.length ? args : undefined }, message)
		},
	},
	...(trustedOrigins?.length ? { trustedOrigins } : {}),
	...(env.INSECURE_COOKIES ? { advanced: { useSecureCookies: false } } : {}),
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: {
			user: users,
			session: session,
			account: account,
			verification: verification,
			rateLimit: rateLimit,
			apikey: apikey,
			twoFactor: twoFactorTable,
			passkey: passkeyTable,
		},
	}),
	emailAndPassword: {
		enabled: true,
		// `sendResetPassword` is the hook better-auth calls when
		// `authClient.forgetPassword({ email })` succeeds. We hand
		// the user a tokenized URL pointing at our `/reset-password`
		// route which calls `authClient.resetPassword` to finish.
		// If the underlying email send is skipped because Resend
		// isn't configured, sendPasswordResetEmail logs and returns
		// null. The user-facing flow always reports "if an account
		// exists you'll receive an email" so the lack of email
		// doesn't leak account existence.
		sendResetPassword: async ({ user, url }) => {
			await sendPasswordResetEmail({
				name: user.name,
				recipient: user.email,
				resetUrl: url,
				expiresInMinutes: PASSWORD_RESET_TOKEN_TTL_MINUTES,
			})
		},
		resetPasswordTokenExpiresIn: PASSWORD_RESET_TOKEN_TTL_MINUTES * 60,
	},
	// CSRF posture (sec-review L6): better-auth defaults to
	// `sameSite: 'lax'`, `httpOnly: true`, `secure` (when HTTPS) on the
	// session cookie, and we don't override any of those. Cross-origin
	// POSTs strip the cookie -> the auth middleware refuses the call,
	// which is the entire CSRF defense for our server functions. Don't
	// enable `crossSubDomainCookies` or override cookie attributes
	// without revisiting the strategy in docs/contributing.md.
	//
	// Rate limit auth-related routes (sign-in, sign-up, password change,
	// session reads). Better-auth applies stricter caps to sensitive
	// endpoints automatically; this enables the framework's in-memory
	// limiter so that's effective. See sec-review H2.
	rateLimit: {
		enabled: true,
		// 'database' so the counter is shared across instances on
		// Vercel / Railway / Render. Memory storage was a footgun: the
		// per-instance counters mean a user gets a fresh budget on every
		// cold start, and on serverless that's effectively no limit at
		// all. The `rateLimit` table is provisioned in
		// `src/db/schema/auth.ts`.
		storage: 'database',
	},
	// First-admin bootstrap: if no admin exists yet, the next signup becomes one.
	// Covers the fresh-deploy case (empty DB) and also the recovery case where
	// an operator intentionally demotes/deletes every admin to rebootstrap.
	// There's a theoretical race if two users sign up simultaneously on a
	// zero-admin DB; not worth an advisory lock for this.
	databaseHooks: {
		user: {
			create: {
				before: async user => {
					const rows = await db
						.select({ c: sql<number>`count(*)::int` })
						.from(users)
						.where(sql`role = 'admin'`)
					const adminCount = rows[0]?.c ?? 0
					if (adminCount === 0) {
						return { data: { ...user, role: 'admin' } }
					}
					return { data: user }
				},
			},
		},
	},
	// `apiKey()` mints separately-scoped, individually revocable tokens
	// for the iOS companion app. Each device install gets its own key
	// (stored in Keychain on the device); revoking one key doesn't sign
	// the user out of the web. Crucially, this is *not* the bearer()
	// plugin: `bearer()` would accept the web's session cookie value as
	// an Authorization header, undermining the cookie's sameSite=lax
	// CSRF defense for any token leaked via any vector. apiKey keeps
	// the mobile token surface fully separate from the web cookie.
	//
	// The mobile API surface lives in a Hono app at `/api/mobile/*`
	// (see `src/server/mobile-api/app.ts`) which calls into better-auth
	// to validate keys; web flows here continue to use cookies via
	// `tanstackStartCookies()`.
	// Per-key rate limit overrides better-auth's plugin defaults (10
	// req/24h), which were far too tight for a chatty native client where
	// every mobile request also hits `verifyApiKey` + `getSession` in the
	// Hono auth middleware (2 increments per request). 300/min gives a
	// real user comfortable headroom while still throttling a runaway
	// client or scraping a leaked key. Note: only affects keys minted
	// after this change, the columns on existing rows were baked in at
	// creation time.
	plugins: [
		tanstackStartCookies(),
		admin(),
		apiKey({
			enableSessionForAPIKeys: true,
			rateLimit: {
				enabled: true,
				maxRequests: 300,
				timeWindow: 1000 * 60,
			},
		}),
		// TOTP-only 2FA. `skipVerificationOnEnable: false` (default)
		// means the user has to enter a valid TOTP once *during*
		// enrollment before `twoFactorEnabled` flips on, so a busted
		// authenticator app can't lock them out. Backup codes are
		// generated on enable; we surface them in the user settings
		// UI so the user can store them somewhere safe before signing
		// out.
		twoFactor({
			issuer: 'GiftWrapt',
		}),
		// WebAuthn / passkey. Add-on only; see sign-in / sign-up
		// pages: there is no passkey-first onboarding. `rpName` shows
		// up in the OS authenticator prompt; `rpID` defaults to the
		// hostname of `baseURL` (set above), which is what we want for
		// every deploy except local-dev where ngrok / lan IPs would
		// trip WebAuthn's same-origin check. Operators on those
		// setups should set BETTER_AUTH_URL to match the URL the
		// browser loads.
		passkey({
			rpName: 'GiftWrapt',
		}),
		// External OIDC sign-in. Loaded only when the admin form has
		// stored a fully-configured provider; otherwise the array is
		// empty and the plugin contributes nothing.
		...buildGenericOAuthPlugins(oidcClientConfig),
	],
	user: {
		modelName: 'user',
		fields: {
			// name: 'displayName',
		},
		additionalFields: {
			role: {
				type: 'string',
				required: true,
				input: true,
			},
			birthMonth: {
				type: 'string',
				required: false,
				input: true,
			},
			birthDay: {
				type: 'number',
				required: false,
				input: true,
			},
			birthYear: {
				type: 'number',
				required: false,
				input: true,
			},
			image: {
				type: 'string',
				required: false,
				input: true,
			},
			partnerId: {
				type: 'string',
				required: false,
				input: true,
			},
		},
	},
	session: {
		cookieCache: {
			enabled: true,
			// 24h upper bound on the encrypted session cookie. The DB
			// re-check on every authenticated request is handled by
			// `requireLiveUser` in src/middleware/auth.ts (10-min
			// per-instance TTL), so this is the worst-case staleness
			// window for an idle user's role / status before the
			// middleware path runs again. Was 7d before sec-review H8;
			// shorter caps the blast radius of a stolen-but-idle cookie
			// and of a recently demoted account that hasn't pinged the
			// server yet.
			maxAge: 60 * 60 * 24, // 24 hours
		},
	},
} satisfies BetterAuthOptions

export const auth = betterAuth({
	...options,
	plugins: [
		...options.plugins,
		// eslint-disable-next-line @typescript-eslint/require-await
		customSession(async ({ user, session: localSession }) => {
			return {
				user: {
					...user,
					isAdmin: user.role === 'admin',
					isChild: user.role === 'child',
				},
				session: localSession,
			}
		}, options),
	],
	user: {
		modelName: 'user',
		fields: {
			// name: 'displayName',
		},
		additionalFields: {
			role: {
				type: 'string',
				required: true,
				input: true,
			},
			birthMonth: {
				type: 'string',
				required: false,
				input: true,
			},
			birthDay: {
				type: 'number',
				required: false,
				input: true,
			},
			birthYear: {
				type: 'number',
				required: false,
				input: true,
			},
			image: {
				type: 'string',
				required: false,
				input: true,
			},
			partnerId: {
				type: 'string',
				required: false,
				input: true,
			},
		},
	},
	session: {
		// freshAge is intentionally left at 0: better-auth's password-
		// change flow requires the current password as a parameter, and
		// profile edits (name / birthday / partner) go through
		// `auth.api.updateUser` which would fail with "session expired"
		// for any non-admin user logged in for >freshAge. See sec-review
		// H8 for the assessment.
		freshAge: 0,
		cookieCache: {
			enabled: true,
			// Mirrors `options.session.cookieCache.maxAge` above; see
			// the explanation there. Both copies are merged by
			// customSession.
			maxAge: 60 * 60 * 24, // 24 hours
		},
	},
})
