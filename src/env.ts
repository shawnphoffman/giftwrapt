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
		AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1).max(32_000).optional(),
		// Cron job authentication
		CRON_SECRET: z.string().min(1).optional(),
		// URL scraping. Both providers are optional; the built-in fetch
		// provider is always on. browserless renders JS-heavy pages,
		// flaresolverr bypasses Cloudflare challenges. See
		// _NOTES_/scraping/browserless-plan.md for a self-host stack.
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
		VITE_APP_TITLE: z.string().min(1).default('Wish Lists'),
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
