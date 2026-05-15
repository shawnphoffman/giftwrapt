// Unit tests for the opt-in AI rename path added to list-hygiene in
// 2026-05 (phase 2). Covers the prompt builder shape (spoiler-safety
// probe), the response validator (length, banned tokens, title/year
// presence, multi-line rejection), and the regex-fallback contract.
//
// `chooseConvertName` covers the analyzer-internal helper: AI-off
// returns the regex name; AI-on with no provider returns the regex
// name and records a fallback step; AI-on with a valid response
// returns the validated AI name; AI-on past the per-run cap stops
// calling and falls through. The end-to-end branch-1 wiring lives in
// list-hygiene.integration.test.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { chooseConvertName } from '../analyzers/list-hygiene'
import type { AnalyzerContext } from '../context'
import { buildListHygieneRenamePrompt, LIST_HYGIENE_RENAME_AI_CAP, validateRenameResponse } from '../prompts/list-hygiene-rename'

vi.mock('ai', () => ({
	generateObject: vi.fn(),
}))

import { generateObject } from 'ai'

import { DEFAULT_APP_SETTINGS } from '@/lib/settings'

import type { AnalyzerStep } from '../types'

describe('buildListHygieneRenamePrompt', () => {
	it('renders the four inputs in a deterministic shape', () => {
		const prompt = buildListHygieneRenamePrompt({
			currentName: "Sam's Big List",
			newType: 'birthday',
			eventTitle: 'Birthday',
			eventYear: 2026,
		})
		expect(prompt).toContain("Current name: Sam's Big List")
		expect(prompt).toContain('New type: birthday')
		expect(prompt).toContain('Event: Birthday')
		expect(prompt).toContain('Year: 2026')
	})

	it('mentions the banned-word rule so the model bias matches the validator', () => {
		const prompt = buildListHygieneRenamePrompt({
			currentName: 'X',
			newType: 'Christmas',
			eventTitle: 'Christmas',
			eventYear: 2026,
		})
		expect(prompt.toLowerCase()).toContain('never include the words')
		expect(prompt.toLowerCase()).toContain('claim')
		expect(prompt.toLowerCase()).toContain('purchase')
		expect(prompt.toLowerCase()).toContain('gift')
	})

	it('does NOT include item content, owner names, or other-list context', () => {
		// Spoiler-safety probe. The prompt is constructed from the four
		// scalar inputs only; if a future refactor accidentally adds a
		// rendered items array or owner name, the assertion catches it.
		const prompt = buildListHygieneRenamePrompt({
			currentName: 'Whatever',
			newType: 'wishlist',
			eventTitle: 'Birthday',
			eventYear: 2026,
		})
		expect(prompt.toLowerCase()).not.toContain('items:')
		expect(prompt.toLowerCase()).not.toContain('owner:')
		expect(prompt.toLowerCase()).not.toContain('partner')
		expect(prompt.toLowerCase()).not.toContain('dependent')
		expect(prompt.toLowerCase()).not.toContain('other list')
	})
})

describe('validateRenameResponse', () => {
	const args = { eventTitle: 'Birthday', eventYear: 2026 } as const

	it('accepts a clean name containing the event title', () => {
		expect(validateRenameResponse({ name: "Sam's Birthday 2026" }, args)).toBe("Sam's Birthday 2026")
		expect(validateRenameResponse({ name: 'Birthday Bash' }, args)).toBe('Birthday Bash')
	})

	it('accepts a clean name containing the event year even without the title', () => {
		expect(validateRenameResponse({ name: "Sam's 2026 List" }, args)).toBe("Sam's 2026 List")
	})

	it('trims and collapses whitespace before length-checking', () => {
		expect(validateRenameResponse({ name: '   Birthday   2026   ' }, args)).toBe('Birthday 2026')
	})

	it('rejects empty or too-short results', () => {
		expect(validateRenameResponse({ name: '' }, args)).toBeNull()
		expect(validateRenameResponse({ name: '  ' }, args)).toBeNull()
		expect(validateRenameResponse({ name: 'B' }, args)).toBeNull()
	})

	it('rejects names longer than 40 characters', () => {
		const long = 'Birthday 2026 ' + 'a'.repeat(40)
		expect(validateRenameResponse({ name: long }, args)).toBeNull()
	})

	it('rejects banned vocabulary (gift, present, claim, purchase, bought)', () => {
		expect(validateRenameResponse({ name: 'Birthday gifts 2026' }, args)).toBeNull()
		expect(validateRenameResponse({ name: 'Birthday presents 2026' }, args)).toBeNull()
		expect(validateRenameResponse({ name: 'Birthday claims 2026' }, args)).toBeNull()
		expect(validateRenameResponse({ name: 'Things to purchase Birthday 2026' }, args)).toBeNull()
		expect(validateRenameResponse({ name: 'Things bought Birthday 2026' }, args)).toBeNull()
	})

	it('rejects newlines and leading punctuation', () => {
		expect(validateRenameResponse({ name: 'Birthday\n2026' }, args)).toBeNull()
		expect(validateRenameResponse({ name: '.Birthday 2026' }, args)).toBeNull()
		expect(validateRenameResponse({ name: '!Birthday 2026' }, args)).toBeNull()
	})

	it('rejects names that mention neither the event title nor the year', () => {
		expect(validateRenameResponse({ name: "Sam's List" }, args)).toBeNull()
		expect(validateRenameResponse({ name: 'My Cool List' }, args)).toBeNull()
	})

	it('rejects payloads that fail the response schema entirely', () => {
		expect(validateRenameResponse(null, args)).toBeNull()
		expect(validateRenameResponse({}, args)).toBeNull()
		expect(validateRenameResponse({ name: 123 }, args)).toBeNull()
		expect(validateRenameResponse({ unrelated: 'Birthday 2026' }, args)).toBeNull()
	})

	it('is case-insensitive for title and exact for year', () => {
		expect(validateRenameResponse({ name: 'birthday plans' }, args)).toBe('birthday plans')
		expect(validateRenameResponse({ name: 'BIRTHDAY 2026' }, args)).toBe('BIRTHDAY 2026')
		// Year is a substring match, not word-boundary — a longer number
		// containing the year still passes (rare in practice).
		expect(validateRenameResponse({ name: 'Year 12026 plans' }, { eventTitle: 'Mid-Autumn', eventYear: 2026 })).toBe('Year 12026 plans')
	})
})

// ─── chooseConvertName ──────────────────────────────────────────────────────

const mockedGenerateObject = vi.mocked(generateObject)

const noopLogger = { info: () => undefined, warn: () => undefined, error: () => undefined }

// `unknown` cast keeps the test free of the full LanguageModel surface
// (40+ provider-specific fields). chooseConvertName only checks
// `ctx.model !== null` and then forwards to `generateObject`, which is
// the call we mock anyway.
const sentinelModel = { sentinel: true } as unknown as NonNullable<AnalyzerContext['model']>

function buildCtx(opts: Partial<AnalyzerContext> = {}): AnalyzerContext {
	return {
		db: {} as any,
		userId: 'user_test',
		model: null,
		settings: DEFAULT_APP_SETTINGS,
		logger: noopLogger,
		now: new Date('2026-05-14T00:00:00Z'),
		candidateCap: 50,
		dryRun: false,
		dependentId: null,
		subject: { kind: 'user', name: 'You', image: null },
		...opts,
	}
}

describe('chooseConvertName', () => {
	beforeEach(() => {
		mockedGenerateObject.mockReset()
	})

	it('returns the regex name when the AI toggle is off (default)', async () => {
		const steps: Array<AnalyzerStep> = []
		const name = await chooseConvertName({
			ctx: buildCtx({ model: sentinelModel }),
			steps,
			state: { aiCallsUsed: 0 },
			currentName: 'Christmas 2024',
			newType: 'birthday',
			eventTitle: 'Birthday',
			eventYear: 2026,
		})
		expect(name).toBe('Birthday 2026')
		expect(mockedGenerateObject).not.toHaveBeenCalled()
		expect(steps).toEqual([])
	})

	it('records rename-fallback-no-provider when toggle on but model is null', async () => {
		const steps: Array<AnalyzerStep> = []
		const name = await chooseConvertName({
			ctx: buildCtx({ settings: { ...DEFAULT_APP_SETTINGS, intelligenceListHygieneRenameWithAi: true }, model: null }),
			steps,
			state: { aiCallsUsed: 0 },
			currentName: 'Christmas 2024',
			newType: 'birthday',
			eventTitle: 'Birthday',
			eventYear: 2026,
		})
		expect(name).toBe('Birthday 2026')
		expect(mockedGenerateObject).not.toHaveBeenCalled()
		expect(steps.some(s => s.name === 'rename-fallback-no-provider')).toBe(true)
	})

	it('returns the AI name when a valid response comes back', async () => {
		mockedGenerateObject.mockResolvedValue({
			object: { name: "Sam's Birthday 2026" },
			usage: { inputTokens: 50, outputTokens: 8 },
		} as unknown as Awaited<ReturnType<typeof generateObject>>)
		const steps: Array<AnalyzerStep> = []
		const name = await chooseConvertName({
			ctx: buildCtx({ settings: { ...DEFAULT_APP_SETTINGS, intelligenceListHygieneRenameWithAi: true }, model: sentinelModel }),
			steps,
			state: { aiCallsUsed: 0 },
			currentName: "Sam's Big List",
			newType: 'birthday',
			eventTitle: 'Birthday',
			eventYear: 2026,
		})
		expect(name).toBe("Sam's Birthday 2026")
		expect(mockedGenerateObject).toHaveBeenCalledTimes(1)
		expect(steps.some(s => s.name === 'list-hygiene-rename')).toBe(true)
	})

	it('falls back to regex name when the AI response fails validation', async () => {
		mockedGenerateObject.mockResolvedValue({
			object: { name: 'Birthday gifts 2026' },
			usage: { inputTokens: 50, outputTokens: 8 },
		} as unknown as Awaited<ReturnType<typeof generateObject>>)
		const steps: Array<AnalyzerStep> = []
		const name = await chooseConvertName({
			ctx: buildCtx({ settings: { ...DEFAULT_APP_SETTINGS, intelligenceListHygieneRenameWithAi: true }, model: sentinelModel }),
			steps,
			state: { aiCallsUsed: 0 },
			currentName: 'Christmas 2024',
			newType: 'birthday',
			eventTitle: 'Birthday',
			eventYear: 2026,
		})
		expect(name).toBe('Birthday 2026') // regex fallback
		expect(steps.some(s => s.name === 'rename-fallback-validation')).toBe(true)
	})

	it('falls back to regex name when generateObject throws', async () => {
		mockedGenerateObject.mockRejectedValue(new Error('rate-limited'))
		const steps: Array<AnalyzerStep> = []
		const name = await chooseConvertName({
			ctx: buildCtx({ settings: { ...DEFAULT_APP_SETTINGS, intelligenceListHygieneRenameWithAi: true }, model: sentinelModel }),
			steps,
			state: { aiCallsUsed: 0 },
			currentName: 'Christmas 2024',
			newType: 'birthday',
			eventTitle: 'Birthday',
			eventYear: 2026,
		})
		expect(name).toBe('Birthday 2026')
		// list-hygiene-rename step is logged with the error; a separate
		// rename-fallback-error marker is also pushed.
		const errorStep = steps.find(s => s.name === 'list-hygiene-rename')
		expect(errorStep?.error).toContain('rate-limited')
		expect(steps.some(s => s.name === 'rename-fallback-error')).toBe(true)
	})

	it('stops calling the AI after LIST_HYGIENE_RENAME_AI_CAP candidates', async () => {
		mockedGenerateObject.mockResolvedValue({
			object: { name: 'Birthday 2026' },
			usage: { inputTokens: 50, outputTokens: 8 },
		} as unknown as Awaited<ReturnType<typeof generateObject>>)
		const ctx = buildCtx({ settings: { ...DEFAULT_APP_SETTINGS, intelligenceListHygieneRenameWithAi: true }, model: sentinelModel })
		const state = { aiCallsUsed: 0 }
		const steps: Array<AnalyzerStep> = []
		for (let i = 0; i < LIST_HYGIENE_RENAME_AI_CAP + 2; i++) {
			await chooseConvertName({
				ctx,
				steps,
				state,
				currentName: `Christmas ${i}`,
				newType: 'birthday',
				eventTitle: 'Birthday',
				eventYear: 2026,
			})
		}
		expect(mockedGenerateObject).toHaveBeenCalledTimes(LIST_HYGIENE_RENAME_AI_CAP)
		expect(steps.filter(s => s.name === 'rename-fallback-cap').length).toBe(2)
	})
})
