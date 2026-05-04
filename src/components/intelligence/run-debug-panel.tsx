import { format, formatDistanceToNow } from 'date-fns'
import { AlertTriangle, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

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
				<Loader2 className="size-4 animate-spin" /> Loading run details…
			</div>
		)
	}
	if (state.kind === 'error') {
		return (
			<div data-intelligence="admin-run-debug-error" className="flex items-start gap-2 p-6 text-sm text-destructive">
				<AlertTriangle className="size-4 mt-0.5" />
				<div>
					<div className="font-medium">Failed to load run</div>
					<div className="text-xs text-muted-foreground">{state.message}</div>
				</div>
			</div>
		)
	}

	const { run, steps, recs } = state.data
	const startedAt = toDate(run.startedAt)

	return (
		<div data-intelligence="admin-run-debug" className="flex flex-col gap-4 p-4 overflow-y-auto">
			<section className="flex flex-col gap-1.5">
				<div className="flex items-center gap-2 flex-wrap">
					<StatusBadge status={run.status} />
					<Badge variant="outline">{run.trigger}</Badge>
					<span className="text-xs text-muted-foreground">{run.userName}</span>
				</div>
				<div className="text-xs text-muted-foreground">
					{format(startedAt, 'PPpp')} · {formatDistanceToNow(startedAt, { addSuffix: true })}
					{run.durationMs != null && ` · ${run.durationMs}ms`}
				</div>
				<div className="grid grid-cols-3 gap-2 mt-2">
					<MiniStat label="Tokens in" value={run.tokensIn.toString()} />
					<MiniStat label="Tokens out" value={run.tokensOut.toString()} />
					<MiniStat label="Est. cost" value={`$${run.estimatedCostUsd.toFixed(4)}`} />
				</div>
				{run.skipReason && (
					<div className="text-xs text-muted-foreground mt-1">
						Skip reason: <span className="font-mono">{run.skipReason}</span>
					</div>
				)}
				{run.error && <div className="text-xs text-destructive font-mono mt-1 whitespace-pre-wrap">{run.error}</div>}
				{run.inputHash && (
					<div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
						<span>Input hash:</span>
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
						Analyzer steps <span className="text-muted-foreground font-normal">({steps.length})</span>
					</h3>
					<StepBreakdownInline steps={steps} />
				</div>
				{steps.length === 0 ? (
					<p data-intelligence="admin-run-debug-no-steps" className="text-xs text-muted-foreground">
						No steps recorded for this run. The run may have been skipped before any analyzer executed (see skip reason above).
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
					Resulting recommendations <span className="text-muted-foreground font-normal">({recs.length})</span>
				</h3>
				{recs.length === 0 ? (
					<p data-intelligence="admin-run-debug-no-recs" className="text-xs text-muted-foreground">
						No recommendations were persisted for this run. Check the steps above to see what each analyzer returned — analyzers can run
						successfully and still produce no recs (e.g. nothing stale, no duplicates found).
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
						{step.error ? <Badge variant="destructive">error</Badge> : <Badge variant="secondary">ok</Badge>}
					</span>
					<span className="text-[11px] font-normal text-muted-foreground tabular-nums">
						{step.latencyMs}ms
						{(step.tokensIn > 0 || step.tokensOut > 0) && ` · ${step.tokensIn} in / ${step.tokensOut} out`}
					</span>
				</CardTitle>
			</CardHeader>
			{(hasBody || isHeuristic) && (
				<CardContent className="flex flex-col gap-2">
					{step.error && <div className="text-xs text-destructive font-mono whitespace-pre-wrap">{step.error}</div>}
					{isHeuristic && (
						<div className="text-[11px] text-muted-foreground italic">
							Heuristic-only step, no model call. Latency above is the analyzer&apos;s own logic.
						</div>
					)}
					{step.prompt && <DebugBlock label="Prompt" body={step.prompt} />}
					{step.responseRaw && <DebugBlock label="Raw response" body={step.responseRaw} />}
					{step.parsedJson && <DebugBlock label="Parsed" body={prettyJson(step.parsedJson)} />}
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
						<Badge variant="outline" className="text-[10px]">
							{rec.analyzerLabel}
						</Badge>
						<Badge variant="outline" className="text-[10px]">
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
				{rec.payloadJson && <DebugBlock label="Payload" body={prettyJson(rec.payloadJson)} />}
				<div className="text-[10px] text-muted-foreground font-mono">fp: {rec.fingerprint}</div>
			</CardContent>
		</Card>
	)
}

function DebugBlock({ label, body }: { label: string; body: string }) {
	return (
		<details className="text-xs">
			<summary className="cursor-pointer text-muted-foreground select-none">{label}</summary>
			<pre className="mt-1.5 max-h-72 overflow-auto rounded bg-muted/50 p-2 text-[11px] whitespace-pre-wrap break-words">{body}</pre>
		</details>
	)
}

function MiniStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-md border border-border bg-muted/20 px-2 py-1.5">
			<div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
			<div className="text-sm font-semibold tabular-nums">{value}</div>
		</div>
	)
}

function StatusBadge({ status }: { status: RunDebugRun['status'] }) {
	if (status === 'success') return <Badge variant="secondary">success</Badge>
	if (status === 'error') return <Badge variant="destructive">error</Badge>
	if (status === 'skipped') return <Badge variant="outline">skipped</Badge>
	return <Badge>running</Badge>
}

function RecStatusBadge({ status }: { status: RunDebugRec['status'] }) {
	if (status === 'active')
		return (
			<Badge variant="secondary" className="text-[10px]">
				active
			</Badge>
		)
	if (status === 'dismissed')
		return (
			<Badge variant="outline" className="text-[10px]">
				dismissed
			</Badge>
		)
	return (
		<Badge variant="outline" className="text-[10px]">
			applied
		</Badge>
	)
}

function RecSeverityBadge({ severity }: { severity: RunDebugRec['severity'] }) {
	const variant = severity === 'important' ? 'destructive' : 'outline'
	return (
		<Badge variant={variant} className="text-[10px]">
			{severity}
		</Badge>
	)
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
		<div className="flex items-center gap-2 text-[11px] tabular-nums">
			{ok > 0 && <span className="text-emerald-600 dark:text-emerald-400">{ok} ok</span>}
			{err > 0 && <span className="text-destructive">{err} err</span>}
			{noop > 0 && <span className="text-muted-foreground">{noop} noop</span>}
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
