import { z } from 'zod'

// NOTE: keep these schemas shape-only - OpenAI's structured-output
// validator rejects `maxItems` on arrays and `min`/`max` on strings, and
// wants every field required. Bound and validate the response in the
// analyzer instead.
export const groupingSuggestionSchema = z.object({
	action: z.enum(['new', 'add']),
	groupType: z.enum(['or', 'order']),
	// Existing group id for "add"; empty string for "new".
	groupId: z.string(),
	itemIds: z.array(z.string()),
	rationale: z.string(),
})

export const groupingResponseSchema = z.object({
	suggestions: z.array(groupingSuggestionSchema),
})

export type GroupingResponse = z.infer<typeof groupingResponseSchema>

// Fresh (not-yet-dismissed) group recs one run can surface.
export const GROUPING_MAX_SUGGESTIONS = 6
// Ungrouped items one list sends to the model. Longer lists fall back to
// the lexical clustering heuristic to pick which items to send.
export const GROUPING_MAX_LIST_ITEMS = 150
// Cluster size cap for that fallback heuristic.
export const GROUPING_MAX_CLUSTER_SIZE = 6

export type GroupingListCandidate = {
	listName: string
	groups: ReadonlyArray<{ groupId: string; type: 'or' | 'order'; titles: ReadonlyArray<string> }>
	items: ReadonlyArray<{ itemId: string; title: string }>
}

// Stable instructions block. Identical across users and runs.
export const GROUPING_SYSTEM = [
	"You are a wishlist hygiene assistant. You receive ONE of a user's lists: its existing item groups and its ungrouped items. Find ungrouped items that belong together.",
	'',
	'There are two kinds of group:',
	'- "or": the user almost certainly wants ONLY ONE of these. Alternates of the same need - different brands of the same product, different styles or colors of the same garment, competing models of the same gadget.',
	'- "order": the user wants these in sequence. One item is a prerequisite or accessory for another - a console before its controllers, a camera body before lenses, a printer before its consumables.',
	'',
	'You can suggest:',
	'- "new": a new group of two or more ungrouped items.',
	'- "add": adding one or more ungrouped items to an EXISTING group, when they are clearly more of the same (another alternate for an "or" group, or a later step for an "order" group).',
	'',
	'Rules:',
	'- Include EVERY ungrouped item that belongs in a group, not just the closest pair. A group can have any number of items.',
	'- A list can hold several separate groups. Return each one as its own suggestion.',
	'- Each item can appear in at most one suggestion.',
	'- Only "add" to an "order" group when the new items come after all of its current items.',
	'- Items that merely share a category, brand, material, or theme are NOT a group when they fill different needs (a sweater and joggers, a sun hat and sunscreen, two different national park shirts the user could want both of). Only group items when owning all of them at once would feel redundant ("or") or pointless without the prerequisite ("order").',
	'- Grouping locks claim semantics: claiming one "or" item locks the others, and "order" forces a purchase sequence. A wrong group frustrates the recipient and the gifter, so leave an item out when you are not confident. Returning no suggestions is fine.',
	'',
	'For each suggestion, return:',
	'- action: "new" or "add".',
	'- groupType: "or" or "order". For "add", the existing group\'s type.',
	'- groupId: for "add", the existing group\'s id. For "new", an empty string.',
	'- itemIds: the ungrouped item ids to group. For a new "order" group, list them in the order they should be PURCHASED (prerequisite first). For "add" to an "order" group, in the order they come after the existing items.',
	'- rationale: one sentence explaining the grouping in plain language. Do not reference ids.',
	'',
	'NEVER mention gift claims, gifters, or who has purchased anything. You do not have that information.',
	'',
	'Response shape: { suggestions: [{ action, groupType, groupId, itemIds, rationale }, ...] }.',
].join('\n')

// Variable suffix: the one list being judged.
export function buildGroupingUserPrompt(list: GroupingListCandidate): string {
	const lines: Array<string> = [`List "${list.listName}"`, '', 'Existing groups:']
	if (list.groups.length === 0) lines.push('    (none)')
	for (const group of list.groups) {
		const label = group.type === 'or' ? 'pick one' : 'in order'
		lines.push(`    group id=${group.groupId} (${group.type}, ${label}): ${group.titles.map(t => `"${t}"`).join('; ')}`)
	}
	lines.push('', 'Ungrouped items:')
	for (const item of list.items) lines.push(`    - "${item.title}" (id=${item.itemId})`)
	return lines.join('\n')
}

// Single-string builder for callers that don't split system / user.
export function buildGroupingPrompt(list: GroupingListCandidate): string {
	return `${GROUPING_SYSTEM}\n\n${buildGroupingUserPrompt(list)}`
}
