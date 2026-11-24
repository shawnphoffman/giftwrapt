// An unbiased random integer from the Web Crypto API, for the gift exchange
// draw. `globalThis.crypto.getRandomValues` exists in Node and in browsers, so
// this module has no `node:crypto` import: `_gift-exchanges-impl.ts` is
// reachable from the client module graph (through `src/api/admin.ts`), where
// Vite would otherwise externalize `node:crypto` and warn on every build.

const RANGE = 2 ** 32

/** Fills the array with random 32-bit values. Injected only by tests. */
export type FillRandom = (array: Uint32Array) => void

const webCryptoFill: FillRandom = array => {
	globalThis.crypto.getRandomValues(array)
}

/**
 * An integer in [0, maxExclusive), the same contract as Node's
 * `crypto.randomInt(max)`. Rejection sampling keeps it unbiased: a 32-bit
 * value at or above the largest multiple of `maxExclusive` is thrown away and
 * drawn again, so every result is equally likely.
 */
export function secureRandomInt(maxExclusive: number, fill: FillRandom = webCryptoFill): number {
	if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > RANGE) {
		throw new RangeError(`secureRandomInt: maxExclusive must be an integer from 1 to 2^32, got ${maxExclusive}`)
	}
	if (maxExclusive === 1) return 0
	const limit = RANGE - (RANGE % maxExclusive)
	const buffer = new Uint32Array(1)
	for (;;) {
		fill(buffer)
		if (buffer[0] < limit) return buffer[0] % maxExclusive
	}
}
