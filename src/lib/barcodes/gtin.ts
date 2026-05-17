// GTIN normalization + checksum validation.
//
// Accepts UPC-E (8), UPC-A (12), EAN-13 (13), and ITF-14 (14) digit
// strings. Expands UPC-E -> UPC-A, left-pads to 14 digits, and verifies
// the standard mod-10 check digit. Pure function; no I/O.

export type NormalizeGtinResult = { ok: true; gtin14: string } | { ok: false; reason: 'invalid-code' }

// Expand a UPC-E (8-digit) to a UPC-A (12-digit). The 8-digit form is
// (numberSystem, 6 data digits, checkDigit) where numberSystem is 0 or
// 1. The compression rules below are the canonical reverse mapping.
function expandUpcE(upcE: string): string | null {
	if (upcE.length !== 8) return null
	const ns = upcE[0]
	if (ns !== '0' && ns !== '1') return null
	const d = upcE.slice(1, 7)
	const check = upcE[7]
	const last = d[5]
	let mfr: string
	let prod: string
	switch (last) {
		case '0':
		case '1':
		case '2':
			mfr = d[0] + d[1] + last + '00'
			prod = '00' + d[2] + d[3] + d[4]
			break
		case '3':
			mfr = d[0] + d[1] + d[2] + '00'
			prod = '000' + d[3] + d[4]
			break
		case '4':
			mfr = d[0] + d[1] + d[2] + d[3] + '0'
			prod = '0000' + d[4]
			break
		default:
			mfr = d[0] + d[1] + d[2] + d[3] + d[4]
			prod = '0000' + last
			break
	}
	return ns + mfr + prod + check
}

function isDigits(s: string): boolean {
	return s.length > 0 && /^\d+$/.test(s)
}

// Standard GS1 mod-10 check: sum each digit weighted alternately by 3
// and 1 from the right (excluding the check digit), and the check
// digit equals (10 - sum mod 10) mod 10.
function hasValidCheckDigit(gtin14: string): boolean {
	if (gtin14.length !== 14 || !isDigits(gtin14)) return false
	let sum = 0
	for (let i = 0; i < 13; i++) {
		const d = Number(gtin14[12 - i])
		sum += i % 2 === 0 ? d * 3 : d
	}
	const check = (10 - (sum % 10)) % 10
	return check === Number(gtin14[13])
}

export function normalizeGtin(input: string): NormalizeGtinResult {
	if (typeof input !== 'string') return { ok: false, reason: 'invalid-code' }
	const trimmed = input.trim()
	if (!isDigits(trimmed)) return { ok: false, reason: 'invalid-code' }

	let candidate: string
	switch (trimmed.length) {
		case 8: {
			// EAN-8 is left-padded to GTIN-14 directly. UPC-E is the
			// only other 8-digit form and is ambiguous from EAN-8 by
			// length alone, so we accept whichever form passes the
			// checksum. EAN-8 is tried first because it's a no-op pad;
			// fall back to UPC-E expansion if that fails.
			candidate = trimmed.padStart(14, '0')
			if (hasValidCheckDigit(candidate)) return { ok: true, gtin14: candidate }
			const upcA = expandUpcE(trimmed)
			if (!upcA) return { ok: false, reason: 'invalid-code' }
			candidate = upcA.padStart(14, '0')
			break
		}
		case 12:
		case 13:
		case 14:
			candidate = trimmed.padStart(14, '0')
			break
		default:
			return { ok: false, reason: 'invalid-code' }
	}

	if (!hasValidCheckDigit(candidate)) return { ok: false, reason: 'invalid-code' }
	return { ok: true, gtin14: candidate }
}
