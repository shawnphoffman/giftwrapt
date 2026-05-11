// Heuristic analyzer that nudges the user to declare mothers / fathers
// when Mother's Day or Father's Day is approaching. Single-rec-per-user
// per holiday year; the year goes into the fingerprint so a dismiss
// last year doesn't suppress this year's reminder.
//
// Country picking: v1 uses US for the catalog lookup since the app
// has no per-user country today. Mother's Day / Father's Day land on
// the same Sunday in the US, AU, and CA (approximately), and UK
// Mothering Sunday falls earlier in spring; the US dates are a fine
// approximation for the lead-time window. Refine when per-user
// country is added.

import { eq, sql } from 'drizzle-orm'

import { userRelationLabels } from '@/db/schema'
import { nextOccurrence } from '@/lib/holidays'

import type { Analyzer } from '../analyzer'
import { combineHashes, sha256Hex } from '../hash'
import type { AnalyzerResult } from '../types'

const MOTHERS_DAY_KEY = 'mothers-day'
const FATHERS_DAY_KEY = 'fathers-day'

export const relationLabelsAnalyzer: Analyzer = {
	id: 'relation-labels',
	label: 'People I shop for',
	enabledByDefault: true,
	async run(ctx): Promise<AnalyzerResult> {
		const t0 = Date.now()
		const baseHash = sha256Hex('relation-labels|skip')

		// Per-user only. Dependents are non-actors here.
		if (ctx.subject.kind === 'dependent') {
			return {
				recs: [],
				steps: [{ name: 'check-context', latencyMs: Date.now() - t0 }],
				inputHash: combineHashes([baseHash]),
			}
		}

		// Per-arm gating: each of Mother's / Father's Day has its own
		// master toggle and lead-days. If both arms are off, skip entirely.
		const motherEnabled = ctx.settings.enableMothersDayReminders
		const fatherEnabled = ctx.settings.enableFathersDayReminders
		if (!motherEnabled && !fatherEnabled) {
			return {
				recs: [],
				steps: [{ name: 'check-flag', latencyMs: Date.now() - t0 }],
				inputHash: combineHashes([baseHash]),
			}
		}

		const country = ctx.settings.relationshipRemindersCountry || 'US'
		const motherLeadMs = ctx.settings.mothersDayReminderLeadDays * 24 * 60 * 60 * 1000
		const fatherLeadMs = ctx.settings.fathersDayReminderLeadDays * 24 * 60 * 60 * 1000
		const mdDate = motherEnabled ? await nextOccurrence(country, MOTHERS_DAY_KEY, ctx.now, ctx.db) : null
		const fdDate = fatherEnabled ? await nextOccurrence(country, FATHERS_DAY_KEY, ctx.now, ctx.db) : null

		const motherDue = motherEnabled && mdDate ? mdDate.getTime() - ctx.now.getTime() <= motherLeadMs : false
		const fatherDue = fatherEnabled && fdDate ? fdDate.getTime() - ctx.now.getTime() <= fatherLeadMs : false

		if (!motherDue && !fatherDue) {
			return {
				recs: [],
				steps: [{ name: 'check-window', latencyMs: Date.now() - t0 }],
				inputHash: combineHashes([sha256Hex('relation-labels|out-of-window')]),
			}
		}

		// Count existing labels per kind.
		const counts = await ctx.db
			.select({ label: userRelationLabels.label, count: sql<number>`count(*)::int` })
			.from(userRelationLabels)
			.where(eq(userRelationLabels.userId, ctx.userId))
			.groupBy(userRelationLabels.label)

		const motherCount = counts.find(c => c.label === 'mother')?.count ?? 0
		const fatherCount = counts.find(c => c.label === 'father')?.count ?? 0

		const missingMother = motherDue && motherCount === 0
		const missingFather = fatherDue && fatherCount === 0

		if (!missingMother && !missingFather) {
			return {
				recs: [],
				steps: [{ name: 'check-counts', latencyMs: Date.now() - t0 }],
				inputHash: combineHashes([sha256Hex(`relation-labels|filled|m${motherCount}|f${fatherCount}`)]),
			}
		}

		// Build the body around whichever labels are missing.
		const missingLabels: Array<string> = []
		if (missingMother) missingLabels.push('mothers')
		if (missingFather) missingLabels.push('fathers')
		const noun = missingLabels.join(' and ')

		// Anchor year for stickiness: the next holiday's calendar year.
		const anchorYear =
			(missingMother && mdDate ? mdDate.getFullYear() : null) ??
			(missingFather && fdDate ? fdDate.getFullYear() : null) ??
			new Date().getFullYear()

		const inputHash = sha256Hex(`relation-labels|${anchorYear}|m${missingMother ? '1' : '0'}|f${missingFather ? '1' : '0'}`)

		return {
			recs: [
				{
					kind: 'set-relation-labels',
					severity: 'suggest',
					title: `Tell us who you shop for`,
					body: `${cap(noun)} won’t see this list, but tagging the ${noun} you shop for lets us send you a reminder before the holiday and surface their lists in Suggestions. Head to your profile to add them.`,
					interaction: { kind: 'standard' },
					actions: [
						{
							label: 'Open settings',
							description: 'Add the people you shop for in your profile.',
							intent: 'do',
							nav: { listId: 'settings' },
						},
					],
					affected: undefined,
					relatedLists: undefined,
					// Year-anchored so a dismissal last year doesn't suppress this year's reminder.
					fingerprintTargets: [`year:${anchorYear}`, `m:${missingMother ? '1' : '0'}`, `f:${missingFather ? '1' : '0'}`],
				},
			],
			steps: [{ name: 'evaluate', latencyMs: Date.now() - t0 }],
			inputHash: combineHashes([inputHash]),
		}
	},
}

function cap(s: string): string {
	return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}
