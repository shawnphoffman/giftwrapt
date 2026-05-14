import { ArrowUpRight, Beaker, CalendarCheck2, CalendarClock, Cpu, Database, Mail, Sparkles } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

import type { AdminIntelligenceData } from './__fixtures__/types'
import { ANALYZER_META, ANALYZER_ORDER, AnalyzerBadges, NumberRow, TextInputOnBlur, ToggleRow } from './admin-intelligence-page'

type Patch = (p: Partial<AdminIntelligenceData['settings']>) => void

export function IntelligenceFeatureDisabledBanner() {
	return (
		<Alert>
			<AlertTitle>Intelligence is disabled</AlertTitle>
			<AlertDescription className="flex flex-col gap-2">
				<span>All recommendation generation is paused. Users do not see the Intelligence page; manual refresh is blocked.</span>
				<a
					data-intelligence="admin-intelligence-disabled-link"
					className="inline-flex items-center gap-1 self-start rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium hover:bg-muted/60"
					href="/admin/ai"
				>
					Enable on AI settings
					<ArrowUpRight className="size-3.5" />
				</a>
			</AlertDescription>
		</Alert>
	)
}

export function IntelligenceGeneralSettingsCard({ data, patch }: { data: AdminIntelligenceData; patch: Patch }) {
	const s = data.settings
	return (
		<Card data-intelligence="admin-settings-general">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Beaker className="size-6 text-muted-foreground" />
					Settings
				</CardTitle>
				<CardDescription>General behavior, inputs, and retention. All settings are global.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				<section className="flex flex-col gap-3">
					<div className="flex items-center gap-2">
						<Beaker className="size-4 text-muted-foreground" />
						<h3 className="text-sm font-semibold">Inputs &amp; dry run</h3>
					</div>
					<p className="text-xs text-muted-foreground">
						The candidate cap bounds how many items each analyzer feeds into the model. Smaller caps mean cheaper / faster runs but
						potentially missed recommendations. Dry run leaves the model calls + step rows in place but skips writing recommendations to the
						database.
					</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label="Candidate cap per analyzer"
							hint="Hard limit on items / pairs sent to the model in a single run."
							value={s.candidateCap}
							onChange={v => patch({ candidateCap: v })}
						/>
						<ToggleRow label="Dry run (don't persist recommendations)" checked={s.dryRun} onChange={v => patch({ dryRun: v })} />
					</div>
				</section>

				<section className="flex flex-col gap-3">
					<div className="flex items-center gap-2">
						<Database className="size-4 text-muted-foreground" />
						<h3 className="text-sm font-semibold">Retention</h3>
					</div>
					<p className="text-xs text-muted-foreground">
						Old, dismissed/applied recommendations and old run-step debug rows are pruned on this schedule.
					</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label="Stale recommendation retention (days)"
							hint="Dismissed and applied recommendations older than this are deleted."
							value={s.staleRecRetentionDays}
							onChange={v => patch({ staleRecRetentionDays: v })}
						/>
						<NumberRow
							label="Run-step retention (days)"
							hint="Per-step debug rows (prompt / response / parsed) older than this are deleted."
							value={s.runStepsRetentionDays}
							onChange={v => patch({ runStepsRetentionDays: v })}
						/>
					</div>
				</section>

				<section className="flex flex-col gap-3">
					<div className="flex items-center gap-2">
						<CalendarCheck2 className="size-4 text-muted-foreground" />
						<h3 className="text-sm font-semibold">List hygiene</h3>
					</div>
					<p className="text-xs text-muted-foreground">
						The list-hygiene analyzer surfaces calendar-aware nudges (convert / make public / create / set primary) for upcoming birthdays,
						Christmas, and admin-curated holidays. These knobs bound when the analyzer fires per event.
					</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label="Upcoming-event window (days)"
							hint="Event must be within this many days of today to drive a rec. 45 = start nudging six weeks before."
							value={s.upcomingWindowDays}
							onChange={v => patch({ upcomingWindowDays: v })}
						/>
						<NumberRow
							label="Minimum days before event (days)"
							hint="Stop firing convert/create/privacy recs once the event is this close. 1 = analyzer goes quiet on the day-of."
							value={s.minDaysBeforeEventForRecs}
							onChange={v => patch({ minDaysBeforeEventForRecs: v })}
						/>
					</div>
				</section>
			</CardContent>
		</Card>
	)
}

export function IntelligenceAnalyzersCard({ data, patch }: { data: AdminIntelligenceData; patch: Patch }) {
	const s = data.settings
	return (
		<Card data-intelligence="admin-settings-analyzers">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Sparkles className="size-6 text-muted-foreground" />
					Analyzers
				</CardTitle>
				<CardDescription>
					{ANALYZER_ORDER.filter(id => s.perAnalyzerEnabled[id]).length} of {ANALYZER_ORDER.length} enabled. Each analyzer runs in sequence
					per user; errors in one don&apos;t block the others.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				{ANALYZER_ORDER.map(id => {
					const meta = ANALYZER_META[id]
					const enabled = s.perAnalyzerEnabled[id]
					return (
						<div
							key={id}
							data-intelligence="admin-analyzer-row"
							data-analyzer={id}
							data-enabled={enabled ? 'true' : 'false'}
							className="rounded-md border border-border bg-muted/10 p-3 flex items-start justify-between gap-3"
						>
							<div className="flex flex-col gap-2 min-w-0">
								<div className="flex items-center gap-2 flex-wrap">
									<span className="text-sm font-medium">{meta.label}</span>
									<AnalyzerBadges kind={meta.kind} triggers={meta.triggers} status={meta.status} />
								</div>
								<p className="text-xs text-muted-foreground">{meta.description}</p>
								<div
									data-intelligence="admin-analyzer-example"
									className="rounded-md border border-border/60 bg-background/50 px-2.5 py-1.5"
								>
									<div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
										Example recommendation
									</div>
									<p className="text-xs italic text-foreground/80">{meta.example}</p>
								</div>
							</div>
							<Switch
								data-intelligence="admin-analyzer-toggle"
								data-analyzer={id}
								checked={enabled}
								onCheckedChange={v => patch({ perAnalyzerEnabled: { ...s.perAnalyzerEnabled, [id]: v } })}
							/>
						</div>
					)
				})}
			</CardContent>
		</Card>
	)
}

export function IntelligenceSchedulingCard({ data, patch }: { data: AdminIntelligenceData; patch: Patch }) {
	const s = data.settings
	return (
		<Card data-intelligence="admin-settings-scheduling">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<CalendarClock className="size-6 text-muted-foreground" />
					Scheduling
				</CardTitle>
				<CardDescription>How often recommendations regenerate, and how the cron processes batches of users.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				<section className="flex flex-col gap-3">
					<div className="flex items-center gap-2">
						<CalendarClock className="size-4 text-muted-foreground" />
						<h3 className="text-sm font-semibold">Schedule &amp; triggers</h3>
					</div>
					<p className="text-xs text-muted-foreground">
						Recommendations regenerate on a per-user cron and on manual &quot;Run for me now&quot; clicks. Each user is eligible no more
						often than the cron interval; manual runs are gated by the cooldown to prevent stacking.
					</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label="Cron refresh interval (days)"
							hint="How often the cron will regenerate recommendations for each user."
							value={s.refreshIntervalDays}
							onChange={v => patch({ refreshIntervalDays: v })}
						/>
						<NumberRow
							label="Manual refresh cooldown (min)"
							hint="Minimum gap between manual runs for the same user."
							value={s.manualRefreshCooldownMinutes}
							onChange={v => patch({ manualRefreshCooldownMinutes: v })}
						/>
					</div>
				</section>

				<section className="flex flex-col gap-3">
					<div className="flex items-center gap-2">
						<Cpu className="size-4 text-muted-foreground" />
						<h3 className="text-sm font-semibold">Cron workers</h3>
					</div>
					<p className="text-xs text-muted-foreground">
						Advanced. Controls how many users the cron processes per invocation and how many run in parallel. Raise these only after
						confirming provider quota; rate-limit errors will show up as step errors on individual runs.
					</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label="Cron concurrency"
							hint="Number of users processed in parallel inside one invocation."
							value={s.concurrency}
							onChange={v => patch({ concurrency: v })}
						/>
						<NumberRow
							label="Users per cron invocation"
							hint="Maximum users the cron will pick up before yielding."
							value={s.usersPerInvocation}
							onChange={v => patch({ usersPerInvocation: v })}
						/>
					</div>
				</section>
			</CardContent>
		</Card>
	)
}

export function IntelligenceNotificationsCard({ data, patch }: { data: AdminIntelligenceData; patch: Patch }) {
	const s = data.settings
	return (
		<Card data-intelligence="admin-settings-notifications">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Mail className="size-6 text-muted-foreground" />
					Notifications
				</CardTitle>
				<CardDescription>Email digest scaffolding. Delivery is not yet wired up.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<Alert>
					<AlertTitle>Delivery not yet implemented</AlertTitle>
					<AlertDescription>
						Toggles below are wired into settings but no email is sent. A future PR will hook up transport.
					</AlertDescription>
				</Alert>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
					<ToggleRow label="Email enabled" checked={s.email.enabled} onChange={v => patch({ email: { ...s.email, enabled: v } })} />
					<ToggleRow
						label="Weekly digest"
						checked={s.email.weeklyDigestEnabled}
						onChange={v => patch({ email: { ...s.email, weeklyDigestEnabled: v } })}
					/>
					<div className="md:col-span-2">
						<Label className="text-xs text-muted-foreground">Test recipient (admin only)</Label>
						<TextInputOnBlur
							className="mt-1"
							type="email"
							placeholder="optional"
							value={s.email.testRecipient ?? ''}
							onCommit={v => patch({ email: { ...s.email, testRecipient: v || null } })}
						/>
					</div>
				</div>
			</CardContent>
		</Card>
	)
}
