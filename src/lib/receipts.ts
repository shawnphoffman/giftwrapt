import { customAlphabet } from 'nanoid'

import type { PurchaseAttachmentExt } from '@/lib/storage/keys'

// Receipts are addressed by an opaque id, never by their storage key. The URL
// carries the extension so the purchases UI can tell a PDF from an image the
// same way it always has (by suffix).

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const newReceiptId = customAlphabet(alphabet, 21)

export const RECEIPT_ROUTE_PREFIX = '/api/receipts/'

export function receiptUrl(id: string, ext: PurchaseAttachmentExt): string {
	return `${RECEIPT_ROUTE_PREFIX}${id}.${ext}`
}

// Accepts the root-relative form we store and an absolute URL to the same
// path. Returns null for anything else (legacy `/api/files/...` or bucket URLs).
export function parseReceiptUrl(url: string): { id: string; ext: PurchaseAttachmentExt } | null {
	const match = /\/api\/receipts\/([0-9A-Za-z]{21})\.(webp|pdf)$/.exec(url)
	if (!match) return null
	return { id: match[1], ext: match[2] as PurchaseAttachmentExt }
}
