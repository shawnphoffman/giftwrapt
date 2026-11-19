import { CheckIcon, KeyRound, XIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { testResendApiKeyAsAdmin } from '@/api/admin-email'
import { SecretField, type SecretFieldState } from '@/components/admin/secret-field'
import SendTestEmailButton from '@/components/admin/send-test-email'
import { Button } from '@/components/ui/button'
import { CharacterCounter } from '@/components/ui/character-counter'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { type EmailConfigResponse, useEmailConfig, useEmailConfigMutation } from '@/hooks/use-email-config'
import { LIMITS } from '@/lib/validation/limits'
import { m } from '@/paraglide/messages.js'

export function EmailSettingsEditor() {
	const { data, isLoading } = useEmailConfig()
	const mutation = useEmailConfigMutation()

	if (isLoading || !data) {
		return <div className="text-sm text-muted-foreground">{m.admin_settings_email_loading()}</div>
	}

	const save = async (patch: Parameters<typeof mutation.mutateAsync>[0]) => {
		const res = await mutation.mutateAsync(patch)
		if ('ok' in res && res.ok === false) {
			toast.error(res.error)
			throw new Error(res.error)
		}
		toast.success(m.admin_settings_email_updated())
	}

	const apiKeyResolved = data.apiKey.source !== 'missing'

	return (
		<div className="flex flex-col gap-8">
			<ApiKeySection
				config={data}
				onSave={value => save({ apiKey: value })}
				onClear={() => save({ apiKey: null })}
				saving={mutation.isPending}
			/>

			{apiKeyResolved && (
				<>
					<Separator />
					<AddressesSection config={data} onSave={save} saving={mutation.isPending} />
				</>
			)}

			<Separator />
			<SendTestSection defaultRecipient={data.bccAddress.value ?? data.fromEmail.value ?? ''} />
		</div>
	)
}

type ApiKeySectionProps = {
	config: EmailConfigResponse
	onSave: (value: string) => Promise<void>
	onClear: () => Promise<void>
	saving: boolean
}

function ApiKeySection({ config, onSave, onClear, saving }: ApiKeySectionProps) {
	return (
		<section className="flex flex-col gap-2">
			<SecretField
				id="resendApiKey"
				label={m.admin_settings_email_api_key_label()}
				description={m.admin_settings_email_api_key_description()}
				source={config.apiKey.source}
				preview={config.apiKey.preview}
				envLocked={config.envLocked.apiKey}
				// eslint-disable-next-line i18next/no-literal-string -- key format sample
				placeholder="re_…"
				saving={saving}
				onSave={onSave}
				onClear={config.apiKey.source === 'db' ? onClear : undefined}
				trailingSlot={state => <TestKeyButton state={state} hasResolvedKey={config.apiKey.source !== 'missing'} />}
			/>
		</section>
	)
}

type TestKeyButtonProps = {
	state: SecretFieldState
	hasResolvedKey: boolean
}

function TestKeyButton({ state, hasResolvedKey }: TestKeyButtonProps) {
	const [testing, setTesting] = useState(false)
	const [result, setResult] = useState<{ ok: boolean } | undefined>()

	const draftReady = state.mode === 'edit' && state.draft.length > 0
	const canTest = draftReady || (state.mode === 'display' && hasResolvedKey)

	const Icon = !result || testing ? <KeyRound /> : result.ok ? <CheckIcon /> : <XIcon />

	const handleClick = useCallback(async () => {
		setTesting(true)
		setResult(undefined)
		try {
			const body: { apiKey?: string } = draftReady ? { apiKey: state.draft } : {}
			const res = await testResendApiKeyAsAdmin({ data: body } as Parameters<typeof testResendApiKeyAsAdmin>[0])
			if (res.ok) {
				setResult({ ok: true })
				toast.success(m.admin_settings_email_api_key_valid())
			} else {
				setResult({ ok: false })
				toast.error(res.error)
			}
		} catch (err) {
			setResult({ ok: false })
			toast.error(err instanceof Error ? err.message : m.admin_settings_email_api_key_test_failed())
		} finally {
			setTesting(false)
			setTimeout(() => setResult(undefined), 3000)
		}
	}, [draftReady, state.draft])

	return (
		<Button type="button" variant="outline" className="gap-2" onClick={handleClick} disabled={!canTest || testing}>
			{Icon}
			{testing ? m.admin_settings_email_api_key_testing() : m.admin_settings_email_api_key_test_button()}
		</Button>
	)
}

type AddressesSectionProps = {
	config: EmailConfigResponse
	onSave: (patch: { fromEmail?: string | null; fromName?: string | null; bccAddress?: string | null }) => Promise<void>
	saving: boolean
}

function AddressesSection({ config, onSave, saving }: AddressesSectionProps) {
	return (
		<section className="flex flex-col gap-6">
			<div className="space-y-0.5">
				<h3 className="text-lg font-medium">{m.admin_settings_email_addresses_title()}</h3>
				<p className="text-sm text-muted-foreground">{m.admin_settings_email_addresses_description()}</p>
			</div>

			<StringFieldRow
				id="resendFromEmail"
				label={m.admin_settings_email_from_email_label()}
				description={m.admin_settings_email_from_email_description()}
				type="email"
				// eslint-disable-next-line i18next/no-literal-string -- sample address
				placeholder="notifications@yourdomain.com"
				maxLength={LIMITS.EMAIL}
				field={config.fromEmail}
				envLocked={config.envLocked.fromEmail}
				saving={saving}
				onSave={value => onSave({ fromEmail: value })}
				onClear={() => onSave({ fromEmail: null })}
			/>

			<StringFieldRow
				id="resendFromName"
				label={m.admin_settings_email_from_name_label()}
				description={m.admin_settings_email_from_name_description()}
				type="text"
				// eslint-disable-next-line i18next/no-literal-string -- product name
				placeholder="GiftWrapt"
				maxLength={LIMITS.SHORT_NAME}
				showCounter
				field={config.fromName}
				envLocked={config.envLocked.fromName}
				saving={saving}
				onSave={value => onSave({ fromName: value })}
				onClear={() => onSave({ fromName: null })}
			/>

			<StringFieldRow
				id="resendBccAddress"
				label={m.admin_settings_email_bcc_label()}
				description={m.admin_settings_email_bcc_description()}
				type="email"
				// eslint-disable-next-line i18next/no-literal-string -- sample address
				placeholder="archive@yourdomain.com"
				maxLength={LIMITS.EMAIL}
				field={config.bccAddress}
				envLocked={config.envLocked.bccAddress}
				saving={saving}
				onSave={value => onSave({ bccAddress: value })}
				onClear={() => onSave({ bccAddress: null })}
			/>
		</section>
	)
}

type StringFieldRowProps = {
	id: string
	label: string
	description: string
	type: 'email' | 'text'
	placeholder: string
	maxLength: number
	showCounter?: boolean
	field: { source: 'env' | 'db' | 'missing'; value?: string }
	envLocked: boolean
	saving: boolean
	onSave: (value: string) => Promise<void>
	onClear: () => Promise<void>
}

function StringFieldRow({
	id,
	label,
	description,
	type,
	placeholder,
	maxLength,
	showCounter,
	field,
	envLocked,
	saving,
	onSave,
	onClear,
}: StringFieldRowProps) {
	const [draft, setDraft] = useState(field.value ?? '')

	useEffect(() => {
		setDraft(field.value ?? '')
	}, [field.value])

	const envHint = envLocked ? m.admin_settings_env_locked_hint() : null
	const dirty = draft !== (field.value ?? '')

	const handleCommit = async () => {
		if (!dirty) return
		const trimmed = draft.trim()
		if (trimmed.length === 0) {
			// Empty submission reverts to current value (use Clear to delete).
			setDraft(field.value ?? '')
			return
		}
		try {
			await onSave(trimmed)
		} catch {
			setDraft(field.value ?? '')
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-baseline justify-between gap-2">
				<div className="space-y-0.5">
					<Label htmlFor={id} className="text-base">
						{label}
					</Label>
					<p className="text-sm text-muted-foreground">{description}</p>
				</div>
				<div className="flex items-center gap-3 shrink-0">
					{showCounter && <CharacterCounter value={draft} max={maxLength} />}
					{!envLocked && field.source === 'db' && !dirty && (
						<Button type="button" variant="outline" size="sm" onClick={() => onClear()} disabled={saving}>
							{m.action_clear()}
						</Button>
					)}
				</div>
			</div>
			<Input
				id={id}
				type={type}
				value={draft}
				placeholder={placeholder}
				disabled={envLocked || saving}
				maxLength={maxLength}
				onChange={e => setDraft(e.target.value)}
				onBlur={handleCommit}
				onKeyDown={e => {
					if (e.key === 'Enter') e.currentTarget.blur()
				}}
			/>
			{envHint && <p className="text-xs text-muted-foreground">{envHint}</p>}
		</div>
	)
}

function SendTestSection({ defaultRecipient }: { defaultRecipient: string }) {
	return (
		<section className="flex flex-col gap-6">
			<div className="space-y-0.5">
				<h3 className="text-lg font-medium">{m.admin_settings_email_test_title()}</h3>
				<p className="text-sm text-muted-foreground">{m.admin_settings_email_test_description()}</p>
			</div>
			<SendTestEmailButton defaultRecipient={defaultRecipient} />
		</section>
	)
}
