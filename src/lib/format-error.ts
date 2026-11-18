import { m } from '@/paraglide/messages.js'

export interface FormattedError {
	title: string
	body: string
	status?: number
}

interface HttpErrorShape {
	status?: number
	message?: string
	statusMessage?: string
	statusText?: string
}

function tryParseJson(value: string): unknown {
	const trimmed = value.trim()
	if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
	try {
		return JSON.parse(trimmed)
	} catch {
		return null
	}
}

function statusToCopy(status: number): FormattedError {
	if (status === 401) {
		return { title: m.error_http_401_title(), body: m.error_http_401_body(), status }
	}
	if (status === 403) {
		return { title: m.error_http_403_title(), body: m.error_http_403_body(), status }
	}
	if (status === 404) {
		return { title: m.error_http_404_title(), body: m.error_http_404_body(), status }
	}
	if (status === 408 || status === 504) {
		return { title: m.error_http_timeout_title(), body: m.error_http_timeout_body(), status }
	}
	if (status === 429) {
		return { title: m.error_http_429_title(), body: m.error_http_429_body(), status }
	}
	if (status >= 500) {
		return { title: m.error_http_5xx_title(), body: m.error_http_5xx_body(), status }
	}
	if (status >= 400) {
		return { title: m.error_http_4xx_title(), body: m.error_http_4xx_body(), status }
	}
	return { title: m.error_something_went_wrong(), body: m.error_unexpected_sentence(), status }
}

function extractHttpShape(error: unknown): HttpErrorShape | null {
	if (!error || typeof error !== 'object') return null
	const obj = error as Record<string, unknown>

	const direct: HttpErrorShape = {}
	if (typeof obj.status === 'number') direct.status = obj.status
	if (typeof obj.message === 'string') direct.message = obj.message
	if (typeof obj.statusMessage === 'string') direct.statusMessage = obj.statusMessage
	if (typeof obj.statusText === 'string') direct.statusText = obj.statusText

	if (typeof obj.message === 'string') {
		const parsed = tryParseJson(obj.message)
		if (parsed && typeof parsed === 'object') {
			const p = parsed as Record<string, unknown>
			// The outer message was a JSON wrapper; drop it and trust the inner fields.
			direct.message = undefined
			if (typeof p.status === 'number') direct.status = p.status
			if (typeof p.message === 'string' && p.message !== 'HTTPError') direct.message = p.message
			if (typeof p.statusMessage === 'string') direct.statusMessage = p.statusMessage
		}
	}

	return direct.status || direct.message || direct.statusMessage || direct.statusText ? direct : null
}

export function formatErrorForUser(error: unknown): FormattedError {
	if (error == null) {
		return { title: m.error_something_went_wrong(), body: m.error_unexpected_sentence() }
	}

	const http = extractHttpShape(error)
	if (http?.status) {
		const base = statusToCopy(http.status)
		const serverMsg = http.statusMessage ?? (http.message && http.message !== 'HTTPError' ? http.message : undefined)
		if (serverMsg && serverMsg !== base.title) {
			return { ...base, body: serverMsg }
		}
		return base
	}

	if (error instanceof Error) {
		const msg = error.message.trim()
		if (!msg || msg === 'HTTPError') {
			return { title: m.error_something_went_wrong(), body: m.error_unexpected_retry() }
		}
		return { title: m.error_something_went_wrong(), body: msg }
	}

	if (typeof error === 'string' && error.trim()) {
		return { title: m.error_something_went_wrong(), body: error }
	}

	return { title: m.error_something_went_wrong(), body: m.error_unexpected_sentence() }
}
