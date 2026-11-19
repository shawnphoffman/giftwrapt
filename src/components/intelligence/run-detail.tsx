import { ArrowLeft, ArrowRight, MinusCircle, PlusCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatNumber, formatTimeAgo } from '@/lib/i18n/format'
import { m } from '@/paraglide/messages.js'

import type { RunDetailData, RunDetailDiffEntry } from './__fixtures__/types'
import { runStatusLabel, runTriggerLabel } from './admin-intelligence-page'
import { RecommendationCard } from './recommendation-card'

type Props = {
	data: RunDetailData
	onBack?: () => void
	onRerunDryRun?: () => void
	onRerunPersist?: () => void
}

export function RunDetailContent({ data, onBack, onRerunDryRun, onRerunPersist }: Props) {
	const { run } = data
	return (
		<div className="flex flex-col gap-6 max-w-6xl w-full mx-auto px-4 py-6">
			<header className="flex items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<Button size="sm" variant="outline" onClick={onBack}>
						<ArrowLeft className="size-4" /> {m.action_back()}
					</Button>
					<div>
						<h1 className="text-xl font-semibold tracking-tight">{m.admin_intel_detail_title({ id: run.id })}</h1>
						<p className="text-xs text-muted-foreground">
							{run.userName} · {runTriggerLabel(run.trigger)} · {formatTimeAgo(run.startedAt)}
							{run.durationMs && ` · ${run.durationMs}ms`}
						</p>
					</div>
				</div>
				<div className="flex gap-2">
					<Button size="sm" variant="outline" onClick={onRerunDryRun}>
						{m.admin_intel_detail_rerun_dry()}
					</Button>
					<Button size="sm" onClick={onRerunPersist}>
						{m.admin_intel_action_rerun()}
					</Button>
				</div>
			</header>

			<section className="grid grid-cols-1 md:grid-cols-3 gap-3">
				<Stat
					label={m.admin_intel_col_status()}
					value={runStatusLabel(run.status)}
					variant={run.status === 'error' ? 'destructive' : run.status === 'success' ? 'secondary' : 'outline'}
				/>
				<Stat label={m.admin_intel_detail_stat_tokens()} value={`${run.tokensIn ?? 0} / ${run.tokensOut ?? 0}`} />
				<Stat
					label={m.admin_intel_debug_est_cost()}
					value={
						run.estimatedCostUsd
							? formatNumber(run.estimatedCostUsd, {
									style: 'currency',
									currency: 'USD',
									minimumFractionDigits: 4,
									maximumFractionDigits: 4,
								})
							: '-'
					}
				/>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-base font-semibold">{m.admin_intel_detail_inputs_heading()}</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
					{data.candidateInputs.map(input => (
						<Card key={input.analyzerId}>
							<CardContent className="p-4">
								<div className="flex items-center justify-between mb-2">
									<span className="text-sm font-medium">{input.analyzerLabel}</span>
									<span className="text-xs text-muted-foreground">
										{m.admin_intel_detail_input_counts({ items: input.items.length, lists: input.lists.length })}
									</span>
								</div>
								{input.items.length === 0 && input.lists.length === 0 && (
									<div className="text-xs text-muted-foreground italic">{m.admin_intel_detail_heuristic_only()}</div>
								)}
								{input.items.length > 0 && (
									<ul className="text-xs flex flex-col gap-0.5">
										{input.items.slice(0, 6).map(it => (
											<li key={it.id} className="truncate">
												<span className="text-muted-foreground">·</span> {it.title}
											</li>
										))}
										{input.items.length > 6 && (
											<li className="text-muted-foreground italic">{m.admin_intel_detail_more_items({ count: input.items.length - 6 })}</li>
										)}
									</ul>
								)}
								{input.lists.length > 0 && (
									<div className="mt-2 flex flex-wrap gap-1">
										{input.lists.map(l => (
											<Badge key={l.id} variant="outline" className="text-3xs">
												{l.name}
											</Badge>
										))}
									</div>
								)}
							</CardContent>
						</Card>
					))}
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-base font-semibold">{m.admin_intel_detail_steps_heading()}</h2>
				<div className="flex flex-col gap-3">
					{data.steps.map(step => (
						<Card key={step.analyzerId}>
							<CardContent className="p-4 flex flex-col gap-3">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<span className="text-sm font-semibold">{step.analyzerLabel}</span>
										{step.error ? (
											<Badge variant="destructive">{m.admin_intel_status_error()}</Badge>
										) : (
											<Badge variant="secondary">{m.admin_intel_step_badge_ok()}</Badge>
										)}
									</div>
									<div className="text-xs text-muted-foreground tabular-nums">
										{`${step.latencyMs}ms`}
										{step.tokensIn !== undefined &&
											step.tokensIn > 0 &&
											` · ${m.admin_intel_tokens_in_out({ tokensIn: step.tokensIn, tokensOut: step.tokensOut ?? 0 })}`}
									</div>
								</div>
								{step.error && <div className="text-xs text-destructive">{step.error}</div>}
								{step.prompt && (
									<details className="text-xs">
										<summary className="cursor-pointer text-muted-foreground">{m.admin_intel_debug_block_prompt()}</summary>
										<pre className="mt-2 max-h-64 overflow-auto rounded bg-muted/40 p-3 text-2xs whitespace-pre-wrap">{step.prompt}</pre>
									</details>
								)}
								{step.responseRaw && (
									<details className="text-xs">
										<summary className="cursor-pointer text-muted-foreground">{m.admin_intel_detail_raw_response()}</summary>
										<pre className="mt-2 max-h-64 overflow-auto rounded bg-muted/40 p-3 text-2xs whitespace-pre-wrap">
											{step.responseRaw}
										</pre>
									</details>
								)}
								{step.parsed != null && (
									<details className="text-xs">
										<summary className="cursor-pointer text-muted-foreground">{m.admin_intel_debug_block_parsed()}</summary>
										<pre className="mt-2 max-h-64 overflow-auto rounded bg-muted/40 p-3 text-2xs whitespace-pre-wrap">
											{JSON.stringify(step.parsed, null, 2)}
										</pre>
									</details>
								)}
							</CardContent>
						</Card>
					))}
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-base font-semibold">{m.admin_intel_debug_recs_heading()}</h2>
				<div className="flex flex-col gap-2.5">
					{data.resultingRecs.map(rec => (
						<RecommendationCard key={rec.id} rec={rec} />
					))}
				</div>
			</section>

			<Separator />

			<section className="flex flex-col gap-3">
				<h2 className="text-base font-semibold">{m.admin_intel_detail_diff_heading()}</h2>
				<Card>
					<CardContent className="p-3">
						<ul className="flex flex-col gap-1.5">
							{data.diff.map(entry => (
								<DiffRow key={entry.fingerprint} entry={entry} />
							))}
						</ul>
					</CardContent>
				</Card>
			</section>
		</div>
	)
}

function DiffRow({ entry }: { entry: RunDetailDiffEntry }) {
	if (entry.change === 'added')
		return (
			<li className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
				<PlusCircle className="size-4" />
				<span className="font-medium">{m.admin_intel_detail_diff_added()}</span>
				<span className="truncate">{entry.title}</span>
			</li>
		)
	if (entry.change === 'removed')
		return (
			<li className="flex items-center gap-2 text-sm text-muted-foreground">
				<MinusCircle className="size-4" />
				<span className="font-medium">{m.admin_intel_detail_diff_removed()}</span>
				<span className="truncate line-through">{entry.title}</span>
			</li>
		)
	return (
		<li className="flex items-center gap-2 text-sm text-muted-foreground">
			<ArrowRight className="size-4" />
			<span className="font-medium">{m.admin_intel_detail_diff_unchanged()}</span>
			<span className="truncate">{entry.title}</span>
		</li>
	)
}

function Stat({ label, value, variant = 'outline' }: { label: string; value: string; variant?: 'outline' | 'secondary' | 'destructive' }) {
	return (
		<Card>
			<CardContent className="p-3 flex items-center justify-between">
				<span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
				<Badge variant={variant}>{value}</Badge>
			</CardContent>
		</Card>
	)
}
