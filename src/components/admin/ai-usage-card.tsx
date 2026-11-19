import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { fetchAiUsageAsAdmin } from '@/api/admin-ai'
import { updateAppSettings } from '@/api/settings'
import { RichMessage } from '@/components/common/rich-message'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminAppSettingsQueryKey, notifyAppSettingsChanged, useAdminAppSettings } from '@/hooks/use-app-settings'
import { aiFeatureLabel, aiSourceLabel } from '@/lib/ai-features'
import type { AiUsageSummary } from '@/lib/ai-usage'
import { formatCurrency, formatDate, formatNumber } from '@/lib/i18n/format'
import type { AppSettings } from '@/lib/settings'
import { m } from '@/paraglide/messages.js'

const aiUsageQueryKey = ['adminAiUsage'] as const

// AI spend is tracked in US dollars whatever the viewer's locale.
const USD_SMALL = { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 } as const

// Cents for real amounts; four places below a cent so a handful of cheap
// calls does not read as $0.00.
function formatCost(microUsd: number): string {
	const dollars = microUsd / 1_000_000
	return dollars > 0 && dollars < 0.01 ? formatNumber(dollars, USD_SMALL) : formatCurrency(dollars, 'USD')
}

export function AiUsageTable({ summary }: { summary: AiUsageSummary }) {
	if (summary.features.length === 0) {
		return <p className="text-sm text-muted-foreground">{m.admin_ai_usage_empty({ days: summary.days })}</p>
	}
	return (
		<div className="overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{m.admin_ai_usage_col_feature()}</TableHead>
						<TableHead className="text-right">{m.admin_ai_usage_col_calls()}</TableHead>
						<TableHead className="text-right">{m.admin_ai_usage_col_errors()}</TableHead>
						<TableHead className="text-right">{m.admin_ai_usage_col_tokens_in()}</TableHead>
						<TableHead className="text-right">{m.admin_ai_usage_col_tokens_out()}</TableHead>
						<TableHead className="text-right">{m.admin_ai_usage_col_cost()}</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{summary.features.map(f => (
						<TableRow key={f.feature}>
							<TableCell>{aiFeatureLabel(f.feature)}</TableCell>
							<TableCell className="text-right tabular-nums">{formatNumber(f.calls)}</TableCell>
							<TableCell className="text-right tabular-nums">{formatNumber(f.errors)}</TableCell>
							<TableCell className="text-right tabular-nums">{formatNumber(f.tokensIn)}</TableCell>
							<TableCell className="text-right tabular-nums">{formatNumber(f.tokensOut)}</TableCell>
							<TableCell className="text-right tabular-nums">{formatCost(f.estimatedCostMicroUsd)}</TableCell>
						</TableRow>
					))}
				</TableBody>
				<TableFooter>
					<TableRow>
						<TableCell>{m.admin_ai_usage_total()}</TableCell>
						<TableCell className="text-right tabular-nums">{formatNumber(summary.total.calls)}</TableCell>
						<TableCell className="text-right tabular-nums">{formatNumber(summary.total.errors)}</TableCell>
						<TableCell className="text-right tabular-nums">{formatNumber(summary.total.tokensIn)}</TableCell>
						<TableCell className="text-right tabular-nums">{formatNumber(summary.total.tokensOut)}</TableCell>
						<TableCell className="text-right tabular-nums">{formatCost(summary.total.estimatedCostMicroUsd)}</TableCell>
					</TableRow>
				</TableFooter>
			</Table>
		</div>
	)
}

const WHEN_FORMAT = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } as const

// Where calls came from, and the latest calls with who they were for.
export function AiUsageDetails({ summary }: { summary: AiUsageSummary }) {
	if (summary.recent.length === 0) return null
	return (
		<Collapsible>
			<CollapsibleTrigger className="group flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
				<ChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" aria-hidden />
				{m.admin_ai_usage_details_toggle()}
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="mt-3 flex flex-col gap-4">
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{m.admin_ai_usage_col_source()}</TableHead>
									<TableHead className="text-right">{m.admin_ai_usage_col_calls()}</TableHead>
									<TableHead className="text-right">{m.admin_ai_usage_col_cost()}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{summary.sources.map(s => (
									<TableRow key={s.source ?? 'unknown'}>
										<TableCell>{aiSourceLabel(s.source)}</TableCell>
										<TableCell className="text-right tabular-nums">{formatNumber(s.calls)}</TableCell>
										<TableCell className="text-right tabular-nums">{formatCost(s.estimatedCostMicroUsd)}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{m.admin_ai_usage_col_when()}</TableHead>
									<TableHead>{m.admin_ai_usage_col_feature()}</TableHead>
									<TableHead>{m.admin_ai_usage_col_source()}</TableHead>
									<TableHead>{m.admin_ai_usage_col_for()}</TableHead>
									<TableHead className="text-right">{m.admin_ai_usage_col_cost()}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{summary.recent.map(r => (
									<TableRow key={r.id}>
										<TableCell className="whitespace-nowrap">{formatDate(r.createdAt, WHEN_FORMAT)}</TableCell>
										<TableCell>
											{r.outcome === 'error' ? (
												<RichMessage
													parts={m.admin_ai_usage_recent_failed.parts({ feature: aiFeatureLabel(r.feature) })}
													tags={{ mark: c => <span className="text-destructive">{c}</span> }}
												/>
											) : (
												aiFeatureLabel(r.feature)
											)}
										</TableCell>
										<TableCell>{aiSourceLabel(r.source)}</TableCell>
										<TableCell>{r.userName ?? m.admin_ai_usage_no_user()}</TableCell>
										<TableCell className="text-right tabular-nums">{formatCost(r.estimatedCostMicroUsd)}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</div>
			</CollapsibleContent>
		</Collapsible>
	)
}

// Empty string means "no ceiling". Anything else must be a non-negative amount.
function parseCeiling(draft: string): { ok: true; value: number | null } | { ok: false } {
	const trimmed = draft.trim()
	if (trimmed === '') return { ok: true, value: null }
	const n = Number(trimmed)
	if (!Number.isFinite(n) || n < 0 || n > 100_000) return { ok: false }
	return { ok: true, value: n }
}

export function AiUsageCard() {
	const queryClient = useQueryClient()
	const { data: settings } = useAdminAppSettings()
	const { data: summary, isLoading } = useQuery({ queryKey: aiUsageQueryKey, queryFn: () => fetchAiUsageAsAdmin(), staleTime: 0 })

	const saved = settings?.aiMonthlyCostCeilingUsd ?? null
	const [draft, setDraft] = useState('')
	useEffect(() => {
		setDraft(saved === null ? '' : String(saved))
	}, [saved])

	const mutation = useMutation({
		mutationFn: (value: number | null) =>
			updateAppSettings({ data: { aiMonthlyCostCeilingUsd: value } } as Parameters<typeof updateAppSettings>[0]),
		onSuccess: data => {
			queryClient.setQueryData<AppSettings>(adminAppSettingsQueryKey, old =>
				old ? { ...old, aiMonthlyCostCeilingUsd: data.aiMonthlyCostCeilingUsd } : old
			)
			notifyAppSettingsChanged(queryClient)
			toast.success(m.admin_ai_setting_updated())
		},
		onError: err => toast.error(err instanceof Error ? err.message : m.admin_ai_setting_update_failed()),
	})

	const parsed = parseCeiling(draft)
	const dirty = parsed.ok && parsed.value !== saved
	const overCeiling = saved !== null && summary !== undefined && summary.monthToDateCostMicroUsd >= saved * 1_000_000

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-2xl">{m.admin_ai_usage_title()}</CardTitle>
				<CardDescription>{m.admin_ai_usage_description()}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				{isLoading || !summary ? (
					<p className="text-sm text-muted-foreground">{m.state_loading()}</p>
				) : (
					<>
						<AiUsageTable summary={summary} />
						<AiUsageDetails summary={summary} />
					</>
				)}

				<div className="flex flex-col gap-2">
					<div className="space-y-0.5">
						<Label htmlFor="aiMonthlyCostCeilingUsd" className="text-base">
							{m.admin_ai_usage_ceiling_label()}
						</Label>
						<p className="text-sm text-muted-foreground">
							{summary
								? m.admin_ai_usage_ceiling_hint_spend({ cost: formatCost(summary.monthToDateCostMicroUsd) })
								: m.admin_ai_usage_ceiling_hint()}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Input
							id="aiMonthlyCostCeilingUsd"
							type="number"
							inputMode="decimal"
							min={0}
							step="0.01"
							value={draft}
							placeholder={m.admin_ai_usage_ceiling_placeholder()}
							disabled={mutation.isPending}
							onChange={e => setDraft(e.target.value)}
							className="w-40"
						/>
						<Button type="button" disabled={!dirty || mutation.isPending} onClick={() => parsed.ok && mutation.mutate(parsed.value)}>
							{mutation.isPending ? m.state_saving() : m.action_save()}
						</Button>
					</div>
					{!parsed.ok && <p className="text-xs text-destructive">{m.admin_ai_usage_ceiling_invalid()}</p>}
					{overCeiling && <p className="text-sm text-destructive">{m.admin_ai_usage_ceiling_reached()}</p>}
				</div>
			</CardContent>
		</Card>
	)
}
