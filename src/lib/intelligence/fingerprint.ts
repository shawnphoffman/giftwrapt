import { sha256Hex } from './hash'

// Stable fingerprint for a rec. Identical fingerprints across regenerations
// represent "the same recommendation about the same targets" - we use this
// to keep dismissals sticky: if the user dismissed a rec and the next batch
// produces the same fingerprint, we carry the dismissed status forward
// instead of re-creating the rec as active.
//
// The contract: changing the analyzer id, kind, or set of underlying target
// ids changes the fingerprint. Sort the targets so order doesn't matter.
export function fingerprintFor(args: { analyzerId: string; kind: string; fingerprintTargets: ReadonlyArray<string> }): string {
	const sorted = [...args.fingerprintTargets].map(String).sort()
	const payload = `${args.analyzerId}|${args.kind}|${sorted.join(',')}`
	return sha256Hex(payload)
}
