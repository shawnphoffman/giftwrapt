import { ArrowUpRight, Beaker, CalendarCheck2, CalendarClock, Cpu, Database, Mail, Send, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { adminSendOperatorDigestNow } from '@/api/admin-intelligence'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useIsEmailConfigured } from '@/hooks/use-is-email-configured'

import type { AdminIntelligenceData } from './__fixtures__/types'
import { ANALYZER_META, ANALYZER_ORDER, AnalyzerBadges, NumberRow, TextInputOnBlur, ToggleRow } from './admin-intelligence-page'

type Patch = (p: Partial<AdminIntelligenceData['settings']>) => void

export function IntelligenceFeatureDisabledBanner() {
	return (
		<Alert>
			<AlertTitle>Intelligence is disabled</AlertTitle>
			<AlertDescription className="flex flex-col gap-2">
				<span>All recommendation generation is paused. Users can&apos;t see the Intelligence page, and manual refreshes are blocked.</span>
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
				<CardTitle className="text-2xl flex items-center gap-2">
					<Beaker className="size-6 text-muted-foreground" />
					Settings
				</CardTitle>
				<CardDescription>General behavior, inputs, and retention. All settings are global.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				<section className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<Beaker className="size-4 text-muted-foreground" />
						<h3 className="text-lg font-semibold">Inputs &amp; Dry Run</h3>
					</div>
					<p className="text-xs text-muted-foreground">
						The candidate cap limits how many items each analyzer sends to the model. A smaller cap makes runs cheaper and faster, but some
						recommendations may be missed. Dry run still calls the model and records each step, but doesn&apos;t save any recommendations.
					</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label="Candidate cap per analyzer"
							hint="The most items (or item pairs) sent to the model in a single run."
							value={s.candidateCap}
							onChange={v => patch({ candidateCap: v })}
						/>
						<ToggleRow label="Dry Run" checked={s.dryRun} onChange={v => patch({ dryRun: v })} />
					</div>
				</section>

				<section className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<Database className="size-4 text-muted-foreground" />
						<h3 className="text-lg font-semibold">Retention</h3>
					</div>
					<p className="text-xs text-muted-foreground">
						Dismissed and applied recommendations, and the debug records for each run, are deleted once they&apos;re older than these
						limits.
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
							hint="Debug records for each run step (prompt, response, and parsed output) older than this are deleted."
							value={s.runStepsRetentionDays}
							onChange={v => patch({ runStepsRetentionDays: v })}
						/>
					</div>
				</section>

				<section className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<CalendarCheck2 className="size-4 text-muted-foreground" />
						<h3 className="text-lg font-semibold">List Hygiene</h3>
					</div>
					<p className="text-xs text-muted-foreground">
						The list hygiene analyzer suggests list changes ahead of upcoming birthdays, Christmas, and the holidays you&apos;ve set up,
						such as converting a list, making it public, creating one, or setting a primary list. These settings control when those
						suggestions start and stop for each event.
					</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label="Upcoming-event window (days)"
							hint="Suggestions start once an event is this many days away. For example, 45 starts about six weeks ahead."
							value={s.upcomingWindowDays}
							onChange={v => patch({ upcomingWindowDays: v })}
						/>
						<NumberRow
							label="Minimum days before event (days)"
							hint="Suggestions to convert, create, or change privacy stop once the event is this close. With 1, they stop on the day of the event."
							value={s.minDaysBeforeEventForRecs}
							onChange={v => patch({ minDaysBeforeEventForRecs: v })}
						/>
					</div>
					<div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
						<div className="flex flex-col gap-0.5">
							<Label className="text-lg">AI-assisted rename on Convert</Label>
							<span className="text-xs text-muted-foreground">
								When this is on, the Convert action asks the AI provider (the same one the other analyzers use) to suggest the new list
								name. The model only sees the current name, the new list type, the event title, and the year. It never sees items or claims.
								If the AI is unavailable or its answer can&apos;t be used, the name comes from the built-in rules instead. Limited to 5
								calls per run.
							</span>
						</div>
						<Switch
							checked={s.listHygieneRenameWithAi}
							onCheckedChange={v => patch({ listHygieneRenameWithAi: v })}
							aria-label="AI-assisted rename"
						/>
					</div>
					<p className="text-xs text-muted-foreground">
						Old public lists can also be flagged for archiving (which can be undone) or for conversion to a plain wishlist. This check never
						looks at claims or at what a recipient has archived, so it can&apos;t spoil a surprise. Higher values leave lists alone for
						longer, which is the safer choice for avoiding spoilers.
					</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label="Days past event before flagged stale"
							hint="Christmas, birthday, and holiday lists are only flagged once their event is at least this many days in the past. For example, 90 waits about three months after Christmas before suggesting an archive."
							value={s.staleListPastEventDays}
							onChange={v => patch({ staleListPastEventDays: v })}
						/>
						<NumberRow
							label="Months of inactivity before flagged stale"
							hint="A list is flagged only when neither the list nor any of its items has been edited in this long. Applies to every eligible list type, including wishlists. 12 months matches the yearly auto-archive cycle."
							value={s.staleListInactiveMonths}
							onChange={v => patch({ staleListInactiveMonths: v })}
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
				<CardTitle className="text-2xl flex items-center gap-2">
					<Sparkles className="size-6 text-muted-foreground" />
					Analyzers
				</CardTitle>
				<CardDescription>
					{ANALYZER_ORDER.filter(id => s.perAnalyzerEnabled[id]).length} of {ANALYZER_ORDER.length} enabled. For each user, the analyzers
					run one after another, and an error in one doesn&apos;t stop the rest.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
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
									<span className="text-lg font-medium">{meta.label}</span>
									<AnalyzerBadges kind={meta.kind} triggers={meta.triggers} status={meta.status} />
								</div>
								<p className="text-sm text-muted-foreground">{meta.description}</p>
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
				<CardTitle className="text-2xl flex items-center gap-2">
					<CalendarClock className="size-6 text-muted-foreground" />
					Scheduling
				</CardTitle>
				<CardDescription>How often recommendations regenerate, and how the cron processes batches of users.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				<section className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<CalendarClock className="size-4 text-muted-foreground" />
						<h3 className="text-lg font-semibold">Schedule &amp; Triggers</h3>
					</div>
					<p className="text-xs text-muted-foreground">
						Recommendations are regenerated for each user on a schedule, and whenever someone clicks &quot;Run for me now&quot;. The
						schedule runs at most once per refresh interval for each user, and manual runs wait out the cooldown so they don&apos;t pile up.
					</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label="Cron Refresh Interval (days)"
							hint="How often the cron will regenerate recommendations for each user."
							value={s.refreshIntervalDays}
							onChange={v => patch({ refreshIntervalDays: v })}
						/>
						<NumberRow
							label="Manual Refresh Cooldown (minutes)"
							hint="Minimum gap between manual runs for the same user."
							value={s.manualRefreshCooldownMinutes}
							onChange={v => patch({ manualRefreshCooldownMinutes: v })}
						/>
					</div>
				</section>

				<section className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<Cpu className="size-4 text-muted-foreground" />
						<h3 className="text-lg font-semibold">Cron Workers</h3>
					</div>
					<p className="text-xs text-muted-foreground">
						Advanced. These control how many users each cron run processes, and how many it handles at once. Only raise them if your AI
						provider&apos;s quota can handle it. Rate-limit errors show up as step errors on individual runs.
					</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label="Cron Concurrency"
							hint="Number of users processed in parallel inside one invocation."
							value={s.concurrency}
							onChange={v => patch({ concurrency: v })}
						/>
						<NumberRow
							label="Users per Cron Invocation"
							hint="The most users a single cron run will process before it stops."
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
	const { data: emailConfigured } = useIsEmailConfigured()
	// Treat only an explicit `false` as not-configured so controls aren't
	// disabled during the initial query load.
	const notConfigured = emailConfigured === false
	const [sending, setSending] = useState(false)

	const override = s.email.testRecipient ?? null
	const adminEmails = s.email.adminEmails ?? []
	const recipients = override ? [override] : adminEmails

	const handleSendNow = async () => {
		setSending(true)
		try {
			const res = await adminSendOperatorDigestNow()
			toast.success(`Digest sent to ${res.recipients.join(', ')}`)
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to send digest')
		} finally {
			setSending(false)
		}
	}

	return (
		<Card data-intelligence="admin-settings-notifications">
			<CardHeader>
				<CardTitle className="text-2xl flex items-center gap-2">
					<Mail className="size-6 text-muted-foreground" />
					Notifications
				</CardTitle>
				<CardDescription>Email the deployment&rsquo;s admins a periodic digest of system-wide intelligence activity.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				{notConfigured && (
					<Alert>
						<AlertTitle>Email isn&rsquo;t configured</AlertTitle>
						<AlertDescription className="flex flex-col gap-2">
							<span>Sending the digest needs a Resend API key and a From address. Set up email first, and these controls will unlock.</span>
							<a
								data-intelligence="admin-notifications-email-config-link"
								className="inline-flex items-center gap-1 self-start rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium hover:bg-muted/60"
								href="/admin/email"
							>
								Configure email
								<ArrowUpRight className="size-3.5" />
							</a>
						</AlertDescription>
					</Alert>
				)}
				<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
					<ToggleRow
						label="Email Enabled"
						checked={s.email.enabled}
						onChange={v => patch({ email: { ...s.email, enabled: v } })}
						disabled={notConfigured}
					/>
					<ToggleRow
						label="Digest"
						checked={s.email.weeklyDigestEnabled}
						onChange={v => patch({ email: { ...s.email, weeklyDigestEnabled: v } })}
						disabled={notConfigured || !s.email.enabled}
					/>
					<div className="md:col-span-2">
						<Label className="text-xs text-muted-foreground">Recipient override</Label>
						<TextInputOnBlur
							className="mt-1"
							type="email"
							placeholder="Leave blank to send to all admins"
							value={override ?? ''}
							onCommit={v => patch({ email: { ...s.email, testRecipient: v || null } })}
							disabled={notConfigured}
						/>
						<p className="mt-1 text-xs text-muted-foreground">
							When set, every digest (scheduled or sent now) goes only to this address instead of the admins.
						</p>
					</div>
					<div className="md:col-span-2 flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
						<div className="min-w-0 text-sm" data-intelligence="admin-notifications-recipients">
							{recipients.length > 0 ? (
								<>
									<span className="text-muted-foreground">{override ? 'Digests go only to ' : 'Digests go to all admins: '}</span>
									<span className="font-medium break-words">{recipients.join(', ')}</span>
								</>
							) : (
								<span className="font-medium text-destructive">No admin users, so nothing will send. Set a recipient override.</span>
							)}
						</div>
						<Button
							variant="outline"
							className="gap-2 whitespace-nowrap self-start sm:self-auto"
							disabled={notConfigured || sending || recipients.length === 0}
							onClick={handleSendNow}
						>
							<Send className="size-4" />
							{sending ? 'Sending…' : 'Send now'}
						</Button>
					</div>
				</div>
				<p className="text-xs text-muted-foreground">
					The digest goes out with the intelligence cron, once every refresh interval ({s.refreshIntervalDays} day
					{s.refreshIntervalDays === 1 ? '' : 's'}). Send now delivers the current digest right away, even when the toggles are off, and
					doesn&apos;t change the schedule.
				</p>
			</CardContent>
		</Card>
	)
}
