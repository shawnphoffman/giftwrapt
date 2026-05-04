import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const env = createEnv({
	server: {
		SERVER_URL: z.url().optional(),
		// PORT: z.number().optional(),
		DATABASE_URL: z.url(),
		BETTER_AUTH_SECRET: z.string().min(1),
		BETTER_AUTH_URL: z.url().optional(),
		// Comma-separated list of additional origins that auth requests are
		// allowed from (e.g. "http://192.168.1.137:3888,http://other.lan:3888").
		// BETTER_AUTH_URL is always trusted; this is for self-hosters who reach
		// the same instance via multiple hostnames.
		TRUSTED_ORIGINS: z.string().min(1).optional(),
		// Force-disable the Secure flag on auth cookies. Only set this if you
		// need plain-HTTP origins (LAN IPs, .local hostnames) to log in.
		// Browsers refuse to store Secure cookies set from an HTTP page, so
		// without this the HTTP origin can pass the CSRF check but never
		// receives a session cookie.
		INSECURE_COOKIES: z.stringbool().optional(),
		//
		RESEND_API_KEY: z.string().min(1).optional(),
		RESEND_FROM_EMAIL: z.email().optional(),
		RESEND_FROM_NAME: z.string().optional(),
		RESEND_BCC_ADDRESS: z.email().optional(),
		// AI provider. Three families are supported via the Vercel AI SDK:
		// - openai: OpenAI's hosted API (baseUrl ignored).
		// - anthropic: Anthropic's hosted API (baseUrl ignored).
		// - openai-compatible: any OpenAI-shape endpoint (OpenRouter, Groq,
		//   Together, Mistral, DeepSeek, Ollama, LM Studio, vLLM, etc.) -
		//   AI_BASE_URL is required in that case.
		// Admin can configure all of these through the UI when env vars aren't set.
		AI_PROVIDER_TYPE: z.enum(['openai', 'openai-compatible', 'anthropic']).optional(),
		AI_BASE_URL: z.url().optional(),
		AI_API_KEY: z.string().min(1).optional(),
		AI_MODEL: z.string().min(1).optional(),
		AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1).max(64_000).optional(),
		// Cron job authentication. Optional (cron handlers fail-closed and
		// return 503 when unset), but if set must be a meaningful secret.
		// Compared against the `Authorization: Bearer ...` header in
		// `src/routes/api/cron/_auth.ts` with a timing-safe comparison.
		CRON_SECRET: z.string().min(32).optional(),
		// URL scraping (legacy first-boot seeds). Scrape providers are now
		// configured under /admin/scraping and stored in app_settings; these
		// env vars exist as a one-shot seed for self-hosters upgrading from
		// the env-only setup. On the first boot after upgrading, if no
		// browserless/flaresolverr entry exists yet AND the env var is set,
		// `src/db/bootstrap.ts` inserts a corresponding entry. After that
		// the admin owns the configuration and these env vars are unused.
		// See _NOTES_/scraping/browserless-plan.md for the self-host stack.
		BROWSERLESS_URL: z.url().optional(),
		FLARESOLVERR_URL: z.url().optional(),
		BROWSER_TOKEN: z.string().min(1).optional(),
		// Logging. LOG_LEVEL can be changed at runtime (e.g. in docker-compose)
		// without a rebuild. LOG_PRETTY forces human-readable output even in
		// prod; otherwise it defaults to NODE_ENV !== 'production'.
		LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
		LOG_PRETTY: z.stringbool().optional(),
		// Object storage (S3-compatible). All five are optional; when any is
		// missing the app boots without image uploads (banner in-app, 503 on
		// upload endpoints, no-op cleanups). Set all five to enable. Works with
		// Garage (local + self-host), AWS S3, Cloudflare R2, Supabase Storage's
		// S3 API, any other S3-compat vendor. See docs/storage.md for
		// deployment recipes.
		STORAGE_ENDPOINT: z.url().optional(),
		STORAGE_REGION: z.string().min(1).optional(),
		STORAGE_BUCKET: z.string().min(1).optional(),
		STORAGE_ACCESS_KEY_ID: z.string().min(1).optional(),
		STORAGE_SECRET_ACCESS_KEY: z.string().min(1).optional(),
		// Garage requires path-style (bucket is in the URL path, not the
		// subdomain); AWS/R2 want virtual-host style. Set `true` for Garage
		// and most self-host setups, `false` for AWS/R2.
		STORAGE_FORCE_PATH_STYLE: z.stringbool().default(false),
		// Base URL clients should fetch from (e.g. https://cdn.example.com).
		// When unset, the app serves through /api/files/<key>; Vercel operators
		// should set this to avoid per-image function invocations, self-host
		// operators can leave it unset unless they've exposed their bucket on
		// the public internet.
		STORAGE_PUBLIC_URL: z.url().optional(),
		// Max upload size in MB, enforced before Sharp runs. Generous default
		// for phone photos; operators can tighten if function memory is tight.
		STORAGE_MAX_UPLOAD_MB: z.coerce.number().int().positive().default(8),
	},

	/**
	 * The prefix that client-side variables must have. This is enforced both at
	 * a type-level and at runtime.
	 */
	clientPrefix: 'VITE_',

	client: {
		VITE_SERVER_URL: z.url().optional(),
	},

	/**
	 * What object holds the environment variables at runtime.
	 * For server-side vars, use process.env (loaded by dotenv from .env.local)
	 * For client-side vars, use import.meta.env (loaded by Vite)
	 */
	runtimeEnv: {
		...process.env,
		...import.meta.env,
		// Fallbacks for one-click deploy targets that inject differently-named
		// env vars. The Vercel + Supabase Marketplace integration injects
		// POSTGRES_URL (pooled) and SUPABASE_URL but no STORAGE_ENDPOINT; this
		// lets the app pick those up without the user renaming anything.
		DATABASE_URL: process.env.DATABASE_URL ?? process.env.POSTGRES_URL,
		STORAGE_ENDPOINT:
			process.env.STORAGE_ENDPOINT ??
			(process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/s3` : undefined),
		// On Vercel production, derive BETTER_AUTH_URL from the auto-injected
		// production hostname so first-deploy sign-up doesn't 'Invalid origin'.
		// Production-only: preview deploys live on per-branch hostnames and
		// would mismatch the production URL; users can set BETTER_AUTH_URL
		// explicitly (or extend TRUSTED_ORIGINS) if they want auth on previews.
		BETTER_AUTH_URL:
			process.env.BETTER_AUTH_URL ??
			(process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL
				? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
				: undefined),
	},

	/**
	 * By default, this library will feed the environment variables directly to
	 * the Zod validator.
	 *
	 * This means that if you have an empty string for a value that is supposed
	 * to be a number (e.g. `PORT=` in a ".env" file), Zod will incorrectly flag
	 * it as a type mismatch violation. Additionally, if you have an empty string
	 * for a value that is supposed to be a string with a default value (e.g.
	 * `DOMAIN=` in an ".env" file), the default value will never be applied.
	 *
	 * In order to solve these issues, we recommend that all new projects
	 * explicitly specify this option as true.
	 */
	emptyStringAsUndefined: true,
})
