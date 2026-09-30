// Item and addon images for outbound email.
//
// An image URL that renders fine on the site can fail in an email client:
// root-relative storage paths (`/api/files/<key>`) have no host there,
// `http://` images are blocked as mixed content by webmail, and hotlinked
// vendor images expire or refuse the mail client's proxy. Email has no
// `onerror`, so the fallback has to be decided before the send:
// `resolveEmailImages` makes each URL absolute, then probes the ones we
// don't host and replaces any that fail with `null`, which the template
// renders as the gift placeholder graphic.

import { env } from '@/env'
import { createLogger } from '@/lib/logger'
import { safeFetch } from '@/lib/scrapers/safe-fetch'

const log = createLogger('email-images')

const PROBE_TIMEOUT_MS = 3_000
const PROBE_CONCURRENCY = 8
// Total time one `resolveEmailImages` call may spend probing. Past it,
// the remaining URLs are kept as they are: a possibly broken image beats a
// cron run that never finishes.
const PROBE_BUDGET_MS = 20_000

// Types every mainstream mail client renders. SVG is blocked by most of
// them, so it counts as unusable.
const EMAIL_IMAGE_TYPES = /^image\/(jpeg|pjpeg|png|gif|webp|avif)(\s*;|$)/i

function appBaseUrl(): string | null {
	return env.BETTER_AUTH_URL?.replace(/\/$/, '') ?? null
}

/**
 * The URL a mail client can load for a stored image URL, or null when
 * nothing usable can be made of it (empty, `data:`, unparseable).
 *
 * - `/api/files/<key>` and other root-relative paths get the app's base URL.
 * - `//host/path` and `http://` become `https://` (webmail blocks mixed
 *   content, and the CDNs that serve item images answer both).
 */
export function absoluteEmailImageUrl(raw: string | null | undefined): string | null {
	if (!raw) return null
	const trimmed = raw.trim()
	if (!trimmed) return null
	if (trimmed.startsWith('//')) return `https:${trimmed}`
	if (trimmed.startsWith('/')) {
		const base = appBaseUrl()
		return base ? `${base}${trimmed}` : null
	}
	let parsed: URL
	try {
		parsed = new URL(trimmed)
	} catch {
		return null
	}
	if (parsed.protocol === 'http:') return `https://${trimmed.slice('http://'.length)}`
	if (parsed.protocol !== 'https:') return null
	return trimmed
}

// URLs we mint ourselves (the file proxy under the app's base URL, or the
// storage CDN) are not probed: they are public by design and a probe from
// inside the deployment would be refused by the SSRF guard for localhost
// setups anyway.
function isOwnUrl(url: string): boolean {
	const bases = [appBaseUrl(), env.STORAGE_PUBLIC_URL?.replace(/\/$/, '')].filter((b): b is string => !!b)
	return bases.some(base => url === base || url.startsWith(`${base}/`))
}

/**
 * True when a GET of `url` answers 2xx with a mail-safe image content type
 * within the timeout. Any failure (DNS, private address, timeout, 4xx/5xx,
 * HTML error page) is false.
 */
export async function isLoadableEmailImage(url: string, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<boolean> {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), timeoutMs)
	try {
		const response = await safeFetch(url, { signal: controller.signal, headers: { accept: 'image/*' } })
		const ok = response.ok && EMAIL_IMAGE_TYPES.test(response.headers.get('content-type') ?? '')
		try {
			await response.body?.cancel()
		} catch {}
		return ok
	} catch {
		return false
	} finally {
		clearTimeout(timeout)
	}
}

/**
 * Resolve every distinct image URL in `rawUrls` to the URL the email should
 * use, or null for the placeholder. Own URLs are only made absolute;
 * everything else is probed, `PROBE_CONCURRENCY` at a time, until the
 * budget runs out.
 */
export async function resolveEmailImages(
	rawUrls: ReadonlyArray<string | null | undefined>,
	opts: { probe?: (url: string) => Promise<boolean>; budgetMs?: number; now?: () => number } = {}
): Promise<Map<string, string | null>> {
	const probe = opts.probe ?? isLoadableEmailImage
	const budgetMs = opts.budgetMs ?? PROBE_BUDGET_MS
	const clock = opts.now ?? Date.now

	const resolved = new Map<string, string | null>()
	const toProbe: Array<{ raw: string; url: string }> = []
	for (const raw of rawUrls) {
		if (!raw || resolved.has(raw)) continue
		const url = absoluteEmailImageUrl(raw)
		resolved.set(raw, url)
		if (url && !isOwnUrl(url)) toProbe.push({ raw, url })
	}

	if (toProbe.length === 0) return resolved
	const started = clock()
	let cursor = 0
	let skipped = 0
	const lanes = Math.min(PROBE_CONCURRENCY, toProbe.length)
	await Promise.all(
		Array.from({ length: lanes }, async () => {
			while (cursor < toProbe.length) {
				const entry = toProbe[cursor++]
				if (clock() - started > budgetMs) {
					skipped += 1
					continue
				}
				if (!(await probe(entry.url))) resolved.set(entry.raw, null)
			}
		})
	)
	if (skipped > 0) log.warn({ skipped, total: toProbe.length, budgetMs }, 'email image probe budget exhausted')
	return resolved
}
