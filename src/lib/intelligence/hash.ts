import { createHash } from 'node:crypto'

// Stable SHA-256 hash returning a hex string. Used for input-hash slices
// (combined into a per-run hash) and for rec fingerprints.
export function sha256Hex(input: string): string {
	return createHash('sha256').update(input).digest('hex')
}

// Combine multiple slice hashes deterministically. Returns null when no
// analyzer contributed (i.e. all returned null), which means "no
// input-derived cache key for this run".
export function combineHashes(slices: Array<string | null>): string | null {
	const present = slices.filter((s): s is string => s != null)
	if (present.length === 0) return null
	return sha256Hex(present.sort().join('|'))
}
