import { ArrowUpRight, Beaker, CalendarCheck2, CalendarClock, Cpu, Database, Mail, Send, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { adminSendOperatorDigestNow } from '@/api/admin-intelligence'
import { RichMessage } from '@/components/common/rich-message'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useIsEmailConfigured } from '@/hooks/use-is-email-configured'
import { m } from '@/paraglide/messages.js'

import type { AdminIntelligenceData } from './__fixtures__/types'
import { ANALYZER_META, ANALYZER_ORDER, AnalyzerBadges, NumberRow, TextInputOnBlur, ToggleRow } from './admin-intelligence-page'

type Patch = (p: Partial<AdminIntelligenceData['settings']>) => void

export function IntelligenceFeatureDisabledBanner() {
	return (
		<Alert>
			<AlertTitle>{m.admin_intel_disabled_title()}</AlertTitle>
			<AlertDescription className="flex flex-col gap-2">
				<span>{m.admin_intel_disabled_body()}</span>
				<Button asChild variant="outline" size="xs" className="self-start">
					<a data-intelligence="admin-intelligence-disabled-link" href="/admin/ai">
						{m.admin_intel_disabled_link()}
						<ArrowUpRight className="size-3.5" />
					</a>
				</Button>
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
					{m.admin_intel_settings_title()}
				</CardTitle>
				<CardDescription>{m.admin_intel_general_description()}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				<section className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<Beaker className="size-4 text-muted-foreground" />
						<h3 className="text-lg font-semibold">{m.admin_intel_inputs_title()}</h3>
					</div>
					<p className="text-xs text-muted-foreground">{m.admin_intel_inputs_help()}</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label={m.admin_intel_candidate_cap_label()}
							hint={m.admin_intel_candidate_cap_hint()}
							value={s.candidateCap}
							onChange={v => patch({ candidateCap: v })}
						/>
						<ToggleRow label={m.admin_intel_dry_run_label()} checked={s.dryRun} onChange={v => patch({ dryRun: v })} />
					</div>
				</section>

				<section className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<Database className="size-4 text-muted-foreground" />
						<h3 className="text-lg font-semibold">{m.admin_intel_retention_title()}</h3>
					</div>
					<p className="text-xs text-muted-foreground">{m.admin_intel_retention_help()}</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label={m.admin_intel_stale_rec_retention_label()}
							hint={m.admin_intel_stale_rec_retention_hint()}
							value={s.staleRecRetentionDays}
							onChange={v => patch({ staleRecRetentionDays: v })}
						/>
						<NumberRow
							label={m.admin_intel_run_step_retention_label()}
							hint={m.admin_intel_run_step_retention_hint()}
							value={s.runStepsRetentionDays}
							onChange={v => patch({ runStepsRetentionDays: v })}
						/>
					</div>
				</section>

				<section className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<CalendarCheck2 className="size-4 text-muted-foreground" />
						<h3 className="text-lg font-semibold">{m.admin_intel_hygiene_title()}</h3>
					</div>
					<p className="text-xs text-muted-foreground">{m.admin_intel_hygiene_help()}</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label={m.admin_intel_upcoming_window_label()}
							hint={m.admin_intel_upcoming_window_hint()}
							value={s.upcomingWindowDays}
							onChange={v => patch({ upcomingWindowDays: v })}
						/>
						<NumberRow
							label={m.admin_intel_min_days_label()}
							hint={m.admin_intel_min_days_hint()}
							value={s.minDaysBeforeEventForRecs}
							onChange={v => patch({ minDaysBeforeEventForRecs: v })}
						/>
					</div>
					<div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
						<div className="flex flex-col gap-0.5">
							<Label className="text-lg">{m.admin_intel_rename_ai_label()}</Label>
							<span className="text-xs text-muted-foreground">{m.admin_intel_rename_ai_help()}</span>
						</div>
						<Switch
							checked={s.listHygieneRenameWithAi}
							onCheckedChange={v => patch({ listHygieneRenameWithAi: v })}
							aria-label={m.admin_intel_rename_ai_aria()}
						/>
					</div>
					<p className="text-xs text-muted-foreground">{m.admin_intel_stale_help()}</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label={m.admin_intel_stale_past_event_label()}
							hint={m.admin_intel_stale_past_event_hint()}
							value={s.staleListPastEventDays}
							onChange={v => patch({ staleListPastEventDays: v })}
						/>
						<NumberRow
							label={m.admin_intel_stale_inactive_label()}
							hint={m.admin_intel_stale_inactive_hint()}
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
					{m.admin_intel_analyzers_title()}
				</CardTitle>
				<CardDescription>
					{m.admin_intel_analyzers_card_summary({
						enabled: ANALYZER_ORDER.filter(id => s.perAnalyzerEnabled[id]).length,
						total: ANALYZER_ORDER.length,
					})}
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
									<span className="text-lg font-medium">{meta.label()}</span>
									<AnalyzerBadges kind={meta.kind} triggers={meta.triggers} status={meta.status} />
								</div>
								<p className="text-sm text-muted-foreground">{meta.description()}</p>
								<div
									data-intelligence="admin-analyzer-example"
									className="rounded-md border border-border/60 bg-background/50 px-2.5 py-1.5"
								>
									<div className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
										{m.admin_intel_analyzer_example_heading()}
									</div>
									<p className="text-xs italic text-foreground/80">{meta.example()}</p>
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
					{m.admin_intel_scheduling_title()}
				</CardTitle>
				<CardDescription>{m.admin_intel_scheduling_description()}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				<section className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<CalendarClock className="size-4 text-muted-foreground" />
						<h3 className="text-lg font-semibold">{m.admin_intel_schedule_title()}</h3>
					</div>
					<p className="text-xs text-muted-foreground">{m.admin_intel_schedule_help()}</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label={m.admin_intel_refresh_interval_label()}
							hint={m.admin_intel_refresh_interval_hint()}
							value={s.refreshIntervalDays}
							onChange={v => patch({ refreshIntervalDays: v })}
						/>
						<NumberRow
							label={m.admin_intel_cooldown_label()}
							hint={m.admin_intel_cooldown_hint()}
							value={s.manualRefreshCooldownMinutes}
							onChange={v => patch({ manualRefreshCooldownMinutes: v })}
						/>
					</div>
				</section>

				<section className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<Cpu className="size-4 text-muted-foreground" />
						<h3 className="text-lg font-semibold">{m.admin_intel_workers_title()}</h3>
					</div>
					<p className="text-xs text-muted-foreground">{m.admin_intel_workers_help()}</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label={m.admin_intel_concurrency_label()}
							hint={m.admin_intel_concurrency_hint()}
							value={s.concurrency}
							onChange={v => patch({ concurrency: v })}
						/>
						<NumberRow
							label={m.admin_intel_users_per_invocation_label()}
							hint={m.admin_intel_users_per_invocation_hint()}
							value={s.usersPerInvocation}
							onChange={v => patch({ usersPerInvocation: v })}
						/>
					</div>
				</section>
			</CardContent>
		</Card>
	)
}

// Why "Send now" was refused, in the reader's language.
function digestSendRefusalText(reason: 'email-not-configured' | 'no-recipients'): string {
	switch (reason) {
		case 'email-not-configured':
			return m.admin_digest_send_email_not_configured()
		case 'no-recipients':
			return m.admin_digest_send_no_recipients()
	}
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
			if (!res.ok) {
				toast.error(digestSendRefusalText(res.reason))
				return
			}
			toast.success(m.admin_intel_digest_sent({ recipients: res.recipients.join(', ') }))
		} catch (err) {
			toast.error(err instanceof Error ? err.message : m.admin_intel_digest_send_failed())
		} finally {
			setSending(false)
		}
	}

	return (
		<Card data-intelligence="admin-settings-notifications">
			<CardHeader>
				<CardTitle className="text-2xl flex items-center gap-2">
					<Mail className="size-6 text-muted-foreground" />
					{m.admin_intel_notifications_title()}
				</CardTitle>
				<CardDescription>{m.admin_intel_notifications_description()}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				{notConfigured && (
					<Alert>
						<AlertTitle>{m.admin_intel_email_not_configured_title()}</AlertTitle>
						<AlertDescription className="flex flex-col gap-2">
							<span>{m.admin_intel_email_not_configured_body()}</span>
							<Button asChild variant="outline" size="xs" className="self-start">
								<a data-intelligence="admin-notifications-email-config-link" href="/admin/email">
									{m.admin_intel_email_not_configured_link()}
									<ArrowUpRight className="size-3.5" />
								</a>
							</Button>
						</AlertDescription>
					</Alert>
				)}
				<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
					<ToggleRow
						label={m.admin_intel_email_enabled_label()}
						checked={s.email.enabled}
						onChange={v => patch({ email: { ...s.email, enabled: v } })}
						disabled={notConfigured}
					/>
					<ToggleRow
						label={m.admin_intel_digest_label()}
						checked={s.email.weeklyDigestEnabled}
						onChange={v => patch({ email: { ...s.email, weeklyDigestEnabled: v } })}
						disabled={notConfigured || !s.email.enabled}
					/>
					<div className="md:col-span-2">
						<Label className="text-xs text-muted-foreground">{m.admin_intel_recipient_override_label()}</Label>
						<TextInputOnBlur
							className="mt-1"
							type="email"
							placeholder={m.admin_intel_recipient_override_placeholder()}
							value={override ?? ''}
							onCommit={v => patch({ email: { ...s.email, testRecipient: v || null } })}
							disabled={notConfigured}
						/>
						<p className="mt-1 text-xs text-muted-foreground">{m.admin_intel_recipient_override_help()}</p>
					</div>
					<div className="md:col-span-2 flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
						<div className="min-w-0 text-sm" data-intelligence="admin-notifications-recipients">
							{recipients.length > 0 ? (
								<span className="text-muted-foreground">
									<RichMessage
										parts={
											override
												? m.admin_intel_recipients_override.parts({ recipients: recipients.join(', ') })
												: m.admin_intel_recipients_admins.parts({ recipients: recipients.join(', ') })
										}
										tags={{ strong: c => <span className="font-medium break-words text-foreground">{c}</span> }}
									/>
								</span>
							) : (
								<span className="font-medium text-destructive">{m.admin_intel_no_recipients()}</span>
							)}
						</div>
						<Button
							variant="outline"
							className="gap-2 whitespace-nowrap self-start sm:self-auto"
							disabled={notConfigured || sending || recipients.length === 0}
							onClick={handleSendNow}
						>
							<Send className="size-4" />
							{sending ? m.admin_intel_sending() : m.admin_intel_send_now()}
						</Button>
					</div>
				</div>
				<p className="text-xs text-muted-foreground">{m.admin_intel_digest_schedule_help({ count: s.refreshIntervalDays })}</p>
			</CardContent>
		</Card>
	)
}
