import { CheckIcon, ChevronsUpDownIcon, PlusIcon, RefreshCwIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { RichMessage } from '@/components/common/rich-message'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ProviderModel } from '@/lib/ai-types'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

export type ModelPickerStatus =
	| { kind: 'idle' } // no API key yet, nothing to list
	| { kind: 'loading' }
	| { kind: 'live'; count: number; fetchedAt: number }
	| { kind: 'error'; error: string }

export type ModelPickerProps = {
	id?: string
	/** The model id currently chosen in the form. */
	value: string
	onChange: (model: string) => void
	/** Live catalogue from the provider, newest first. Empty until it loads. */
	models: ReadonlyArray<ProviderModel>
	/** Hardcoded fallback list, shown when the provider can't be reached. */
	fallbackModels: ReadonlyArray<string>
	providerName: string
	status: ModelPickerStatus
	onRefresh: () => void
	disabled?: boolean
	/**
	 * False for endpoints we can't introspect (the Custom provider), which
	 * drops the refresh button and status line and leaves a plain
	 * type-anything picker behind.
	 */
	catalogue?: boolean
	/** Shown on the trigger while no model is chosen. */
	placeholder?: string
}

type Option = ProviderModel & { origin: 'live' | 'fallback' | 'saved' }

// Merge order matters: the live catalogue wins, the curated list backfills,
// and the saved value is always appended if neither list mentions it. That
// last rule is what keeps a configured model selectable after a provider
// retires it from its public catalogue.
export function mergeModelOptions(args: {
	models: ReadonlyArray<ProviderModel>
	fallbackModels: ReadonlyArray<string>
	value: string
}): Array<Option> {
	const seen = new Set<string>()
	const out: Array<Option> = []

	for (const model of args.models) {
		if (seen.has(model.id)) continue
		seen.add(model.id)
		out.push({ ...model, origin: 'live' })
	}
	for (const id of args.fallbackModels) {
		if (seen.has(id)) continue
		seen.add(id)
		out.push({ id, origin: 'fallback' })
	}
	if (args.value.length > 0 && !seen.has(args.value)) {
		out.push({ id: args.value, origin: 'saved' })
	}
	return out
}

function relativeTime(ts: number): string {
	const secs = Math.max(0, Math.round((Date.now() - ts) / 1000))
	if (secs < 60) return m.relative_just_now()
	const mins = Math.round(secs / 60)
	if (mins < 60) return m.admin_ai_model_picker_minutes_ago({ count: mins })
	return m.admin_ai_model_picker_hours_ago({ count: Math.round(mins / 60) })
}

export function ModelPicker({
	id,
	value,
	onChange,
	models,
	fallbackModels,
	providerName,
	status,
	onRefresh,
	disabled,
	catalogue = true,
	placeholder = m.admin_ai_model_picker_placeholder(),
}: ModelPickerProps) {
	const [open, setOpen] = useState(false)
	const [search, setSearch] = useState('')

	const options = useMemo(() => mergeModelOptions({ models, fallbackModels, value }), [models, fallbackModels, value])

	const trimmed = search.trim()
	const exactMatch = options.some(o => o.id === trimmed)
	const canUseTyped = trimmed.length > 0 && !exactMatch

	const live = options.filter(o => o.origin === 'live')
	const rest = options.filter(o => o.origin !== 'live')

	const select = (model: string) => {
		onChange(model)
		setSearch('')
		setOpen(false)
	}

	const renderItem = (o: Option) => (
		<CommandItem key={o.id} value={`${o.id} ${o.label ?? ''}`} onSelect={() => select(o.id)} className="gap-2">
			<CheckIcon className={cn('size-4 shrink-0', o.id === value ? 'opacity-100' : 'opacity-0')} />
			<span className="font-mono text-xs">{o.id}</span>
			{o.label && <span className="truncate text-xs text-muted-foreground">{o.label}</span>}
		</CommandItem>
	)

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<Button
							id={id}
							type="button"
							variant="outline"
							role="combobox"
							aria-expanded={open}
							disabled={disabled}
							className="flex-1 justify-between font-normal"
						>
							<span className={cn('truncate font-mono text-xs', !value && 'font-sans text-muted-foreground')}>{value || placeholder}</span>
							<ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
						<Command shouldFilter>
							<CommandInput placeholder={m.admin_ai_model_picker_search()} value={search} onValueChange={setSearch} />
							<CommandList>
								{!canUseTyped && <CommandEmpty>{m.admin_ai_model_picker_no_match()}</CommandEmpty>}
								{canUseTyped && (
									<CommandGroup forceMount>
										<CommandItem forceMount value={trimmed} onSelect={() => select(trimmed)} className="gap-2">
											<PlusIcon className="size-4 shrink-0" />
											<span>
												<RichMessage
													parts={m.admin_ai_model_picker_use_typed.parts({ model: trimmed })}
													tags={{ mono: c => <span className="font-mono text-xs">{c}</span> }}
												/>
											</span>
										</CommandItem>
									</CommandGroup>
								)}
								{live.length > 0 && (
									<CommandGroup heading={m.admin_ai_model_picker_group_live({ provider: providerName })}>
										{live.map(renderItem)}
									</CommandGroup>
								)}
								{rest.length > 0 && (
									<CommandGroup heading={live.length > 0 ? m.admin_ai_model_picker_group_other() : m.admin_ai_model_picker_group_known()}>
										{rest.map(renderItem)}
									</CommandGroup>
								)}
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>
				{catalogue && (
					<Button
						type="button"
						variant="outline"
						size="icon"
						onClick={onRefresh}
						disabled={disabled || status.kind === 'loading'}
						aria-label={m.admin_ai_model_picker_refresh({ provider: providerName })}
						title={m.admin_ai_model_picker_refresh({ provider: providerName })}
					>
						<RefreshCwIcon className={cn('size-4', status.kind === 'loading' && 'animate-spin')} />
					</Button>
				)}
			</div>
			{catalogue && (
				<ModelPickerStatusLine status={status} providerName={providerName} hasFallback={options.some(o => o.origin === 'fallback')} />
			)}
		</div>
	)
}

function ModelPickerStatusLine({
	status,
	providerName,
	hasFallback,
}: {
	status: ModelPickerStatus
	providerName: string
	hasFallback: boolean
}) {
	switch (status.kind) {
		case 'idle':
			return <p className="text-xs text-muted-foreground">{m.admin_ai_model_picker_status_idle({ provider: providerName })}</p>
		case 'loading':
			return <p className="text-xs text-muted-foreground">{m.admin_ai_model_picker_status_loading({ provider: providerName })}</p>
		case 'live':
			return (
				<p className="text-xs text-muted-foreground">
					{m.admin_ai_model_picker_status_live({ count: status.count, provider: providerName, when: relativeTime(status.fetchedAt) })}
				</p>
			)
		case 'error':
			return (
				<p className="text-xs text-muted-foreground">
					{hasFallback
						? m.admin_ai_model_picker_status_error_fallback({ provider: providerName, error: status.error })
						: m.admin_ai_model_picker_status_error_typed({ provider: providerName, error: status.error })}
				</p>
			)
	}
}
