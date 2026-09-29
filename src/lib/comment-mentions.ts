// @mention tokens inside item comment text. Client-safe: no db imports.
//
// A mention is stored inline in `item_comments.comment` as
// `@[Display Name](userId)`. The embedded name is a snapshot; readers
// refresh it to the user's current name server-side (see
// `comment-mentions-server.ts`), so the snapshot only matters when the
// user no longer exists.
//
// The composer never shows raw tokens. It edits a "draft" where each
// mention reads as `@Display Name`, tracks the picked mentions alongside,
// and encodes back to tokens on submit (`encodeMentionDraft`). Typing
// `@Name` by hand without picking from the typeahead is plain text.

export type MentionRef = { userId: string; name: string }

export type CommentSegment = { kind: 'text'; text: string } | { kind: 'mention'; userId: string; name: string }

const MENTION_TOKEN_RE = /@\[([^[\]\n]{1,200})\]\(([^()\s]{1,200})\)/g

// Brackets would break the token grammar; newlines never belong in a name.
export function sanitizeMentionName(name: string): string {
	return name.replace(/[[\]\n\r]/g, '').trim() || 'someone'
}

export function formatMentionToken(ref: MentionRef): string {
	return `@[${sanitizeMentionName(ref.name)}](${ref.userId})`
}

export function parseCommentSegments(text: string): Array<CommentSegment> {
	const out: Array<CommentSegment> = []
	let last = 0
	for (const m of text.matchAll(MENTION_TOKEN_RE)) {
		const start = m.index
		if (start > last) out.push({ kind: 'text', text: text.slice(last, start) })
		out.push({ kind: 'mention', name: m[1], userId: m[2] })
		last = start + m[0].length
	}
	if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
	return out
}

// Unique user ids in first-appearance order.
export function extractMentionUserIds(text: string): Array<string> {
	const ids: Array<string> = []
	for (const seg of parseCommentSegments(text)) {
		if (seg.kind === 'mention' && !ids.includes(seg.userId)) ids.push(seg.userId)
	}
	return ids
}

// Rewrites every token. `resolve` returns the replacement name for a
// valid mention, or null to demote the token to plain `@Name` text.
export function rewriteMentions(text: string, resolve: (userId: string, name: string) => string | null): string {
	return parseCommentSegments(text)
		.map(seg => {
			if (seg.kind === 'text') return seg.text
			const name = resolve(seg.userId, seg.name)
			return name === null ? `@${seg.name}` : formatMentionToken({ userId: seg.userId, name })
		})
		.join('')
}

// Plain-text rendering for surfaces that can't style a mention (emails).
export function mentionsToPlainText(text: string): string {
	return rewriteMentions(text, () => null)
}

// Stored text -> composer draft + the mentions it contains.
export function decodeMentionDraft(text: string): { draft: string; mentions: Array<MentionRef> } {
	const mentions: Array<MentionRef> = []
	const draft = parseCommentSegments(text)
		.map(seg => {
			if (seg.kind === 'text') return seg.text
			if (!mentions.some(m => m.userId === seg.userId)) mentions.push({ userId: seg.userId, name: seg.name })
			return `@${seg.name}`
		})
		.join('')
	return { draft, mentions }
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Composer draft -> stored text. Each picked mention whose `@Name` still
// appears in the draft becomes a token; a mention the user deleted from
// the text simply drops out. Longer names go first so `@Ann Lee` wins
// over `@Ann` when both were picked.
export function encodeMentionDraft(draft: string, mentions: ReadonlyArray<MentionRef>): string {
	const byName = new Map<string, MentionRef>()
	for (const m of mentions) {
		const name = sanitizeMentionName(m.name)
		if (!byName.has(name)) byName.set(name, { userId: m.userId, name })
	}
	if (byName.size === 0) return draft
	const names = [...byName.keys()].sort((a, b) => b.length - a.length)
	// A mention must end at a non-word boundary so `@Ann` doesn't match
	// the front of `@Annabelle` typed as plain text.
	const re = new RegExp(`@(${names.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}_])`, 'gu')
	return draft.replace(re, (_match, name: string) => formatMentionToken(byName.get(name)!))
}

// The `@query` being typed at the caret, if any. An `@` only opens a
// mention at the start of the text or after whitespace, and the query
// can hold single spaces (for "First Last") but not newlines.
export function findActiveMentionQuery(value: string, caret: number): { start: number; query: string } | null {
	const before = value.slice(0, caret)
	const at = before.lastIndexOf('@')
	if (at === -1) return null
	if (at > 0 && !/\s/.test(before[at - 1])) return null
	const query = before.slice(at + 1)
	if (query.length > 50 || /\n/.test(query) || /\s{2}/.test(query) || query.startsWith(' ')) return null
	return { start: at, query }
}
