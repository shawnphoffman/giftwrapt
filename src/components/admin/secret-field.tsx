import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { FieldSource } from '@/lib/email-config'
import { LIMITS } from '@/lib/validation/limits'

export type SecretFieldState = {
	mode: 'display' | 'edit'
	draft: string
}

type Props = {
	id: string
	label: string
	description?: string
	source: FieldSource
	preview?: string
	envLocked: boolean
	placeholder?: string
	saving?: boolean
	maxLength?: number
	onSave: (value: string) => Promise<void> | void
	onClear?: () => Promise<void> | void
	// Receives the current state so it can react to draft/mode (e.g. a Test
	// button that validates the draft before save).
	trailingSlot?: (state: SecretFieldState) => React.ReactNode
}

export function SecretField({
	id,
	label,
	description,
	source,
	preview,
	envLocked,
	placeholder,
	saving,
	maxLength = LIMITS.SECRET,
	onSave,
	onClear,
	trailingSlot,
}: Props) {
	const [mode, setMode] = useState<'display' | 'edit'>(source === 'missing' ? 'edit' : 'display')
	const [draft, setDraft] = useState('')

	const envHint = envLocked ? 'Set by environment variable. Unset the env var to edit here.' : null

	const handleSave = async () => {
		if (!draft) return
		await onSave(draft)
		setDraft('')
		setMode('display')
	}

	const handleCancel = () => {
		setDraft('')
		if (source !== 'missing') setMode('display')
	}

	const handleReplace = () => {
		setDraft('')
		setMode('edit')
	}

	const state: SecretFieldState = { mode, draft }

	return (
		<div className="flex flex-col gap-2">
			<div className="space-y-0.5">
				<Label htmlFor={id} className="text-base">
					{label}
				</Label>
				{description && <p className="text-sm text-muted-foreground">{description}</p>}
			</div>

			{envLocked ? (
				<div className="flex flex-col gap-1.5">
					<div className="flex items-center gap-2">
						<Input id={id} value={preview ?? ''} disabled readOnly className="font-mono" />
						{trailingSlot?.(state)}
					</div>
					{envHint && <p className="text-xs text-muted-foreground">{envHint}</p>}
				</div>
			) : mode === 'display' && source === 'db' ? (
				<div className="flex items-center gap-2">
					<Input id={id} value={preview ?? ''} disabled readOnly className="font-mono" />
					<Button type="button" variant="secondary" onClick={handleReplace} disabled={saving}>
						Replace
					</Button>
					{onClear && (
						<Button type="button" variant="outline" onClick={() => onClear()} disabled={saving}>
							Clear
						</Button>
					)}
					{trailingSlot?.(state)}
				</div>
			) : (
				<div className="flex items-center gap-2">
					<Input
						id={id}
						type="password"
						autoComplete="off"
						value={draft}
						placeholder={placeholder}
						maxLength={maxLength}
						onChange={e => setDraft(e.target.value)}
						disabled={saving}
					/>
					<Button type="button" onClick={handleSave} disabled={saving || !draft}>
						{saving ? 'Saving…' : 'Save'}
					</Button>
					{source !== 'missing' && (
						<Button type="button" variant="outline" onClick={handleCancel} disabled={saving}>
							Cancel
						</Button>
					)}
					{trailingSlot?.(state)}
				</div>
			)}
		</div>
	)
}
