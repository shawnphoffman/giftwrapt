import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { fetchAiUsageAsAdmin } from '@/api/admin-ai'
import { updateAppSettings } from '@/api/settings'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminAppSettingsQueryKey, notifyAppSettingsChanged, useAdminAppSettings } from '@/hooks/use-app-settings'
import { aiFeatureLabel, aiSourceLabel } from '@/lib/ai-features'
import type { AiUsageSummary } from '@/lib/ai-usage'
import type { AppSettings } from '@/lib/settings'

const aiUsageQueryKey = ['adminAiUsage'] as const

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const usdSmall = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 })
const count = new Intl.NumberFormat('en-US')

// Cents for real amounts; four places below a cent so a handful of cheap
// calls does not read as $0.00.
function formatCost(microUsd: number): string {
	const dollars = microUsd / 1_000_000
	return dollars > 0 && dollars < 0.01 ? usdSmall.format(dollars) : usd.format(dollars)
}

export function AiUsageTable({ summary }: { summary: AiUsageSummary }) {
	if (summary.features.length === 0) {
		return <p className="text-sm text-muted-foreground">No AI calls in the last {summary.days} days.</p>
	}
	return (
		<div className="overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Feature</TableHead>
						<TableHead className="text-right">Calls</TableHead>
						<TableHead className="text-right">Errors</TableHead>
						<TableHead className="text-right">Tokens In</TableHead>
						<TableHead className="text-right">Tokens Out</TableHead>
						<TableHead className="text-right">Est. Cost</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{summary.features.map(f => (
						<TableRow key={f.feature}>
							<TableCell>{aiFeatureLabel(f.feature)}</TableCell>
							<TableCell className="text-right tabular-nums">{count.format(f.calls)}</TableCell>
							<TableCell className="text-right tabular-nums">{count.format(f.errors)}</TableCell>
							<TableCell className="text-right tabular-nums">{count.format(f.tokensIn)}</TableCell>
							<TableCell className="text-right tabular-nums">{count.format(f.tokensOut)}</TableCell>
							<TableCell className="text-right tabular-nums">{formatCost(f.estimatedCostMicroUsd)}</TableCell>
						</TableRow>
					))}
				</TableBody>
				<TableFooter>
					<TableRow>
						<TableCell>Total</TableCell>
						<TableCell className="text-right tabular-nums">{count.format(summary.total.calls)}</TableCell>
						<TableCell className="text-right tabular-nums">{count.format(summary.total.errors)}</TableCell>
						<TableCell className="text-right tabular-nums">{count.format(summary.total.tokensIn)}</TableCell>
						<TableCell className="text-right tabular-nums">{count.format(summary.total.tokensOut)}</TableCell>
						<TableCell className="text-right tabular-nums">{formatCost(summary.total.estimatedCostMicroUsd)}</TableCell>
					</TableRow>
				</TableFooter>
			</Table>
		</div>
	)
}

const when = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

// Where calls came from, and the latest calls with who they were for.
export function AiUsageDetails({ summary }: { summary: AiUsageSummary }) {
	if (summary.recent.length === 0) return null
	return (
		<Collapsible>
			<CollapsibleTrigger className="group flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
				<ChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" aria-hidden />
				Where calls came from, and recent calls
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="mt-3 flex flex-col gap-4">
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Started From</TableHead>
									<TableHead className="text-right">Calls</TableHead>
									<TableHead className="text-right">Est. Cost</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{summary.sources.map(s => (
									<TableRow key={s.source ?? 'unknown'}>
										<TableCell>{aiSourceLabel(s.source)}</TableCell>
										<TableCell className="text-right tabular-nums">{count.format(s.calls)}</TableCell>
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
									<TableHead>When</TableHead>
									<TableHead>Feature</TableHead>
									<TableHead>Started From</TableHead>
									<TableHead>For</TableHead>
									<TableHead className="text-right">Est. Cost</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{summary.recent.map(r => (
									<TableRow key={r.id}>
										<TableCell className="whitespace-nowrap">{when.format(new Date(r.createdAt))}</TableCell>
										<TableCell>
											{aiFeatureLabel(r.feature)}
											{r.outcome === 'error' && <span className="text-destructive"> (failed)</span>}
										</TableCell>
										<TableCell>{aiSourceLabel(r.source)}</TableCell>
										<TableCell>{r.userName ?? 'No user'}</TableCell>
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
			toast.success('Setting updated')
		},
		onError: err => toast.error(err instanceof Error ? err.message : 'Failed to update setting'),
	})

	const parsed = parseCeiling(draft)
	const dirty = parsed.ok && parsed.value !== saved
	const overCeiling = saved !== null && summary !== undefined && summary.monthToDateCostMicroUsd >= saved * 1_000_000

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-2xl">AI Usage</CardTitle>
				<CardDescription>
					Every AI call this deployment made in the last 30 days, by feature. Costs are estimates from token counts, not a bill from your
					provider.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				{isLoading || !summary ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : (
					<>
						<AiUsageTable summary={summary} />
						<AiUsageDetails summary={summary} />
					</>
				)}

				<div className="flex flex-col gap-2">
					<div className="space-y-0.5">
						<Label htmlFor="aiMonthlyCostCeilingUsd" className="text-base">
							Monthly Ceiling (USD)
						</Label>
						<p className="text-sm text-muted-foreground">
							When this month’s estimated spend reaches the ceiling, AI features stop until next month. Leave empty for no ceiling.
							{summary && <> This month so far: {formatCost(summary.monthToDateCostMicroUsd)}.</>}
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
							placeholder="No ceiling"
							disabled={mutation.isPending}
							onChange={e => setDraft(e.target.value)}
							className="w-40"
						/>
						<Button type="button" disabled={!dirty || mutation.isPending} onClick={() => parsed.ok && mutation.mutate(parsed.value)}>
							{mutation.isPending ? 'Saving…' : 'Save'}
						</Button>
					</div>
					{!parsed.ok && <p className="text-xs text-destructive">Enter an amount between 0 and 100000, or leave it empty.</p>}
					{overCeiling && (
						<p className="text-sm text-destructive">
							The ceiling has been reached. AI features are paused until next month or until you raise it.
						</p>
					)}
				</div>
			</CardContent>
		</Card>
	)
}
