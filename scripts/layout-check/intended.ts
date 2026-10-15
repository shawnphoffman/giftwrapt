/**
 * Findings reviewed with the operator and kept on purpose (plan 30a).
 *
 * A matching finding is still measured and reported, but under "Recorded as
 * intended" with its reason, and never counts as new in diff mode. Match as
 * narrowly as the finding allows: a new element that happens to share the
 * classes should still show up as open.
 */

import type { Finding, FindingKind } from './measure'

interface IntendedEntry {
	/** Why it stays. Shown in the summary. */
	reason: string
	kind: FindingKind
	/** Button findings: the exact override classes, space-separated. */
	overrides?: string
	/** Matched against the first element's text (`[aria-label] text`). */
	text: RegExp
}

export const INTENDED: ReadonlyArray<IntendedEntry> = [
	{
		reason: 'The markdown toolbar buttons are compact (28px) on purpose',
		kind: 'button-variant',
		overrides: 'size-7 text-muted-foreground',
		text: /^\[(Bold|Italic|Link|List)\]/,
	},
]

export function intendedReason(finding: Finding): string | null {
	for (const entry of INTENDED) {
		if (entry.kind !== finding.kind) continue
		if (entry.overrides != null) {
			const overrides = (finding.detail.overrides as Array<string> | undefined)?.join(' ') ?? ''
			if (overrides !== entry.overrides) continue
		}
		if (!entry.text.test(finding.elements[0]?.text ?? '')) continue
		return entry.reason
	}
	return null
}
