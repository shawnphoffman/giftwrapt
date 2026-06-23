import { makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SchemaDatabase } from '@/db'
import { appSettings, recommendationRuns, recommendations } from '@/db/schema'
import { DEFAULT_APP_SETTINGS } from '@/lib/settings'

import { buildOperatorDigest, digestWindow, maybeSendOperatorDigest, operatorDigestStatus } from '../operator-digest'

// Stub the transport so tests never touch Resend. isEmailConfigured + the send
// fn are the only resend exports operator-digest depends on.
vi.mock('@/lib/resend', () => ({
	isEmailConfigured: vi.fn(),
	sendOperatorDigestEmail: vi.fn(),
}))
import { isEmailConfigured, sendOperatorDigestEmail } from '@/lib/resend'

const mockIsEmailConfigured = vi.mocked(isEmailConfigured)
const mockSend = vi.mocked(sendOperatorDigestEmail)

beforeEach(() => {
	vi.clearAllMocks()
	mockIsEmailConfigured.mockResolvedValue(true)
	mockSend.mockResolvedValue(null)
})

const NOW = new Date('2026-06-23T12:00:00.000Z')
const IN_WINDOW = new Date('2026-06-20T00:00:00.000Z') // 3 days before NOW
const BEFORE_WINDOW = new Date('2026-06-10T00:00:00.000Z') // 13 days before NOW (outside a 7d window)

function settings(overrides: Partial<typeof DEFAULT_APP_SETTINGS> = {}) {
	return {
		...DEFAULT_APP_SETTINGS,
		intelligenceEnabled: true,
		intelligenceEmailEnabled: true,
		intelligenceEmailWeeklyDigestEnabled: true,
		intelligenceRefreshIntervalDays: 7,
		...overrides,
	}
}

async function insertRun(
	tx: any,
	userId: string,
	o: {
		startedAt: Date
		status: 'success' | 'error' | 'skipped'
		skipReason?: string
		tokensIn?: number
		tokensOut?: number
		costMicro?: number
	}
) {
	await tx.insert(recommendationRuns).values({
		userId,
		startedAt: o.startedAt,
		finishedAt: new Date(o.startedAt.getTime() + 2000),
		status: o.status,
		trigger: 'cron',
		skipReason: o.skipReason ?? null,
		tokensIn: o.tokensIn ?? 0,
		tokensOut: o.tokensOut ?? 0,
		estimatedCostMicroUsd: o.costMicro ?? 0,
	})
}

async function insertRec(
	tx: any,
	userId: string,
	o: { status: 'active' | 'dismissed' | 'applied'; analyzerId?: string; severity?: 'info' | 'suggest' | 'important'; dismissedAt?: Date }
) {
	await tx.insert(recommendations).values({
		userId,
		batchId: crypto.randomUUID(),
		analyzerId: o.analyzerId ?? 'stale-items',
		kind: 'old-items',
		fingerprint: crypto.randomUUID(),
		status: o.status,
		severity: o.severity ?? 'suggest',
		title: 'x',
		body: 'x',
		payload: {},
		dismissedAt: o.dismissedAt ?? null,
	})
}

describe('digestWindow', () => {
	it('uses the trailing interval on first send (no last-sent)', () => {
		const w = digestWindow(null, 7, NOW)
		expect(w.end).toEqual(NOW)
		expect(w.start).toEqual(new Date('2026-06-16T12:00:00.000Z'))
	})

	it('starts at the last send when one exists', () => {
		const last = new Date('2026-06-19T08:00:00.000Z')
		expect(digestWindow(last, 7, NOW).start).toEqual(last)
	})
})

describe('operatorDigestStatus', () => {
	const base = { runs: { total: 0, success: 0, error: 0, skipped: 0 } } as any
	it('flags errors', () =>
		expect(operatorDigestStatus({ ...base, runs: { total: 5, success: 4, error: 1, skipped: 0 } }).tone).toBe('error'))
	it('reports quiet on zero runs', () => expect(operatorDigestStatus(base).tone).toBe('quiet'))
	it('reports ok otherwise', () =>
		expect(operatorDigestStatus({ ...base, runs: { total: 3, success: 3, error: 0, skipped: 0 } }).tone).toBe('ok'))
})

describe('buildOperatorDigest', () => {
	it('aggregates run deltas in-window and rec snapshots', async () => {
		await withRollback(async tx => {
			const u1 = await makeUser(tx)
			const u2 = await makeUser(tx)

			// In-window runs.
			await insertRun(tx, u1.id, { startedAt: IN_WINDOW, status: 'success', tokensIn: 100, tokensOut: 10, costMicro: 1_000_000 })
			await insertRun(tx, u1.id, { startedAt: IN_WINDOW, status: 'error' })
			await insertRun(tx, u2.id, { startedAt: IN_WINDOW, status: 'skipped', skipReason: 'unchanged-input' })
			await insertRun(tx, u2.id, { startedAt: IN_WINDOW, status: 'skipped', skipReason: 'unchanged-input' })
			// Out-of-window run must be ignored.
			await insertRun(tx, u1.id, { startedAt: BEFORE_WINDOW, status: 'success', tokensIn: 999 })

			// Rec snapshot: 2 active, 1 dismissed-in-window, 1 applied.
			await insertRec(tx, u1.id, { status: 'active', analyzerId: 'stale-items', severity: 'important' })
			await insertRec(tx, u1.id, { status: 'active', analyzerId: 'duplicates', severity: 'suggest' })
			await insertRec(tx, u2.id, { status: 'dismissed', dismissedAt: IN_WINDOW })
			await insertRec(tx, u2.id, { status: 'dismissed', dismissedAt: BEFORE_WINDOW }) // out of window
			await insertRec(tx, u1.id, { status: 'applied' })

			const data = await buildOperatorDigest(digestWindow(null, 7, NOW), tx as unknown as SchemaDatabase)

			expect(data.runs).toEqual({ total: 4, success: 1, error: 1, skipped: 2 })
			expect(data.skipReasons).toEqual([{ reason: 'unchanged-input', count: 2 }])
			expect(data.tokensIn).toBe(100) // out-of-window 999 excluded
			expect(data.estimatedCostUsd).toBe(1)
			expect(data.usersProcessed).toBe(2)
			expect(data.activeRecsTotal).toBe(2)
			expect(data.dismissedInWindow).toBe(1) // only the in-window dismissal
			expect(data.appliedTotal).toBe(1)
			// u1 has an error → flagged; u2 has 2 skips (>= threshold) → flagged.
			expect(data.flaggedUsers.map(f => f.userId).sort()).toEqual([u1.id, u2.id].sort())
		})
	})
})

describe('maybeSendOperatorDigest gating', () => {
	it('skips when intelligence is disabled', async () => {
		await withRollback(async tx => {
			const r = await maybeSendOperatorDigest(settings({ intelligenceEnabled: false }), tx as unknown as SchemaDatabase, NOW)
			expect(r).toEqual({ sent: false, reason: 'disabled' })
			expect(mockSend).not.toHaveBeenCalled()
		})
	})

	it('skips when the digest toggle is off', async () => {
		await withRollback(async tx => {
			const r = await maybeSendOperatorDigest(
				settings({ intelligenceEmailWeeklyDigestEnabled: false }),
				tx as unknown as SchemaDatabase,
				NOW
			)
			expect(r.reason).toBe('toggle-off')
		})
	})

	it('skips when email is not configured', async () => {
		mockIsEmailConfigured.mockResolvedValue(false)
		await withRollback(async tx => {
			const r = await maybeSendOperatorDigest(settings(), tx as unknown as SchemaDatabase, NOW)
			expect(r.reason).toBe('email-not-configured')
			expect(mockSend).not.toHaveBeenCalled()
		})
	})

	it('skips with too-soon when within the interval of the last send', async () => {
		await withRollback(async tx => {
			await tx
				.insert(appSettings)
				.values({ key: '__intelligenceDigestLastSentAt', value: new Date('2026-06-20T12:00:00.000Z').toISOString() })
			const r = await maybeSendOperatorDigest(settings(), tx as unknown as SchemaDatabase, NOW)
			expect(r.reason).toBe('too-soon')
			expect(mockSend).not.toHaveBeenCalled()
		})
	})

	it('sends a heartbeat to all admins and stamps last-sent when due', async () => {
		await withRollback(async tx => {
			const a1 = await makeUser(tx, { role: 'admin', email: 'admin1@test.local' })
			await makeUser(tx, { role: 'admin', email: 'admin2@test.local' })
			await makeUser(tx, { role: 'user', email: 'plain@test.local' })

			const r = await maybeSendOperatorDigest(settings(), tx as unknown as SchemaDatabase, NOW)

			expect(r.sent).toBe(true)
			expect(r.recipients).toBe(2)
			expect(mockSend).toHaveBeenCalledTimes(1)
			const [recipients] = mockSend.mock.calls[0]
			expect([...recipients].sort()).toEqual(['admin1@test.local', 'admin2@test.local'])
			expect(a1).toBeTruthy()

			const flag = await tx.select().from(appSettings).where(eq(appSettings.key, '__intelligenceDigestLastSentAt'))
			expect(flag[0]?.value).toBe(NOW.toISOString())
		})
	})

	it('honors the test-recipient override (sends only there)', async () => {
		await withRollback(async tx => {
			await makeUser(tx, { role: 'admin', email: 'admin1@test.local' })
			const r = await maybeSendOperatorDigest(
				settings({ intelligenceEmailTestRecipient: 'qa@test.local' }),
				tx as unknown as SchemaDatabase,
				NOW
			)
			expect(r.sent).toBe(true)
			const [recipients] = mockSend.mock.calls[0]
			expect(recipients).toEqual(['qa@test.local'])
		})
	})

	it('skips with no-recipients when there are no admins and no test recipient', async () => {
		await withRollback(async tx => {
			await makeUser(tx, { role: 'user' })
			const r = await maybeSendOperatorDigest(settings(), tx as unknown as SchemaDatabase, NOW)
			expect(r.reason).toBe('no-recipients')
			expect(mockSend).not.toHaveBeenCalled()
		})
	})
})
