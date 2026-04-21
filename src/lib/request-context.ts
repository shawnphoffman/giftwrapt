import { AsyncLocalStorage } from 'node:async_hooks'
import { nanoid } from 'nanoid'
import type { Logger } from 'pino'

import { logger } from './logger'

type RequestContext = {
	requestId: string
	userId?: string
	logger: Logger
}

const storage = new AsyncLocalStorage<RequestContext>()

export const getRequestContext = (): RequestContext | undefined => storage.getStore()

// Returns the scoped per-request logger if we're inside a request, otherwise
// falls back to the root logger. Call sites don't need to care which.
export const getRequestLogger = (): Logger => storage.getStore()?.logger ?? logger

// Mutate the current request's userId + re-derive the child logger. Used by
// auth middleware once a session is resolved so subsequent logs inside the
// same request carry { userId }.
export const setRequestUser = (userId: string): void => {
	const ctx = storage.getStore()
	if (!ctx) return
	ctx.userId = userId
	ctx.logger = ctx.logger.child({ userId })
}

// Run `fn` with a fresh request context. Honors an inbound x-request-id header
// so logs correlate across services/proxies; otherwise generates one.
export const runWithRequest = <T>(req: { headers: Headers } | Request, fn: () => T | Promise<T>): T | Promise<T> => {
	const inboundId = req.headers.get('x-request-id')
	const requestId = inboundId && inboundId.length <= 128 ? inboundId : nanoid(12)
	const ctx: RequestContext = {
		requestId,
		logger: logger.child({ requestId }),
	}
	return storage.run(ctx, fn)
}
