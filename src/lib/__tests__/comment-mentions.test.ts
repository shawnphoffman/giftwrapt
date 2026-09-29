import { describe, expect, it } from 'vitest'

import {
	decodeMentionDraft,
	encodeMentionDraft,
	extractMentionUserIds,
	findActiveMentionQuery,
	formatMentionToken,
	mentionsToPlainText,
	parseCommentSegments,
	rewriteMentions,
} from '../comment-mentions'

describe('parseCommentSegments', () => {
	it('returns a single text segment when there are no mentions', () => {
		expect(parseCommentSegments('just text')).toEqual([{ kind: 'text', text: 'just text' }])
	})

	it('splits text around mention tokens', () => {
		expect(parseCommentSegments('hi @[Ann Lee](u1), and @[Bo](u2)!')).toEqual([
			{ kind: 'text', text: 'hi ' },
			{ kind: 'mention', name: 'Ann Lee', userId: 'u1' },
			{ kind: 'text', text: ', and ' },
			{ kind: 'mention', name: 'Bo', userId: 'u2' },
			{ kind: 'text', text: '!' },
		])
	})

	it('ignores malformed tokens', () => {
		expect(parseCommentSegments('@[Ann](has space) @[](u1) @Ann')).toEqual([{ kind: 'text', text: '@[Ann](has space) @[](u1) @Ann' }])
	})
})

describe('formatMentionToken', () => {
	it('strips brackets and newlines from names so the token stays parseable', () => {
		const token = formatMentionToken({ userId: 'u1', name: 'A[n]n\nLee' })
		expect(token).toBe('@[AnnLee](u1)')
		expect(extractMentionUserIds(token)).toEqual(['u1'])
	})
})

describe('extractMentionUserIds', () => {
	it('returns unique ids in first-appearance order', () => {
		expect(extractMentionUserIds('@[B](u2) @[A](u1) @[B](u2)')).toEqual(['u2', 'u1'])
	})
})

describe('rewriteMentions / mentionsToPlainText', () => {
	it('renames valid mentions and demotes rejected ones to plain text', () => {
		const out = rewriteMentions('@[Old](u1) and @[Gone](u2)', id => (id === 'u1' ? 'New' : null))
		expect(out).toBe('@[New](u1) and @Gone')
	})

	it('flattens every token for plain-text surfaces', () => {
		expect(mentionsToPlainText('thanks @[Ann Lee](u1)!')).toBe('thanks @Ann Lee!')
	})
})

describe('draft round-trip', () => {
	it('decodes stored text into a draft and back', () => {
		const stored = 'ask @[Ann Lee](u1) or @[Bo](u2) about size'
		const { draft, mentions } = decodeMentionDraft(stored)
		expect(draft).toBe('ask @Ann Lee or @Bo about size')
		expect(mentions).toEqual([
			{ userId: 'u1', name: 'Ann Lee' },
			{ userId: 'u2', name: 'Bo' },
		])
		expect(encodeMentionDraft(draft, mentions)).toBe(stored)
	})

	it('drops a picked mention whose @Name was deleted from the draft', () => {
		expect(encodeMentionDraft('never mind', [{ userId: 'u1', name: 'Ann' }])).toBe('never mind')
	})

	it('leaves hand-typed @Names that were never picked as plain text', () => {
		expect(encodeMentionDraft('@Ann and @Bo', [{ userId: 'u1', name: 'Ann' }])).toBe('@[Ann](u1) and @Bo')
	})

	it('prefers the longer picked name when one is a prefix of another', () => {
		const out = encodeMentionDraft('@Ann Lee and @Ann', [
			{ userId: 'short', name: 'Ann' },
			{ userId: 'long', name: 'Ann Lee' },
		])
		expect(out).toBe('@[Ann Lee](long) and @[Ann](short)')
	})

	it('does not match a picked name that is only the front of a longer word', () => {
		expect(encodeMentionDraft('@Annabelle', [{ userId: 'u1', name: 'Ann' }])).toBe('@Annabelle')
	})

	it('treats regex metacharacters in names literally', () => {
		expect(encodeMentionDraft('hi @J.R. (Jr)', [{ userId: 'u1', name: 'J.R. (Jr)' }])).toBe('hi @[J.R. (Jr)](u1)')
	})
})

describe('findActiveMentionQuery', () => {
	it('opens at the start of the text', () => {
		expect(findActiveMentionQuery('@an', 3)).toEqual({ start: 0, query: 'an' })
	})

	it('opens after whitespace, including a first-last query', () => {
		const value = 'hey @Ann L'
		expect(findActiveMentionQuery(value, value.length)).toEqual({ start: 4, query: 'Ann L' })
	})

	it('does not open inside an email address', () => {
		const value = 'mail ann@example.com'
		expect(findActiveMentionQuery(value, value.length)).toBeNull()
	})

	it('closes once the query crosses a newline or a double space', () => {
		expect(findActiveMentionQuery('@ann\nx', 6)).toBeNull()
		expect(findActiveMentionQuery('@ann  x', 7)).toBeNull()
	})

	it('only looks at text before the caret', () => {
		expect(findActiveMentionQuery('@ann rest', 4)).toEqual({ start: 0, query: 'ann' })
	})
})
