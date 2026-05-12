// Aliased in place of `@/lib/request-context` for Storybook.
//
// The real module instantiates Node's `AsyncLocalStorage` at module-init time,
// which Vite externalizes to a browser stub that doesn't export the symbol -
// the build fails to resolve `AsyncLocalStorage` and the whole graph aborts.
// Stories never run inside a request, so a no-op stub is fine: any code
// reading the context just sees "no active request" and falls back to its
// default logger.

import type { Logger } from 'pino'

import { logger } from '@/lib/logger'

type RequestContext = {
	requestId: string
	userId?: string
	logger: Logger
}

export const getRequestContext = (): RequestContext | undefined => undefined
export const getRequestLogger = (): Logger => logger
export const setRequestUser = (_userId: string): void => undefined
export const runWithRequest = <T>(_req: { headers: Headers } | Request, fn: () => T | Promise<T>): T | Promise<T> => fn()
