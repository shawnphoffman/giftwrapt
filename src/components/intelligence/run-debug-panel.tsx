import { format } from 'date-fns'
import { AlertTriangle, Loader2 } from 'lucide-react'

import { RichMessage } from '@/components/common/rich-message'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { dateFnsLocale, formatNumber, formatTimeAgo } from '@/lib/i18n/format'
import { m } from '@/paraglide/messages.js'

import { runStatusLabel, runTriggerLabel } from './admin-intelligence-page'

export type RunDebugStep = {
	id: number
	analyzerId: string
	analyzerLabel: string
	prompt: string | null
	responseRaw: string | null
	// jsonb-encoded analyzer output, serialized at the server boundary.
	parsedJson: string | null
	tokensIn: number
	tokensOut: number
	latencyMs: number
	error: string | null
}

export type RunDebugRec = {
	id: string
	analyzerId: string
	analyzerLabel: string
	kind: string
	status: 'active' | 'dismissed' | 'applied'
	severity: 'info' | 'suggest' | 'important'
	title: string
	body: string
	payloadJson: string | null
	fingerprint: string
	createdAt: Date | string
	dismissedAt: Date | string | null
}

export type RunDebugRun = {
	id: string
	userName: string
	startedAt: Date | string
	finishedAt: Date | string | null
	status: 'running' | 'success' | 'error' | 'skipped'
	trigger: 'cron' | 'manual'
	skipReason: string | null
	error: string | null
	tokensIn: number
	tokensOut: number
	estimatedCostUsd: number
	durationMs: number | null
	inputHash: string | null
}

export type RunDebugData = {
	run: RunDebugRun
	steps: Array<RunDebugStep>
	recs: Array<RunDebugRec>
}

type Props = {
	state: { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'loaded'; data: RunDebugData }
}

export function RunDebugPanel({ state }: Props) {
	if (state.kind === 'loading') {
		return (
			<div data-intelligence="admin-run-debug-loading" className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
				<Loader2 className="size-4 animate-spin" /> {m.admin_intel_debug_loading()}
			</div>
		)
	}
	if (state.kind === 'error') {
		return (
			<div data-intelligence="admin-run-debug-error" className="flex items-start gap-2 p-6 text-sm text-destructive">
				<AlertTriangle className="size-4 mt-0.5" />
				<div>
					<div className="font-medium">{m.admin_intel_debug_load_failed()}</div>
					<div className="text-xs text-muted-foreground">{state.message}</div>
				</div>
			</div>
		)
	}

	const { run, steps, recs } = state.data
	const startedAt = toDate(run.startedAt)
	const startedAtFull = format(startedAt, 'PPpp', { locale: dateFnsLocale() })

	return (
		<div data-intelligence="admin-run-debug" className="flex flex-col gap-4 p-4 overflow-y-auto">
			<section className="flex flex-col gap-1.5">
				<div className="flex items-center gap-2 flex-wrap">
					<StatusBadge status={run.status} />
					<Badge variant="outline">{runTriggerLabel(run.trigger)}</Badge>
					<span className="text-xs text-muted-foreground">{run.userName}</span>
				</div>
				<div className="text-xs text-muted-foreground">
					{startedAtFull} · {formatTimeAgo(startedAt)}
					{run.durationMs != null && ` · ${run.durationMs}ms`}
				</div>
				<div className="grid grid-cols-3 gap-2 mt-2">
					<MiniStat label={m.admin_intel_debug_tokens_in()} value={formatNumber(run.tokensIn, { useGrouping: false })} />
					<MiniStat label={m.admin_intel_debug_tokens_out()} value={formatNumber(run.tokensOut, { useGrouping: false })} />
					<MiniStat
						label={m.admin_intel_debug_est_cost()}
						value={formatNumber(run.estimatedCostUsd, {
							style: 'currency',
							currency: 'USD',
							minimumFractionDigits: 4,
							maximumFractionDigits: 4,
						})}
					/>
				</div>
				{run.skipReason && (
					<div className="text-xs text-muted-foreground mt-1">
						<RichMessage
							parts={m.admin_intel_debug_skip_reason.parts({ reason: run.skipReason })}
							tags={{ code: c => <span className="font-mono">{c}</span> }}
						/>
					</div>
				)}
				{run.error && <div className="text-xs text-destructive font-mono mt-1 whitespace-pre-wrap">{run.error}</div>}
				{run.inputHash && (
					<div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
						<span>{m.admin_intel_debug_input_hash()}</span>
						<span className="font-mono" title={run.inputHash}>
							{run.inputHash.slice(0, 12)}…
						</span>
					</div>
				)}
			</section>

			<Separator />

			<section className="flex flex-col gap-2">
				<div className="flex items-baseline justify-between gap-2 flex-wrap">
					<h3 className="text-sm font-semibold">
						{m.admin_intel_debug_steps_heading()} <span className="text-muted-foreground font-normal">({steps.length})</span>
					</h3>
					<StepBreakdownInline steps={steps} />
				</div>
				{steps.length === 0 ? (
					<p data-intelligence="admin-run-debug-no-steps" className="text-xs text-muted-foreground">
						{m.admin_intel_debug_no_steps()}
					</p>
				) : (
					<div className="flex flex-col gap-2">
						{steps.map(step => (
							<StepCard key={step.id} step={step} />
						))}
					</div>
				)}
			</section>

			<Separator />

			<section className="flex flex-col gap-2">
				<h3 className="text-sm font-semibold">
					{m.admin_intel_debug_recs_heading()} <span className="text-muted-foreground font-normal">({recs.length})</span>
				</h3>
				{recs.length === 0 ? (
					<p data-intelligence="admin-run-debug-no-recs" className="text-xs text-muted-foreground">
						{m.admin_intel_debug_no_recs()}
					</p>
				) : (
					<div className="flex flex-col gap-2">
						{recs.map(rec => (
							<RecCard key={rec.id} rec={rec} />
						))}
					</div>
				)}
			</section>
		</div>
	)
}

function StepCard({ step }: { step: RunDebugStep }) {
	const hasBody = !!step.error || !!step.prompt || !!step.responseRaw || step.parsedJson != null
	const isHeuristic = !step.prompt && !step.responseRaw && step.parsedJson == null && !step.error
	return (
		<Card size="sm" data-intelligence="admin-run-debug-step" data-analyzer={step.analyzerId}>
			<CardHeader>
				<CardTitle className="flex items-center justify-between gap-2">
					<span className="flex items-center gap-2">
						{step.analyzerLabel}
						{step.error ? (
							<Badge variant="destructive">{m.admin_intel_status_error()}</Badge>
						) : (
							<Badge variant="secondary">{m.admin_intel_step_badge_ok()}</Badge>
						)}
					</span>
					<span className="text-2xs font-normal text-muted-foreground tabular-nums">
						{`${step.latencyMs}ms`}
						{(step.tokensIn > 0 || step.tokensOut > 0) &&
							` · ${m.admin_intel_tokens_in_out({ tokensIn: step.tokensIn, tokensOut: step.tokensOut })}`}
					</span>
				</CardTitle>
			</CardHeader>
			{(hasBody || isHeuristic) && (
				<CardContent className="flex flex-col gap-2">
					{step.error && <div className="text-xs text-destructive font-mono whitespace-pre-wrap">{step.error}</div>}
					{isHeuristic && <div className="text-2xs text-muted-foreground italic">{m.admin_intel_debug_heuristic_note()}</div>}
					{step.prompt && <DebugBlock label={m.admin_intel_debug_block_prompt()} body={step.prompt} />}
					{step.responseRaw && <DebugBlock label={m.admin_intel_debug_block_raw_response()} body={step.responseRaw} />}
					{step.parsedJson && <DebugBlock label={m.admin_intel_debug_block_parsed()} body={prettyJson(step.parsedJson)} />}
				</CardContent>
			)}
		</Card>
	)
}

function RecCard({ rec }: { rec: RunDebugRec }) {
	return (
		<Card size="sm" data-intelligence="admin-run-debug-rec" data-analyzer={rec.analyzerId}>
			<CardHeader>
				<CardTitle className="flex flex-col gap-1.5">
					<span className="flex items-center gap-1.5 flex-wrap">
						<Badge variant="outline" className="text-3xs">
							{rec.analyzerLabel}
						</Badge>
						<Badge variant="outline" className="text-3xs">
							{rec.kind}
						</Badge>
						<RecStatusBadge status={rec.status} />
						<RecSeverityBadge severity={rec.severity} />
					</span>
					<span className="text-sm font-medium">{rec.title}</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-1.5">
				<div className="text-xs text-muted-foreground whitespace-pre-wrap">{rec.body}</div>
				{rec.payloadJson && <DebugBlock label={m.admin_intel_debug_block_payload()} body={prettyJson(rec.payloadJson)} />}
				<div className="text-3xs text-muted-foreground font-mono">{`fp: ${rec.fingerprint}`}</div>
			</CardContent>
		</Card>
	)
}

function DebugBlock({ label, body }: { label: string; body: string }) {
	return (
		<details className="text-xs">
			<summary className="cursor-pointer text-muted-foreground select-none">{label}</summary>
			<pre className="mt-1.5 max-h-72 overflow-auto rounded bg-muted/50 p-2 text-2xs whitespace-pre-wrap wrap-break-word">{body}</pre>
		</details>
	)
}

function MiniStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-md border border-border bg-muted/20 px-2 py-1.5">
			<div className="text-3xs uppercase tracking-wide text-muted-foreground">{label}</div>
			<div className="text-sm font-semibold tabular-nums">{value}</div>
		</div>
	)
}

function StatusBadge({ status }: { status: RunDebugRun['status'] }) {
	const label = runStatusLabel(status)
	if (status === 'success') return <Badge variant="secondary">{label}</Badge>
	if (status === 'error') return <Badge variant="destructive">{label}</Badge>
	if (status === 'skipped') return <Badge variant="outline">{label}</Badge>
	return <Badge>{label}</Badge>
}

function RecStatusBadge({ status }: { status: RunDebugRec['status'] }) {
	if (status === 'active')
		return (
			<Badge variant="secondary" className="text-3xs">
				{m.admin_intel_debug_rec_status_active()}
			</Badge>
		)
	if (status === 'dismissed')
		return (
			<Badge variant="outline" className="text-3xs">
				{m.admin_intel_debug_rec_status_dismissed()}
			</Badge>
		)
	return (
		<Badge variant="outline" className="text-3xs">
			{m.admin_intel_debug_rec_status_applied()}
		</Badge>
	)
}

function RecSeverityBadge({ severity }: { severity: RunDebugRec['severity'] }) {
	const variant = severity === 'important' ? 'destructive' : 'outline'
	return (
		<Badge variant={variant} className="text-3xs">
			{severityLabel(severity)}
		</Badge>
	)
}

function severityLabel(severity: RunDebugRec['severity']): string {
	switch (severity) {
		case 'info':
			return m.admin_intel_debug_severity_info()
		case 'suggest':
			return m.admin_intel_debug_severity_suggest()
		case 'important':
			return m.admin_intel_debug_severity_important()
	}
}

function StepBreakdownInline({ steps }: { steps: Array<RunDebugStep> }) {
	let ok = 0
	let err = 0
	let noop = 0
	for (const s of steps) {
		if (s.error != null && s.error !== '') err++
		else if (s.prompt != null) ok++
		else noop++
	}
	if (ok + err + noop === 0) return null
	return (
		<div className="flex items-center gap-2 text-2xs tabular-nums">
			{ok > 0 && <span className="text-emerald-600 dark:text-emerald-400">{m.admin_intel_step_ok({ count: ok })}</span>}
			{err > 0 && <span className="text-destructive">{m.admin_intel_step_err({ count: err })}</span>}
			{noop > 0 && <span className="text-muted-foreground">{m.admin_intel_step_noop({ count: noop })}</span>}
		</div>
	)
}

function toDate(d: Date | string): Date {
	return d instanceof Date ? d : new Date(d)
}

function prettyJson(raw: string): string {
	try {
		return JSON.stringify(JSON.parse(raw), null, 2)
	} catch {
		return raw
	}
}
