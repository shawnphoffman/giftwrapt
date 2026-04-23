import { createMiddleware } from '@tanstack/react-start'
import pino, { type Logger, type LoggerOptions } from 'pino'

import { env } from '@/env'

import { getRequestLogger } from './request-context'

// Root logger. Structured NDJSON in prod; pretty-printed in dev (or when
// LOG_PRETTY=true is set explicitly). Level is driven by LOG_LEVEL so it can
// be flipped at runtime via env without a rebuild.
//
// This module is reachable from the client bundle (server-fn files reference
// loggingMiddleware by name). Accessing server-only env keys at module top
// would trip the t3 env proxy on the client and crash the whole bundle, so
// gate every env read on `typeof window === 'undefined'`.
const isServer = typeof window === 'undefined'
const isProd = process.env.NODE_ENV === 'production'
const prettyEnabled = isServer ? (env.LOG_PRETTY ?? !isProd) : false

const baseOptions: LoggerOptions = {
	level: isServer ? env.LOG_LEVEL : 'silent',
	base: {
		service: 'wish-lists',
		env: process.env.NODE_ENV ?? 'development',
	},
	// Redact common secret-bearing fields so we never leak tokens/cookies even
	// if something is logged whole-object by accident.
	redact: {
		paths: [
			'password',
			'*.password',
			'token',
			'*.token',
			'authorization',
			'*.authorization',
			'cookie',
			'*.cookie',
			'headers.authorization',
			'headers.cookie',
			'req.headers.authorization',
			'req.headers.cookie',
		],
		censor: '[redacted]',
	},
	timestamp: pino.stdTimeFunctions.isoTime,
}

export const logger: Logger = prettyEnabled
	? pino({
			...baseOptions,
			transport: {
				target: 'pino-pretty',
				options: {
					colorize: true,
					translateTime: 'HH:MM:ss.l',
					ignore: 'pid,hostname,service,env',
					singleLine: true,
				},
			},
		})
	: pino(baseOptions)

export const createLogger = (scope: string, bindings: Record<string, unknown> = {}): Logger => logger.child({ scope, ...bindings })

// TanStack middleware that wraps every server function invocation with a
// scoped child logger, entry/exit debug lines, and error capture. Errors are
// logged then rethrown so normal control flow is preserved.
//
// Usage:
//   .middleware([authMiddleware, loggingMiddleware])
//
// The scope is generic ("server-fn") since TanStack doesn't hand the middleware
// the server fn's name. The Nitro access log + error hook covers endpoint
// identification from the HTTP side; here we mainly care about duration +
// exceptions bubbling through handlers.
export const loggingMiddleware = createMiddleware().server(async ({ next }) => {
	const log = getRequestLogger().child({ scope: 'server-fn' })
	const start = Date.now()
	log.debug('server fn start')
	try {
		const result = await next()
		log.debug({ durationMs: Date.now() - start }, 'server fn done')
		return result
	} catch (err) {
		// Redirects in TanStack are thrown as Response-like objects; don't log
		// them as errors. Anything else is a real failure.
		if (err instanceof Response || (err && typeof err === 'object' && 'isRedirect' in err)) {
			log.debug({ durationMs: Date.now() - start }, 'server fn redirected')
			throw err
		}
		log.error({ err, durationMs: Date.now() - start }, 'server fn error')
		throw err
	}
})
