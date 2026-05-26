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
		return { title: 'You need to sign in', body: 'Your session may have expired. Sign in again to continue.', status }
	}
	if (status === 403) {
		return { title: "You don't have access", body: "You don't have permission to view this.", status }
	}
	if (status === 404) {
		return { title: 'Not found', body: "We couldn't find what you were looking for.", status }
	}
	if (status === 408 || status === 504) {
		return { title: 'Request timed out', body: 'The server took too long to respond. Try again in a moment.', status }
	}
	if (status === 429) {
		return { title: 'Too many requests', body: 'Slow down for a moment and try again.', status }
	}
	if (status >= 500) {
		return {
			title: 'Something went wrong on our end',
			body: "We hit an unexpected error. It's been logged; try again in a moment.",
			status,
		}
	}
	if (status >= 400) {
		return { title: "That didn't work", body: 'The request was rejected. Try again or refresh the page.', status }
	}
	return { title: 'Something went wrong', body: 'An unexpected error occurred.', status }
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
		return { title: 'Something went wrong', body: 'An unexpected error occurred.' }
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
			return { title: 'Something went wrong', body: 'An unexpected error occurred. Try again in a moment.' }
		}
		return { title: 'Something went wrong', body: msg }
	}

	if (typeof error === 'string' && error.trim()) {
		return { title: 'Something went wrong', body: error }
	}

	return { title: 'Something went wrong', body: 'An unexpected error occurred.' }
}
