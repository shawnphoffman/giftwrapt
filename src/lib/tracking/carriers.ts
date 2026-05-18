// Heuristic carrier detection from a tracking number. Pure function, no
// network calls, no side effects. Safe to import from both client and
// server bundles.
//
// Patterns are intentionally narrow: tracking-number formats overlap
// (e.g. a 12-digit number could be FedEx OR something else), so we prefer
// false negatives ("plain text fallback") over false positives ("wrong
// carrier link"). UI should phrase matches as "looks like FedEx", not
// assert.

export type CarrierId = 'ups' | 'usps' | 'fedex' | 'dhl'

export type CarrierMatch = {
	carrier: CarrierId | null
	carrierName: string | null
	trackingUrl: string | null
}

const NONE: CarrierMatch = { carrier: null, carrierName: null, trackingUrl: null }

const CARRIER_NAMES: Record<CarrierId, string> = {
	ups: 'UPS',
	usps: 'USPS',
	fedex: 'FedEx',
	dhl: 'DHL',
}

function buildUrl(carrier: CarrierId, n: string): string {
	switch (carrier) {
		case 'ups':
			return `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`
		case 'usps':
			return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`
		case 'fedex':
			return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`
		case 'dhl':
			return `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(n)}`
	}
}

function match(carrier: CarrierId, n: string): CarrierMatch {
	return { carrier, carrierName: CARRIER_NAMES[carrier], trackingUrl: buildUrl(carrier, n) }
}

// First-match-wins; order matters when patterns overlap.
export function detectCarrier(raw: string): CarrierMatch {
	if (!raw) return NONE
	// Normalize: strip whitespace, uppercase. Tracking numbers are
	// case-insensitive in practice (1z... vs 1Z...).
	const n = raw.trim().replace(/\s+/g, '').toUpperCase()
	if (!n) return NONE

	// UPS: starts with 1Z, 18 chars total. The most specific format we have,
	// so it's safe to check first.
	if (/^1Z[0-9A-Z]{16}$/.test(n)) return match('ups', n)

	// USPS letter-prefixed (international): e.g. CP123456789US.
	if (/^[A-Z]{2}\d{9}US$/.test(n)) return match('usps', n)

	// USPS numeric (specific prefixes for IMpb labels). 20- or 22-digit
	// labels both exist; specific prefixes reduce false positives vs a
	// generic "20 digits = USPS" rule.
	if (/^(91|92|93|94|95|96)\d{18,20}$/.test(n) && (n.length === 20 || n.length === 22)) return match('usps', n)

	// FedEx: 12-digit (Express) or 15-digit (Ground). Some FedEx labels also
	// use 20-22 digits, but the USPS branch above already grabbed those.
	if (/^\d{12}$/.test(n) || /^\d{15}$/.test(n)) return match('fedex', n)

	// DHL: 10 or 11 digits. Last because the simplest numeric pattern is the
	// most prone to false positives.
	if (/^\d{10}$/.test(n) || /^\d{11}$/.test(n)) return match('dhl', n)

	return NONE
}
