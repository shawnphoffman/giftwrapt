import { m } from '@/paraglide/messages.js'

// Turning a failure into text a person reads (plan 36e).
//
// An error's own `message` is not shown: it is English at best, and at worst
// a reason code or a JSON blob of validation issues. What reaches the screen
// is one of three things, in this order:
//
//   1. text the UI wrote itself, carried by a UserFacingError;
//   2. catalog text for an error code we recognize (better-auth's);
//   3. the caller's fallback, which names what was being attempted.

/** An error whose message is already catalog text in the reader's language. */
export class UserFacingError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'UserFacingError'
	}
}

type CodedError = { code?: string | null; status?: number | null; message?: string | null }

// better-auth error codes worth their own sentence. Anything else gets the
// caller's fallback. Sign-in deliberately never comes through here: it shows
// one fixed message so it reveals nothing about which accounts exist.
const AUTH_CODE_TEXT: Record<string, (() => string) | undefined> = {
	INVALID_PASSWORD: () => m.auth_error_invalid_password(),
	INVALID_EMAIL: () => m.auth_error_invalid_email(),
	PASSWORD_TOO_SHORT: () => m.auth_error_password_too_short(),
	PASSWORD_TOO_LONG: () => m.auth_error_password_too_long(),
	USER_ALREADY_EXISTS: () => m.auth_error_account_exists(),
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: () => m.auth_error_account_exists(),
	INVALID_TOKEN: () => m.auth_error_invalid_token(),
	SESSION_EXPIRED: () => m.auth_error_session_expired(),
	SESSION_NOT_FRESH: () => m.auth_error_session_expired(),
	INVALID_CODE: () => m.auth_error_invalid_code(),
	INVALID_BACKUP_CODE: () => m.auth_error_invalid_code(),
	INVALID_TWO_FACTOR_COOKIE: () => m.auth_error_session_expired(),
	TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: () => m.error_too_many_requests(),
	TWO_FACTOR_NOT_ENABLED: () => m.auth_error_2fa_not_enabled(),
	TOTP_NOT_ENABLED: () => m.auth_error_2fa_not_enabled(),
	BACKUP_CODES_NOT_ENABLED: () => m.auth_error_2fa_not_enabled(),
	BANNED_USER: () => m.auth_error_banned(),
	PASSWORD_COMPROMISED: () => m.auth_error_password_compromised(),
	SIGNUPS_CLOSED: () => m.auth_error_signups_closed(),
	AUTHENTICATION_FAILED: () => m.auth_error_passkey_failed(),
	CHALLENGE_NOT_FOUND: () => m.auth_error_passkey_failed(),
	FAILED_TO_VERIFY_REGISTRATION: () => m.auth_error_passkey_failed(),
	PASSKEY_NOT_FOUND: () => m.auth_error_passkey_not_found(),
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: () => m.auth_error_passkey_not_allowed(),
	AUTH_CANCELLED: () => m.auth_error_passkey_cancelled(),
}

function codedText(error: CodedError): string | null {
	const byCode = error.code ? AUTH_CODE_TEXT[error.code] : undefined
	if (byCode) return byCode()
	if (error.status === 429) return m.error_too_many_requests()
	return null
}

/** Catalog text for a better-auth client error (`{ error }` from authClient). */
export function authErrorText(error: CodedError | null | undefined, fallback: string): string {
	return (error && codedText(error)) ?? fallback
}

/** The same, as something to throw from inside a try block. */
export function authError(error: CodedError | null | undefined, fallback: string): UserFacingError {
	return new UserFacingError(authErrorText(error, fallback))
}

/**
 * Text for whatever a catch block or a mutation's onError received.
 * `fallback` says what failed ("Couldn't save the list") and is what shows
 * for anything not recognized.
 */
export function errorText(err: unknown, fallback: string): string {
	if (err instanceof UserFacingError) return err.message
	if (err && typeof err === 'object') {
		const coded = codedText(err as CodedError)
		if (coded) return coded
	}
	// fetch() rejects with a TypeError when the request never reached a server.
	if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) return m.error_network()
	return fallback
}
