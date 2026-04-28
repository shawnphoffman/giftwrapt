import { describe, expect, it } from 'vitest'

import { avatarKey, itemImageKey, parseAvatarKey, parseItemImageKey, parseKeyFromUrl } from '../keys'

describe('avatarKey', () => {
	it('prefixes with avatars/ and includes userId + .webp', () => {
		const key = avatarKey('user123')
		expect(key).toMatch(/^avatars\/user123-[0-9A-Za-z]{8}\.webp$/)
	})

	it('yields a fresh nonce each call (so replace invalidates any cache)', () => {
		const a = avatarKey('user123')
		const b = avatarKey('user123')
		expect(a).not.toEqual(b)
	})
})

describe('itemImageKey', () => {
	it('nests itemId as a path segment, 10-char nonce', () => {
		const key = itemImageKey(42)
		expect(key).toMatch(/^items\/42\/[0-9A-Za-z]{10}\.webp$/)
	})

	it('accepts string itemIds too', () => {
		const key = itemImageKey('abc')
		expect(key.startsWith('items/abc/')).toBe(true)
	})
})

describe('parseKeyFromUrl', () => {
	it('extracts key from a proxy URL', () => {
		const key = parseKeyFromUrl('/api/files/items/42/abc123def.webp', undefined)
		expect(key).toEqual('items/42/abc123def.webp')
	})

	it('extracts key from an absolute proxy URL', () => {
		const key = parseKeyFromUrl('https://app.example.com/api/files/avatars/user1-aaaaaaaa.webp', undefined)
		expect(key).toEqual('avatars/user1-aaaaaaaa.webp')
	})

	it('extracts key from a direct CDN URL matching the public base', () => {
		const key = parseKeyFromUrl('https://cdn.example.com/items/42/abc123def.webp', 'https://cdn.example.com')
		expect(key).toEqual('items/42/abc123def.webp')
	})

	it('tolerates trailing slash on the public base', () => {
		const key = parseKeyFromUrl('https://cdn.example.com/items/42/abc.webp', 'https://cdn.example.com/')
		expect(key).toEqual('items/42/abc.webp')
	})

	it('decodes percent-encoded keys', () => {
		const key = parseKeyFromUrl('/api/files/items/42/abc%20def.webp', undefined)
		expect(key).toEqual('items/42/abc def.webp')
	})

	it('returns null for V1-style hotlinks outside our base', () => {
		const key = parseKeyFromUrl('https://example.supabase.co/storage/v1/object/public/images/old.jpg', 'https://cdn.example.com')
		expect(key).toBeNull()
	})

	it('returns null for empty url', () => {
		expect(parseKeyFromUrl('', undefined)).toBeNull()
	})
})

describe('parseAvatarKey', () => {
	it('extracts userId from a freshly-minted key', () => {
		const key = avatarKey('user123')
		expect(parseAvatarKey(key)).toEqual({ userId: 'user123' })
	})

	it('handles userIds containing hyphens (better-auth ids)', () => {
		const result = parseAvatarKey('avatars/abc-def-123-aaaaaaaa.webp')
		expect(result).toEqual({ userId: 'abc-def-123' })
	})

	it('returns null for non-avatar prefix', () => {
		expect(parseAvatarKey('items/42/abc.webp')).toBeNull()
	})

	it('returns null for malformed avatar keys', () => {
		expect(parseAvatarKey('avatars/no-dot-webp')).toBeNull()
		expect(parseAvatarKey('avatars/missing-extension.png')).toBeNull()
	})
})

describe('parseItemImageKey', () => {
	it('extracts itemId from a freshly-minted key', () => {
		const key = itemImageKey(42)
		expect(parseItemImageKey(key)).toEqual({ itemId: '42' })
	})

	it('returns null for non-item prefix', () => {
		expect(parseItemImageKey('avatars/u-aaaaaaaa.webp')).toBeNull()
	})

	it('returns null for malformed item keys', () => {
		expect(parseItemImageKey('items/42/notwebp.png')).toBeNull()
		expect(parseItemImageKey('items/42')).toBeNull()
	})
})
