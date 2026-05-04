import { sha256Hex } from './hash'

// Stable fingerprint for a rec. Identical fingerprints across regenerations
// represent "the same recommendation about the same targets" - we use this
// to keep dismissals sticky: if the user dismissed a rec and the next batch
// produces the same fingerprint, we carry the dismissed status forward
// instead of re-creating the rec as active.
//
// The contract: changing the analyzer id, kind, dependent scope, or set of
// underlying target ids changes the fingerprint. Sort the targets so order
// doesn't matter. `dependentId` participates so a "stale items" rec for the
// guardian's own list and the same shape for a dependent-subject list never
// share a fingerprint (otherwise dismissing one would silently dismiss the
// other on the next batch).
export function fingerprintFor(args: {
	analyzerId: string
	kind: string
	fingerprintTargets: ReadonlyArray<string>
	dependentId?: string | null
}): string {
	const sorted = [...args.fingerprintTargets].map(String).sort()
	const dep = args.dependentId ?? ''
	const payload = `${args.analyzerId}|${args.kind}|${dep}|${sorted.join(',')}`
	return sha256Hex(payload)
}
