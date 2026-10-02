import { describe, expect, it } from 'vitest'

import { newReceiptId, parseReceiptUrl, receiptUrl } from '../receipts'
import { isReceiptKey, parseKeyFromUrl, parsePurchaseAttachmentKey, receiptKey } from '../storage/keys'

describe('receipt urls', () => {
	it('round-trips an id and extension', () => {
		const id = newReceiptId()
		expect(id).toMatch(/^[0-9A-Za-z]{21}$/)
		expect(parseReceiptUrl(receiptUrl(id, 'pdf'))).toEqual({ id, ext: 'pdf' })
		expect(parseReceiptUrl(`https://app.test${receiptUrl(id, 'webp')}`)).toEqual({ id, ext: 'webp' })
	})

	it('ignores storage urls and malformed ids', () => {
		expect(parseReceiptUrl('/api/files/purchases/claim/1/abcdefabcdef.pdf')).toBeNull()
		expect(parseReceiptUrl('/api/receipts/short.pdf')).toBeNull()
		expect(parseReceiptUrl(`/api/receipts/${'a'.repeat(21)}.exe`)).toBeNull()
	})

	it('is never mistaken for a storage key', () => {
		expect(parseKeyFromUrl(receiptUrl(newReceiptId(), 'pdf'), 'https://cdn.test')).toBeNull()
	})
})

describe('receipt keys', () => {
	it('live under the private prefix and still classify as purchase attachments', () => {
		const key = receiptKey('claim', 42, 'pdf')
		expect(isReceiptKey(key)).toBe(true)
		expect(parsePurchaseAttachmentKey(key)).toEqual({ kind: 'claim', id: '42', ext: 'pdf' })
	})

	it('leave legacy and addon-image keys public', () => {
		expect(isReceiptKey('purchases/addon/7/abcdefabcdef.webp')).toBe(false)
		expect(isReceiptKey('items/3/abcdefabcd.webp')).toBe(false)
	})
})
