// Shared bearer-token check for /api/cron/* routes. See sec-review C3.
//
// `CRON_SECRET` is optional in the env schema (so dev environments
// without a scheduler don't need to set it), but if it's unset we
// fail-closed instead of leaving the endpoints publicly callable.
// Without that the operator could deploy with `CRON_SECRET` simply
// missing from the env, and any anonymous visitor could trigger
// `auto-archive` (mass-archive items, prematurely revealing claims to
// recipients) or `birthday-emails` (spam mailbox abuse / Resend quota
// burn).

import { timingSafeEqual } from 'node:crypto'

import { json } from '@tanstack/react-start'
import type { Logger } from 'pino'

import { env } from '@/env'

/**
 * Returns a 401/503 `Response` if the request isn't authorized to invoke
 * a cron endpoint, or `null` to let the handler continue.
 *
 * Behavior:
 *   - `CRON_SECRET` unset: returns 503 ("cron-not-configured"). The
 *     operator must set the secret to enable cron handlers.
 *   - Header missing or wrong shape: 401.
 *   - Header present but doesn't match the secret (timing-safe compare):
 *     401.
 */
export function checkCronAuth(request: Request, log: Logger): Response | null {
	const cronSecret = env.CRON_SECRET
	if (!cronSecret) {
		log.warn('cron invoked but CRON_SECRET is not set; refusing')
		return json({ error: 'cron-not-configured' }, { status: 503 })
	}

	const authHeader = request.headers.get('authorization') ?? ''
	const expected = `Bearer ${cronSecret}`

	// `timingSafeEqual` requires equal-length buffers. Comparing buffers of
	// different lengths leaks the secret length, so prepad the candidate
	// to the secret's length and let the equality check itself fail when
	// they differ. The constant-time path runs only on the equal-length
	// case; differing lengths still complete in O(n_secret) without an
	// early return.
	const expectedBuf = Buffer.from(expected, 'utf8')
	const candidateBuf = Buffer.alloc(expectedBuf.length)
	const headerBuf = Buffer.from(authHeader, 'utf8')
	headerBuf.copy(candidateBuf, 0, 0, Math.min(headerBuf.length, expectedBuf.length))
	const ok = headerBuf.length === expectedBuf.length && timingSafeEqual(candidateBuf, expectedBuf)
	if (!ok) {
		log.warn('unauthorized cron invocation')
		return json({ error: 'Unauthorized' }, { status: 401 })
	}
	return null
}
