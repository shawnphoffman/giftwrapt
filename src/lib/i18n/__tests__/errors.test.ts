import { describe, expect, it } from 'vitest'

import { authError, authErrorText, errorText, UserFacingError } from '../errors'

describe('errorText', () => {
	it('shows the text of an error the UI wrote itself', () => {
		expect(errorText(new UserFacingError('Pick a list first.'), 'Could not save')).toBe('Pick a list first.')
	})

	it('never shows the message of any other error', () => {
		expect(errorText(new Error('not-authorized'), 'Could not save')).toBe('Could not save')
		expect(errorText(new Error('[{"code":"too_small","path":["title"]}]'), 'Could not save')).toBe('Could not save')
		expect(errorText('boom', 'Could not save')).toBe('Could not save')
		expect(errorText(null, 'Could not save')).toBe('Could not save')
	})

	it('recognizes a coded error', () => {
		expect(errorText({ code: 'INVALID_PASSWORD', message: 'Invalid password' }, 'Could not save')).toBe("That password isn't right.")
	})

	it('recognizes a request that never reached the server', () => {
		expect(errorText(new TypeError('Failed to fetch'), 'Could not save')).toMatch(/connection/i)
	})
})

describe('authErrorText', () => {
	it('maps known better-auth codes to catalog text', () => {
		expect(authErrorText({ code: 'USER_ALREADY_EXISTS', message: 'User already exists.' }, 'Sign up failed')).toBe(
			'An account with that email already exists.'
		)
		expect(authErrorText({ code: 'SIGNUPS_CLOSED' }, 'Sign up failed')).toBe('Sign-ups are closed on this server.')
	})

	it('treats a 429 as rate limiting whatever the code', () => {
		expect(authErrorText({ status: 429, message: 'Too many requests.' }, 'Sign up failed')).toMatch(/too many attempts/i)
	})

	it('falls back for unknown codes rather than echoing the server message', () => {
		expect(authErrorText({ code: 'SOMETHING_NEW', message: 'raw server text' }, 'Sign up failed')).toBe('Sign up failed')
		expect(authErrorText(null, 'Sign up failed')).toBe('Sign up failed')
	})

	it('authError wraps the same text so a catch block shows it', () => {
		const err = authError({ code: 'INVALID_CODE' }, 'Could not verify')
		expect(err).toBeInstanceOf(UserFacingError)
		expect(errorText(err, 'other')).toBe("That code didn't work. Try again.")
	})
})
