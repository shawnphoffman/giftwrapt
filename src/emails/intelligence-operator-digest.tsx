import { Body, Container, Head, Heading, Hr, Html, Section, Tailwind, Text } from 'react-email'

import type { OperatorDigestData } from '@/lib/intelligence/operator-digest'

interface IntelligenceOperatorDigestEmailProps {
	data: OperatorDigestData
	appTitle?: string
}

function fmtDate(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function fmtUsd(n: number): string {
	return `$${n.toFixed(2)}`
}

function statusLabel(data: OperatorDigestData): string {
	if (data.runs.error > 0) return `${data.runs.error} error${data.runs.error === 1 ? '' : 's'} need attention`
	if (data.runs.total === 0) return 'no runs this period'
	return 'all clear'
}

const cell = 'text-[13px] text-black leading-[20px] m-0'
const muted = 'text-[12px] text-[#666] leading-[18px] m-0'
const sectionTitle = 'text-[15px] font-bold text-black m-0 mb-[6px]'

export default function IntelligenceOperatorDigestEmail({ data, appTitle = 'GiftWrapt' }: IntelligenceOperatorDigestEmailProps) {
	const period = `${fmtDate(data.windowStart)} – ${fmtDate(data.windowEnd)}`
	return (
		<Html>
			<Head />
			<Tailwind>
				<Body className="px-2 mx-auto my-auto font-sans bg-[#f4f4f5]">
					<Container className="mx-auto my-[40px] max-w-[560px] rounded border bg-white border-[#eaeaea] border-solid p-[24px]">
						<Heading className="m-0 text-[20px] font-bold text-black">{appTitle} Intelligence digest</Heading>
						<Text className={muted}>
							{period} · {statusLabel(data)}
						</Text>

						<Hr className="my-[16px] border-[#eaeaea]" />

						{/* System health (window delta) */}
						<Section className="mb-[16px]">
							<Text className={sectionTitle}>System health (this period)</Text>
							<Text className={cell}>
								{data.runs.total} run{data.runs.total === 1 ? '' : 's'} · {data.runs.success} ok · {data.runs.error} error ·{' '}
								{data.runs.skipped} skipped
							</Text>
							{data.skipReasons.length > 0 && (
								<Text className={muted}>Skips: {data.skipReasons.map(s => `${s.reason} (${s.count})`).join(', ')}</Text>
							)}
							<Text className={muted}>
								Avg duration {Math.round(data.avgDurationMs)}ms · {data.tokensIn.toLocaleString()} in / {data.tokensOut.toLocaleString()}{' '}
								out tokens · {fmtUsd(data.estimatedCostUsd)}
							</Text>
						</Section>

						{/* Coverage (window delta) */}
						<Section className="mb-[16px]">
							<Text className={sectionTitle}>Coverage (this period)</Text>
							<Text className={cell}>
								{data.usersProcessed} user{data.usersProcessed === 1 ? '' : 's'} had a run.
							</Text>
						</Section>

						{/* Output volume (snapshot) */}
						<Section className="mb-[16px]">
							<Text className={sectionTitle}>Outstanding recommendations (current)</Text>
							<Text className={cell}>
								{data.activeRecsTotal} active recommendation{data.activeRecsTotal === 1 ? '' : 's'} right now.
							</Text>
							{data.activeBySeverity.length > 0 && (
								<Text className={muted}>By severity: {data.activeBySeverity.map(s => `${s.severity} (${s.count})`).join(', ')}</Text>
							)}
							{data.activeByAnalyzer.length > 0 && (
								<Text className={muted}>By analyzer: {data.activeByAnalyzer.map(a => `${a.analyzerId} (${a.count})`).join(', ')}</Text>
							)}
						</Section>

						{/* Engagement */}
						<Section className="mb-[16px]">
							<Text className={sectionTitle}>Engagement</Text>
							<Text className={cell}>
								{data.dismissedInWindow} dismissed this period · {data.appliedTotal} applied (total, current)
							</Text>
						</Section>

						{/* Needs attention */}
						{data.flaggedUsers.length > 0 && (
							<Section>
								<Hr className="my-[16px] border-[#eaeaea]" />
								<Text className={sectionTitle}>Needs attention</Text>
								{data.flaggedUsers.map(u => (
									<Text key={u.userId} className={cell}>
										{u.name ? `${u.name} · ` : ''}
										{u.email} — {u.errors} error{u.errors === 1 ? '' : 's'}, {u.skips} skip{u.skips === 1 ? '' : 's'}
									</Text>
								))}
							</Section>
						)}

						<Hr className="my-[16px] border-[#eaeaea]" />
						<Text className={muted}>
							Health, coverage, cost, and dismissals reflect this period. Outstanding recommendations and applied totals are a current
							snapshot. Sent to deployment admins; manage in Admin → Intelligence → Notifications.
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

IntelligenceOperatorDigestEmail.PreviewProps = {
	appTitle: 'GiftWrapt',
	data: {
		windowStart: '2026-06-16T00:00:00.000Z',
		windowEnd: '2026-06-23T00:00:00.000Z',
		runs: { total: 142, success: 128, error: 3, skipped: 11 },
		skipReasons: [
			{ reason: 'unchanged-input', count: 8 },
			{ reason: 'lock-held', count: 3 },
		],
		avgDurationMs: 4210,
		tokensIn: 1_284_000,
		tokensOut: 96_400,
		estimatedCostUsd: 3.71,
		usersProcessed: 131,
		dismissedInWindow: 22,
		activeRecsTotal: 318,
		activeByAnalyzer: [
			{ analyzerId: 'stale-items', count: 140 },
			{ analyzerId: 'duplicates', count: 92 },
			{ analyzerId: 'grouping', count: 86 },
		],
		activeBySeverity: [
			{ severity: 'info', count: 120 },
			{ severity: 'suggest', count: 168 },
			{ severity: 'important', count: 30 },
		],
		appliedTotal: 57,
		flaggedUsers: [
			{ userId: 'u1', email: 'alex@example.com', name: 'Alex', errors: 2, skips: 0 },
			{ userId: 'u2', email: 'sam@example.com', name: null, errors: 0, skips: 3 },
		],
	},
} as IntelligenceOperatorDigestEmailProps
