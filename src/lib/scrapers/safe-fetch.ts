// SSRF protection for the scraper. See sec-review C2.
//
// The scraper accepts arbitrary URLs from authenticated users. Without DNS
// resolution + private-range checks, an attacker can point the scraper at:
//
//   - cloud metadata endpoints (169.254.169.254 - AWS, GCP, Azure, etc.)
//   - loopback services (127.0.0.1, ::1, localhost) - Postgres health,
//     Garage admin on :3903, internal admin endpoints
//   - private network ranges (10/8, 172.16/12, 192.168/16, fc00::/7,
//     fe80::/10) reachable from the scraper's container
//
// Native `fetch` has no hook for "validate the resolved IP". We do it
// ourselves: parse the URL, resolve via `dns.lookup`, reject any address
// in a private/loopback/link-local/CGNAT/multicast/reserved range. We
// also handle redirect chains manually (`redirect: 'manual'`) and re-run
// the same check on every hop, so a public host that 30x's to
// `127.0.0.1` is rejected at the redirect rather than followed.

import { lookup } from 'node:dns/promises'
import { isIP, isIPv4, isIPv6 } from 'node:net'

import { ScrapeProviderError } from './types'

const DEFAULT_MAX_REDIRECTS = 5

// Indirection so tests that don't want real DNS can swap in a fake
// resolver via `_setLookupImplForTesting`. Production paths always use
// the real `node:dns/promises#lookup`.
type LookupFn = (hostname: string, options: { all: true }) => Promise<Array<{ address: string; family: number }>>
let lookupImpl: LookupFn = lookup as LookupFn

/**
 * Test-only hook. Pass a function to override DNS resolution; pass
 * `null` to restore the real `node:dns/promises#lookup`. Calling this
 * outside of tests is a bug.
 */
export function _setLookupImplForTesting(fn: LookupFn | null): void {
	lookupImpl = fn ?? (lookup as LookupFn)
}

// IPv4 dotted-quad to 32-bit unsigned int. Returns null on malformed input.
function ipv4ToInt(ip: string): number | null {
	const parts = ip.split('.')
	if (parts.length !== 4) return null
	let n = 0
	for (const p of parts) {
		if (!/^\d{1,3}$/.test(p)) return null
		const v = Number(p)
		if (v < 0 || v > 255) return null
		n = ((n << 8) | v) >>> 0
	}
	return n
}

function isPrivateIPv4(ip: string): boolean {
	const n = ipv4ToInt(ip)
	if (n === null) return false
	const inRange = (start: number, end: number): boolean => n >= start && n <= end
	return (
		// 0.0.0.0/8 - "this network"
		inRange(0x00000000, 0x00ffffff) ||
		// 10.0.0.0/8 - private
		inRange(0x0a000000, 0x0affffff) ||
		// 100.64.0.0/10 - CGNAT
		inRange(0x64400000, 0x647fffff) ||
		// 127.0.0.0/8 - loopback
		inRange(0x7f000000, 0x7fffffff) ||
		// 169.254.0.0/16 - link-local (incl AWS/GCP/Azure metadata)
		inRange(0xa9fe0000, 0xa9feffff) ||
		// 172.16.0.0/12 - private
		inRange(0xac100000, 0xac1fffff) ||
		// 192.0.0.0/24 - IETF protocol assignments
		inRange(0xc0000000, 0xc00000ff) ||
		// 192.0.2.0/24 - TEST-NET-1
		inRange(0xc0000200, 0xc00002ff) ||
		// 192.88.99.0/24 - 6to4 anycast (deprecated)
		inRange(0xc0586300, 0xc05863ff) ||
		// 192.168.0.0/16 - private
		inRange(0xc0a80000, 0xc0a8ffff) ||
		// 198.18.0.0/15 - benchmarking
		inRange(0xc6120000, 0xc613ffff) ||
		// 198.51.100.0/24 - TEST-NET-2
		inRange(0xc6336400, 0xc63364ff) ||
		// 203.0.113.0/24 - TEST-NET-3
		inRange(0xcb007100, 0xcb0071ff) ||
		// 224.0.0.0/4 - multicast
		inRange(0xe0000000, 0xefffffff) ||
		// 240.0.0.0/4 - reserved (excluding 255.255.255.255 which we cover next)
		inRange(0xf0000000, 0xfffffffe) ||
		// 255.255.255.255 - limited broadcast
		n === 0xffffffff
	)
}

function isPrivateIPv6(raw: string): boolean {
	const ip = raw.toLowerCase()
	// Unspecified and loopback.
	if (ip === '::' || ip === '::1') return true
	// IPv4-mapped (::ffff:a.b.c.d) - extract the embedded v4 and recurse.
	const v4Mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(ip)
	if (v4Mapped) return isPrivateIPv4(v4Mapped[1])
	// ULA fc00::/7 (first hextet starts with fc or fd).
	if (/^f[cd]/.test(ip)) return true
	// Link-local fe80::/10 (first hextet 'fe80'..'febf').
	if (/^fe[89ab]/.test(ip)) return true
	// Multicast ff00::/8.
	if (ip.startsWith('ff')) return true
	// 64:ff9b::/96 - NAT64.
	if (ip.startsWith('64:ff9b:')) return true
	// 100::/64 - discard prefix.
	if (/^100:0?:/.test(ip) || ip === '100::') return true
	// 2001:db8::/32 - documentation.
	if (ip.startsWith('2001:db8:') || ip === '2001:db8::') return true
	return false
}

/**
 * Returns true when `ip` is a literal IPv4 or IPv6 address that falls in
 * a private, loopback, link-local, multicast, or otherwise non-routable
 * range. Returns false for non-IP strings (so callers should validate
 * with `net.isIP` first if they need that distinction).
 */
export function isPrivateIp(ip: string): boolean {
	if (isIPv4(ip)) return isPrivateIPv4(ip)
	if (isIPv6(ip)) return isPrivateIPv6(ip)
	return false
}

function unwrapIpv6Brackets(host: string): string {
	return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

/**
 * Throws `ScrapeProviderError('invalid_response')` when `url` is unsafe to
 * fetch: non-http(s) scheme, missing hostname, IP-literal hostname in a
 * private range, or DNS-resolves to a private address.
 *
 * Resolves all addresses (`all: true`) so a name that returns both a
 * public and a private record is rejected on the private one.
 */
export async function assertSafeUrl(url: URL): Promise<void> {
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new ScrapeProviderError('invalid_response', `disallowed scheme: ${url.protocol}`)
	}
	const rawHost = url.hostname
	if (!rawHost) {
		throw new ScrapeProviderError('invalid_response', 'missing hostname')
	}
	const host = unwrapIpv6Brackets(rawHost)
	if (isIP(host)) {
		if (isPrivateIp(host)) {
			throw new ScrapeProviderError('invalid_response', `disallowed address: ${host}`)
		}
		return
	}
	let addrs: Array<{ address: string; family: number }>
	try {
		addrs = await lookupImpl(host, { all: true })
	} catch (err) {
		throw new ScrapeProviderError('network_error', `dns lookup failed for ${host}: ${err instanceof Error ? err.message : String(err)}`)
	}
	for (const a of addrs) {
		if (isPrivateIp(a.address)) {
			throw new ScrapeProviderError('invalid_response', `host ${host} resolves to private address ${a.address}`)
		}
	}
}

export interface SafeFetchOptions {
	signal?: AbortSignal
	headers?: Record<string, string>
	maxRedirects?: number
	onRedirect?: (from: string, to: string, status: number) => void
}

/**
 * SSRF-safe drop-in replacement for `fetch`. Validates the initial URL
 * and every redirect target's resolved address against the private-range
 * list, omits credentials, and caps the redirect chain.
 *
 * Returns the final `Response` once a non-3xx is received (or the chain
 * cap is hit, in which case it throws).
 */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<Response> {
	const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS
	let currentUrl: URL
	try {
		currentUrl = new URL(rawUrl)
	} catch {
		throw new ScrapeProviderError('invalid_response', `invalid url: ${rawUrl}`)
	}
	for (let hops = 0; ; hops++) {
		await assertSafeUrl(currentUrl)
		const response = await fetch(currentUrl, {
			method: 'GET',
			signal: opts.signal,
			redirect: 'manual',
			credentials: 'omit',
			headers: opts.headers,
		})
		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get('location')
			if (!location) return response
			if (hops + 1 > maxRedirects) {
				throw new ScrapeProviderError('network_error', `too many redirects (>${maxRedirects})`)
			}
			let nextUrl: URL
			try {
				nextUrl = new URL(location, currentUrl)
			} catch {
				throw new ScrapeProviderError('invalid_response', `invalid redirect target: ${location}`)
			}
			opts.onRedirect?.(currentUrl.toString(), nextUrl.toString(), response.status)
			try {
				await response.body?.cancel()
			} catch {
				// Body may already be drained; nothing to do.
			}
			currentUrl = nextUrl
			continue
		}
		return response
	}
}
