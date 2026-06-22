// Unit coverage for the skip-detection heuristic that decides whether a cron
// run is recorded as 'skipped' vs 'success'. Regression guard for the bug
// where the intelligence handler's numeric `skipped: 0` count was mistaken
// for a skip sentinel, so its runs never recorded a success.

import { describe, expect, it } from 'vitest'

import { skipReasonFromResult } from '../record-run'

describe('skipReasonFromResult', () => {
	it('treats a string `skipped` as the skip reason', () => {
		expect(skipReasonFromResult({ ok: true, skipped: 'disabled' })).toBe('disabled')
		expect(skipReasonFromResult({ skipped: 'no-provider' })).toBe('no-provider')
	})

	it('does NOT treat a numeric `skipped` count as a skip (the intelligence summary case)', () => {
		expect(skipReasonFromResult({ ok: true, processed: 5, succeeded: 5, skipped: 0 })).toBeNull()
		expect(skipReasonFromResult({ ok: true, skipped: 3 })).toBeNull()
	})

	it('returns null when there is no `skipped` field', () => {
		expect(skipReasonFromResult({ ok: true, deleted: 2 })).toBeNull()
	})

	it('returns null for non-object results', () => {
		expect(skipReasonFromResult(undefined)).toBeNull()
		expect(skipReasonFromResult(null)).toBeNull()
		expect(skipReasonFromResult('skipped')).toBeNull()
	})
})
