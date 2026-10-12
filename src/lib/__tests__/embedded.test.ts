import { afterEach, describe, expect, it, vi } from 'vitest'

import { EMBEDDED_UA_MARKER, isEmbeddedClient, isEmbeddedUserAgent, NATIVE_BRIDGE_NAME, postToNativeBridge } from '../embedded'

describe('isEmbeddedUserAgent', () => {
	it('matches the iOS web view marker anywhere in the string', () => {
		expect(
			isEmbeddedUserAgent(
				'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 GiftWrapt-iOS/1.1.0'
			)
		).toBe(true)
		expect(isEmbeddedUserAgent(`${EMBEDDED_UA_MARKER}2.0`)).toBe(true)
	})

	it('rejects Safari, SFSafariViewController, and empty values', () => {
		expect(
			isEmbeddedUserAgent(
				'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1'
			)
		).toBe(false)
		expect(isEmbeddedUserAgent('')).toBe(false)
		expect(isEmbeddedUserAgent(null)).toBe(false)
		expect(isEmbeddedUserAgent(undefined)).toBe(false)
	})

	it('is case-sensitive so a lookalike product name does not flip the shell', () => {
		expect(isEmbeddedUserAgent('giftwrapt-ios/1.0')).toBe(false)
	})
})

describe('isEmbeddedClient', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('is false with no navigator (SSR)', () => {
		expect(isEmbeddedClient()).toBe(false)
	})

	it('reads navigator.userAgent in the browser', () => {
		vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone) GiftWrapt-iOS/1.2' })
		expect(isEmbeddedClient()).toBe(true)
		vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone) Safari/604.1' })
		expect(isEmbeddedClient()).toBe(false)
	})
})

describe('postToNativeBridge', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('returns false with no window (SSR)', () => {
		expect(postToNativeBridge({ type: 'save' })).toBe(false)
	})

	it('returns false in a plain browser with no WebKit handler', () => {
		vi.stubGlobal('window', {})
		expect(postToNativeBridge({ type: 'save' })).toBe(false)
	})

	it('posts to the named handler and returns true', () => {
		const postMessage = vi.fn()
		vi.stubGlobal('window', { webkit: { messageHandlers: { [NATIVE_BRIDGE_NAME]: { postMessage } } } })
		expect(postToNativeBridge({ type: 'reauth', to: '/lists/5' })).toBe(true)
		expect(postMessage).toHaveBeenCalledWith({ type: 'reauth', to: '/lists/5' })
	})

	it('returns false when the handler throws', () => {
		vi.stubGlobal('window', {
			webkit: {
				messageHandlers: {
					[NATIVE_BRIDGE_NAME]: {
						postMessage: () => {
							throw new Error('gone')
						},
					},
				},
			},
		})
		expect(postToNativeBridge({ type: 'save' })).toBe(false)
	})
})
