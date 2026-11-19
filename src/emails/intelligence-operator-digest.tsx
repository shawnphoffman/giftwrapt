import { Body, Container, Head, Heading, Hr, Html, Section, Tailwind, Text } from 'react-email'

import type { OperatorDigestData } from '@/lib/intelligence/operator-digest'

import { formatCalendarDate, formatCurrency, formatNumber } from '../lib/i18n/format'
import type { Locale } from '../lib/i18n/locales'
import { m } from '../paraglide/messages.js'
import { previewLocale } from './preview-locale'

interface IntelligenceOperatorDigestEmailProps {
	data: OperatorDigestData
	locale?: Locale
	appTitle?: string
}

function statusLabel(data: OperatorDigestData, locale: Locale): string {
	const o = { locale }
	if (data.runs.error > 0) return m.admin_digest_status_errors({ count: data.runs.error }, o)
	if (data.runs.total === 0) return m.admin_digest_status_quiet({}, o)
	return m.admin_digest_status_ok({}, o)
}

const cell = 'text-[13px] text-black leading-[20px] m-0'
const muted = 'text-[12px] text-[#666] leading-[18px] m-0'
const sectionTitle = 'text-[15px] font-bold text-black m-0 mb-[6px]'

export default function IntelligenceOperatorDigestEmail({
	data,
	locale = 'en',
	appTitle = 'GiftWrapt',
}: IntelligenceOperatorDigestEmailProps) {
	const o = { locale }
	const fmtDate = (iso: string) => formatCalendarDate(iso, { month: 'short', day: 'numeric' }, locale)
	const fmtCount = (n: number) => formatNumber(n, {}, locale)
	const start = fmtDate(data.windowStart)
	const end = fmtDate(data.windowEnd)
	const status = statusLabel(data, locale)
	const runCounts = { total: data.runs.total, success: data.runs.success, errors: data.runs.error, skipped: data.runs.skipped }
	const skips = data.skipReasons.map(s => `${s.reason} (${s.count})`).join(', ')
	const bySeverity = data.activeBySeverity.map(s => `${s.severity} (${s.count})`).join(', ')
	const byAnalyzer = data.activeByAnalyzer.map(a => `${a.analyzerId} (${a.count})`).join(', ')
	const duration = Math.round(data.avgDurationMs)
	const tokensIn = fmtCount(data.tokensIn)
	const tokensOut = fmtCount(data.tokensOut)
	const cost = formatCurrency(data.estimatedCostUsd, 'USD', {}, locale)
	return (
		<Html lang={locale}>
			<Head />
			<Tailwind>
				<Body className="px-2 mx-auto my-auto font-sans bg-[#f4f4f5]">
					<Container className="mx-auto my-[40px] max-w-[560px] rounded border bg-white border-[#eaeaea] border-solid p-[24px]">
						<Heading className="m-0 text-[20px] font-bold text-black">{m.admin_digest_heading({ appTitle }, o)}</Heading>
						<Text className={muted}>{m.admin_digest_header_line({ start, end, status }, o)}</Text>

						<Hr className="my-[16px] border-[#eaeaea]" />

						{/* System health (window delta) */}
						<Section className="mb-[16px]">
							<Text className={sectionTitle}>{m.admin_digest_health_title({}, o)}</Text>
							<Text className={cell}>{m.admin_digest_health_runs(runCounts, o)}</Text>
							{data.skipReasons.length > 0 && <Text className={muted}>{m.admin_digest_skips({ list: skips }, o)}</Text>}
							<Text className={muted}>{m.admin_digest_health_usage({ duration, tokensIn, tokensOut, cost }, o)}</Text>
						</Section>

						{/* Coverage (window delta) */}
						<Section className="mb-[16px]">
							<Text className={sectionTitle}>{m.admin_digest_coverage_title({}, o)}</Text>
							<Text className={cell}>{m.admin_digest_coverage_users({ count: data.usersProcessed }, o)}</Text>
						</Section>

						{/* Output volume (snapshot) */}
						<Section className="mb-[16px]">
							<Text className={sectionTitle}>{m.admin_digest_outstanding_title({}, o)}</Text>
							<Text className={cell}>{m.admin_digest_outstanding_count({ count: data.activeRecsTotal }, o)}</Text>
							{data.activeBySeverity.length > 0 && <Text className={muted}>{m.admin_digest_by_severity({ list: bySeverity }, o)}</Text>}
							{data.activeByAnalyzer.length > 0 && <Text className={muted}>{m.admin_digest_by_analyzer({ list: byAnalyzer }, o)}</Text>}
						</Section>

						{/* Engagement */}
						<Section className="mb-[16px]">
							<Text className={sectionTitle}>{m.admin_digest_engagement_title({}, o)}</Text>
							<Text className={cell}>
								{m.admin_digest_engagement_line({ dismissed: data.dismissedInWindow, applied: data.appliedTotal }, o)}
							</Text>
						</Section>

						{/* Needs attention */}
						{data.flaggedUsers.length > 0 && (
							<Section>
								<Hr className="my-[16px] border-[#eaeaea]" />
								<Text className={sectionTitle}>{m.admin_digest_attention_title({}, o)}</Text>
								{data.flaggedUsers.map(u => {
									const who = u.name ? `${u.name} · ${u.email}` : u.email
									return (
										<Text key={u.userId} className={cell}>
											{m.admin_digest_attention_user({ who, errors: u.errors, skips: u.skips }, o)}
										</Text>
									)
								})}
							</Section>
						)}

						<Hr className="my-[16px] border-[#eaeaea]" />
						<Text className={muted}>{m.admin_digest_footer({}, o)}</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	)
}

IntelligenceOperatorDigestEmail.PreviewProps = {
	locale: previewLocale,
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
