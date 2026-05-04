import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { updateAppSettings } from '@/api/settings'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { adminAppSettingsQueryKey, notifyAppSettingsChanged, useAdminAppSettings } from '@/hooks/use-app-settings'
import type { AppSettings } from '@/lib/settings'

// Minimal admin form for the bulk-import + scrape-queue settings. Lives
// next to the existing scraping admin page; deliberately spartan because
// these are foundation knobs (not polish surfaces). The four flags it
// edits:
//
//   - importEnabled: master switch for the whole flow.
//   - scrapeQueueUsersPerInvocation: cron-tick batch size.
//   - scrapeQueueConcurrency: max parallel jobs per user per tick.
//   - scrapeQueueMaxAttempts: backoff ceiling before a job goes to
//     `failed`.
//
// Wired up like the other admin editors: optimistic update, rollback on
// error, single-key mutations.

type EditableKey = 'importEnabled' | 'scrapeQueueUsersPerInvocation' | 'scrapeQueueConcurrency' | 'scrapeQueueMaxAttempts'

function useImportSettingsMutation() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: async (changes: Partial<AppSettings>) => {
			return updateAppSettings({ data: changes } as Parameters<typeof updateAppSettings>[0])
		},
		onMutate: async changes => {
			await queryClient.cancelQueries({ queryKey: adminAppSettingsQueryKey })
			const previous = queryClient.getQueryData<AppSettings>(adminAppSettingsQueryKey)
			if (previous) {
				queryClient.setQueryData<AppSettings>(adminAppSettingsQueryKey, { ...previous, ...changes })
			}
			return { previous, changedKeys: Object.keys(changes) as Array<keyof AppSettings> }
		},
		onError: (err, _changes, ctx) => {
			if (ctx?.previous) queryClient.setQueryData(adminAppSettingsQueryKey, ctx.previous)
			toast.error(err instanceof Error ? err.message : 'Failed to update setting')
		},
		onSuccess: (data, _vars, ctx) => {
			queryClient.setQueryData<AppSettings>(adminAppSettingsQueryKey, old => {
				if (!old) return old
				const next = { ...old }
				for (const key of ctx.changedKeys) {
					;(next as Record<string, unknown>)[key] = data[key]
				}
				return next
			})
			notifyAppSettingsChanged(queryClient)
			toast.success('Setting updated')
		},
	})
}

export function ImportSettingsForm() {
	const { data: settings, isLoading } = useAdminAppSettings()
	const mutation = useImportSettingsMutation()

	if (isLoading) {
		return <div className="text-sm text-muted-foreground">Loading import settings...</div>
	}
	if (!settings) {
		return <div className="text-sm text-muted-foreground">No settings found.</div>
	}

	const change = <TKey extends EditableKey>(key: TKey, value: AppSettings[TKey]) =>
		mutation.mutate({ [key]: value } as Partial<AppSettings>)
	const disabled = mutation.isPending

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="importEnabled" className="text-base">
						Enable bulk import
					</Label>
					<p className="text-sm text-muted-foreground">
						Master switch for the bulk-import flow on the list-edit page. While off, the parse + bulk-create server functions reject and the
						scrape-queue cron tick exits without claiming jobs.
					</p>
				</div>
				<Switch
					id="importEnabled"
					checked={settings.importEnabled}
					disabled={disabled}
					onCheckedChange={checked => change('importEnabled', checked)}
				/>
			</div>

			<NumberField
				id="scrapeQueueUsersPerInvocation"
				label="Users per cron invocation"
				hint="How many distinct users a single scrape-queue cron tick processes before bailing for the next tick."
				value={settings.scrapeQueueUsersPerInvocation}
				min={1}
				max={500}
				disabled={disabled}
				onCommit={value => change('scrapeQueueUsersPerInvocation', value)}
			/>
			<NumberField
				id="scrapeQueueConcurrency"
				label="Per-user concurrency"
				hint="Max parallel jobs PER USER inside one cron tick. Doubles as the LIMIT on the per-user pull."
				value={settings.scrapeQueueConcurrency}
				min={1}
				max={20}
				disabled={disabled}
				onCommit={value => change('scrapeQueueConcurrency', value)}
			/>
			<NumberField
				id="scrapeQueueMaxAttempts"
				label="Max attempts per job"
				hint="Number of attempts before a job flips to failed. Failed jobs are retained for diagnostics."
				value={settings.scrapeQueueMaxAttempts}
				min={1}
				max={10}
				disabled={disabled}
				onCommit={value => change('scrapeQueueMaxAttempts', value)}
			/>
		</div>
	)
}

type NumberFieldProps = {
	id: string
	label: string
	hint: string
	value: number
	min?: number
	max?: number
	disabled?: boolean
	onCommit: (value: number) => void
}

function NumberField({ id, label, hint, value, min, max, disabled, onCommit }: NumberFieldProps) {
	const [draft, setDraft] = useState(String(value))

	useEffect(() => {
		setDraft(String(value))
	}, [value])

	const handleCommit = () => {
		const parsed = parseInt(draft, 10)
		if (!Number.isFinite(parsed)) {
			setDraft(String(value))
			return
		}
		const lo = min ?? 1
		const hi = max ?? Number.POSITIVE_INFINITY
		if (parsed < lo || parsed > hi) {
			setDraft(String(value))
			return
		}
		if (parsed === value) return
		onCommit(parsed)
	}

	return (
		<div className="flex items-center justify-between gap-4">
			<div className="space-y-0.5">
				<Label htmlFor={id} className="text-base">
					{label}
				</Label>
				<p className="text-sm text-muted-foreground">{hint}</p>
			</div>
			<Input
				id={id}
				type="number"
				min={min}
				max={max}
				value={draft}
				disabled={disabled}
				onChange={e => setDraft(e.target.value)}
				onBlur={handleCommit}
				onKeyDown={e => {
					if (e.key === 'Enter') {
						e.currentTarget.blur()
					}
				}}
				className="w-24 text-right"
			/>
		</div>
	)
}
