// Typed errors for the upload pipeline. Keep these tagged so callers can
// match on `reason` without string sniffing.

export type UploadErrorReason = 'too-large' | 'bad-mime' | 'pipeline-failed' | 'upstream' | 'not-authorized' | 'not-found'

export class UploadError extends Error {
	readonly reason: UploadErrorReason
	readonly cause?: unknown
	constructor(reason: UploadErrorReason, message: string, cause?: unknown) {
		super(message)
		this.name = 'UploadError'
		this.reason = reason
		this.cause = cause
	}
}

// Narrow result shape so server functions can return `{ kind: 'ok' } | { kind: 'error' }`
// without leaking stack traces across the client boundary.
export type UploadResult<T> = { kind: 'ok'; value: T } | { kind: 'error'; reason: UploadErrorReason; message: string }

export const ok = <T>(value: T): UploadResult<T> => ({ kind: 'ok', value })
export const err = (reason: UploadErrorReason, message: string): UploadResult<never> => ({
	kind: 'error',
	reason,
	message,
})
