// Server-only. Do not import from client/route components.
//
// What we keep about a failed scrape attempt, beyond its error code. The
// text ends up in `item_scrapes.response` for the admin Scrape History, so
// it is cut down and stripped of anything credential-shaped first: an
// upstream service is free to echo a token, a signed URL, or the request
// we sent back at us in its error body.

const MAX_DETAIL_CHARS = 300
const MAX_ERROR_BODY_BYTES = 4096
const REDACTED = '[redacted]'

// Shortest secret we blank by value. Anything shorter would also blank
// ordinary words that happen to match.
const MIN_SECRET_CHARS = 6

// Makes a diagnostic string safe to store:
//   - any of `secrets` that appears verbatim is blanked
//   - URL credentials (`user:pass@`) and query strings are dropped
//   - `Bearer`/`Basic` credentials and `token=...`-style pairs are blanked
//   - whitespace is collapsed and the result capped at 300 characters
export function redactDiagnostic(text: string | undefined | null, secrets: ReadonlyArray<string> = []): string | undefined {
	if (!text) return undefined
	let out = text
	for (const secret of secrets) {
		if (secret.length >= MIN_SECRET_CHARS) out = out.split(secret).join(REDACTED)
	}
	out = out
		.replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@"']+@/gi, '$1')
		.replace(/\b([a-z][a-z0-9+.-]*:\/\/[^\s?#"'<>]+)\?[^\s"'<>]*/gi, '$1?[query removed]')
		.replace(/\b(bearer|basic)\s+[\w.~+/=-]+/gi, `$1 ${REDACTED}`)
		.replace(
			/\b([\w-]*(?:token|secret|password|passwd|api[_-]?key|apikey|authorization)[\w-]*)(["']?\s*[=:]\s*["']?)[^\s"'&,;]+/gi,
			`$1$2${REDACTED}`
		)
		.replace(/\s+/g, ' ')
		.trim()
	if (!out) return undefined
	return out.length > MAX_DETAIL_CHARS ? `${out.slice(0, MAX_DETAIL_CHARS - 1)}…` : out
}

// Values that must never be stored, taken from what we sent a custom
// scraper: each configured header value (and the credential part of a
// `Bearer xyz` style value) plus any query values on its endpoint.
export function secretsFromRequest(headers: Record<string, string>, endpoint: URL): Array<string> {
	const secrets = new Set<string>()
	for (const value of Object.values(headers)) {
		secrets.add(value)
		const parts = value.split(/\s+/)
		if (parts.length > 1) secrets.add(parts[parts.length - 1])
	}
	for (const value of endpoint.searchParams.values()) secrets.add(value)
	return [...secrets].filter(s => s.length >= MIN_SECRET_CHARS)
}

// Reads the error an upstream scraper reported in a non-2xx JSON body, as
// `code: message`. Understands the flat `{ error, message }` shape and the
// nested `{ error: { code, message } }` one. Returns undefined for anything
// else (an HTML error page tells an admin nothing and may be huge).
export async function readUpstreamErrorDetail(response: Response, secrets: ReadonlyArray<string> = []): Promise<string | undefined> {
	let body: string
	try {
		body = await readCapped(response, MAX_ERROR_BODY_BYTES)
	} catch {
		return undefined
	}
	let payload: unknown
	try {
		payload = JSON.parse(body)
	} catch {
		return undefined
	}
	if (!isPlainObject(payload)) return undefined
	const nested = isPlainObject(payload.error) ? payload.error : undefined
	const code = firstString(nested?.code, payload.code, payload.error)
	const message = firstString(nested?.message, payload.message)
	const detail = [code, message].filter(Boolean).join(': ')
	return redactDiagnostic(detail, secrets)
}

async function readCapped(response: Response, capBytes: number): Promise<string> {
	if (!response.body) return ''
	const reader = response.body.getReader()
	const chunks: Array<Uint8Array> = []
	let total = 0
	while (total < capBytes) {
		const { value, done } = await reader.read()
		if (done) break
		const take = value.slice(0, capBytes - total)
		chunks.push(take)
		total += take.length
	}
	await reader.cancel().catch(() => {})
	const out = new Uint8Array(total)
	let offset = 0
	for (const chunk of chunks) {
		out.set(chunk, offset)
		offset += chunk.length
	}
	return new TextDecoder('utf-8', { fatal: false }).decode(out)
}

function firstString(...values: Array<unknown>): string | undefined {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) return value.trim()
	}
	return undefined
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
