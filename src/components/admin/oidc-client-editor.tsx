// Admin form for the single OIDC sign-in provider (sign INTO
// GiftWrapt with an external IdP). The shape follows the Audiobookshelf
// OpenID Connect Authentication form: enable toggle, issuer + endpoint
// URLs, client id/secret, button text, and the user-matching toggles.
// The mobile redirect-URI whitelist used to live here; it now has its
// own top-level `mobileApp` settings row + admin card (see
// MobileAppEditor) because it gates passkey too, not just OIDC.
//
// Persisted in `app_settings.oidcClient` as a JSONB blob with the
// `clientSecret` field encrypted at rest. Changes only take effect on
// the next server restart - better-auth's `genericOAuth` plugin reads
// its provider list once at boot.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { fetchOidcClientConfigAsAdmin, type OidcClientConfigResponse, updateOidcClientConfigAsAdmin } from '@/api/admin-oidc-client'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { m } from '@/paraglide/messages.js'

const QUERY_KEY = ['admin', 'oidc-client'] as const

type FormState = Omit<OidcClientConfigResponse, 'scopes'> & {
	scopesText: string
	// Empty string = "leave the stored secret alone".
	clientSecretInput: string
}

function configToForm(config: OidcClientConfigResponse): FormState {
	return {
		enabled: config.enabled,
		issuerUrl: config.issuerUrl,
		authorizationUrl: config.authorizationUrl,
		tokenUrl: config.tokenUrl,
		userinfoUrl: config.userinfoUrl,
		jwksUrl: config.jwksUrl,
		logoutUrl: config.logoutUrl,
		clientId: config.clientId,
		hasClientSecret: config.hasClientSecret,
		clientSecretInput: '',
		scopesText: config.scopes.join(' '),
		buttonText: config.buttonText,
		matchExistingUsersBy: config.matchExistingUsersBy,
		autoRegister: config.autoRegister,
	}
}

export function OidcClientEditor() {
	const queryClient = useQueryClient()
	const { data, isLoading } = useQuery({
		queryKey: QUERY_KEY,
		queryFn: () => fetchOidcClientConfigAsAdmin(),
	})

	const [form, setForm] = useState<FormState | null>(null)
	const [dirty, setDirty] = useState(false)

	useEffect(() => {
		if (data && !form) {
			setForm(configToForm(data))
			setDirty(false)
		}
	}, [data, form])

	const update = useMutation({
		mutationFn: async (state: FormState) => {
			const payload = {
				enabled: state.enabled,
				issuerUrl: state.issuerUrl.trim(),
				authorizationUrl: state.authorizationUrl.trim(),
				tokenUrl: state.tokenUrl.trim(),
				userinfoUrl: state.userinfoUrl.trim(),
				jwksUrl: state.jwksUrl.trim(),
				logoutUrl: state.logoutUrl.trim(),
				clientId: state.clientId.trim(),
				clientSecret: state.clientSecretInput,
				scopes: state.scopesText
					.split(/\s+/u)
					.map(s => s.trim())
					.filter(Boolean),
				buttonText: state.buttonText.trim(),
				matchExistingUsersBy: state.matchExistingUsersBy,
				autoRegister: state.autoRegister,
			}
			const result = await updateOidcClientConfigAsAdmin({ data: payload })
			if (!result.ok) throw new Error(result.error)
			return result
		},
		onSuccess: () => {
			toast.success(m.admin_settings_oidc_saved())
			void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
			setDirty(false)
		},
		onError: (err: Error) => {
			toast.error(err.message)
		},
	})

	if (isLoading || !form) {
		return <p className="text-sm text-muted-foreground">{m.state_loading()}</p>
	}

	const set = <TKey extends keyof FormState>(key: TKey, value: FormState[TKey]) => {
		setForm({ ...form, [key]: value })
		setDirty(true)
	}

	return (
		<div className="space-y-6">
			<div className="flex items-start gap-3">
				<Checkbox id="oidc-enabled" className="mt-1" checked={form.enabled} onCheckedChange={v => set('enabled', v === true)} />
				<div className="space-y-1">
					<Label htmlFor="oidc-enabled" className="text-base flex items-center gap-2">
						{form.enabled ? <ShieldCheck className="size-4 text-green-600" /> : <ShieldAlert className="size-4 text-muted-foreground" />}
						{m.admin_settings_oidc_enabled_label()}{' '}
					</Label>
					<p className="text-sm text-muted-foreground">{m.admin_settings_oidc_enabled_description()}</p>
				</div>
			</div>

			<div className={form.enabled ? '' : 'opacity-50 pointer-events-none'}>
				<div className="space-y-4">
					<Field id="oidc-issuer" label={m.admin_settings_oidc_issuer_label()} hint={m.admin_settings_oidc_issuer_hint()}>
						<Input
							id="oidc-issuer"
							// eslint-disable-next-line i18next/no-literal-string -- sample URL
							placeholder="https://auth.example.com"
							value={form.issuerUrl}
							onChange={e => set('issuerUrl', e.target.value)}
						/>
					</Field>

					<details className="rounded border border-border/60 px-3 py-2">
						<summary className="cursor-pointer text-sm font-medium">{m.admin_settings_oidc_override_summary()}</summary>
						<div className="mt-3 space-y-3">
							<Field id="oidc-authorize" label={m.admin_settings_oidc_authorize_label()}>
								<Input id="oidc-authorize" value={form.authorizationUrl} onChange={e => set('authorizationUrl', e.target.value)} />
							</Field>
							<Field id="oidc-token" label={m.admin_settings_oidc_token_label()}>
								<Input id="oidc-token" value={form.tokenUrl} onChange={e => set('tokenUrl', e.target.value)} />
							</Field>
							<Field id="oidc-userinfo" label={m.admin_settings_oidc_userinfo_label()}>
								<Input id="oidc-userinfo" value={form.userinfoUrl} onChange={e => set('userinfoUrl', e.target.value)} />
							</Field>
							<Field id="oidc-jwks" label={m.admin_settings_oidc_jwks_label()}>
								<Input id="oidc-jwks" value={form.jwksUrl} onChange={e => set('jwksUrl', e.target.value)} />
							</Field>
							<Field id="oidc-logout" label={m.admin_settings_oidc_logout_label()} hint={m.admin_settings_oidc_logout_hint()}>
								<Input id="oidc-logout" value={form.logoutUrl} onChange={e => set('logoutUrl', e.target.value)} />
							</Field>
						</div>
					</details>

					<Field id="oidc-client-id" label={m.admin_settings_oidc_client_id_label()}>
						<Input id="oidc-client-id" value={form.clientId} onChange={e => set('clientId', e.target.value)} />
					</Field>

					<Field
						id="oidc-client-secret"
						label={m.admin_settings_oidc_client_secret_label()}
						hint={
							form.hasClientSecret ? m.admin_settings_oidc_client_secret_hint_stored() : m.admin_settings_oidc_client_secret_hint_missing()
						}
					>
						<Input
							id="oidc-client-secret"
							type="password"
							placeholder={form.hasClientSecret ? m.admin_settings_oidc_client_secret_placeholder_stored() : ''}
							value={form.clientSecretInput}
							onChange={e => set('clientSecretInput', e.target.value)}
							autoComplete="off"
						/>
					</Field>

					<Field id="oidc-scopes" label={m.admin_settings_oidc_scopes_label()} hint={m.admin_settings_oidc_scopes_hint()}>
						<Input
							id="oidc-scopes"
							// eslint-disable-next-line i18next/no-literal-string -- OIDC scope names
							placeholder="openid email profile"
							value={form.scopesText}
							onChange={e => set('scopesText', e.target.value)}
						/>
					</Field>

					<Field id="oidc-button-text" label={m.admin_settings_oidc_button_text_label()} hint={m.admin_settings_oidc_button_text_hint()}>
						<Input
							id="oidc-button-text"
							placeholder={m.admin_settings_oidc_button_text_placeholder()}
							value={form.buttonText}
							onChange={e => set('buttonText', e.target.value)}
						/>
					</Field>

					{/*
					Checkboxes (not Switches) for these two batched settings: in this
					codebase a `<Switch>` is by convention an auto-saving control,
					and these only persist when the form's Save button is pressed.
					*/}
					<div className="flex items-start gap-3">
						<Checkbox
							id="oidc-link-by-email"
							className="mt-1"
							checked={form.matchExistingUsersBy === 'email'}
							onCheckedChange={v => set('matchExistingUsersBy', v === true ? 'email' : 'none')}
						/>
						<div className="space-y-0.5">
							<Label htmlFor="oidc-link-by-email" className="text-base">
								{m.admin_settings_oidc_link_by_email_label()}
							</Label>
							<p className="text-sm text-muted-foreground">{m.admin_settings_oidc_link_by_email_description()}</p>
						</div>
					</div>

					<div className="flex items-start gap-3">
						<Checkbox
							id="oidc-auto-register"
							className="mt-1"
							checked={form.autoRegister}
							onCheckedChange={v => set('autoRegister', v === true)}
						/>
						<div className="space-y-0.5">
							<Label htmlFor="oidc-auto-register" className="text-base">
								{m.admin_settings_oidc_auto_register_label()}
							</Label>
							<p className="text-sm text-muted-foreground">{m.admin_settings_oidc_auto_register_description()}</p>
						</div>
					</div>
				</div>
			</div>

			{dirty && (
				<Alert variant="warning">
					<AlertTitle>{m.admin_settings_oidc_restart_title()}</AlertTitle>
					<AlertDescription>{m.admin_settings_oidc_restart_description()}</AlertDescription>
				</Alert>
			)}

			<div className="flex justify-end gap-2">
				<Button
					variant="outline"
					disabled={!dirty || update.isPending}
					onClick={() => {
						if (data) {
							setForm(configToForm(data))
							setDirty(false)
						}
					}}
				>
					{m.admin_settings_reset_button()}
				</Button>
				<Button disabled={!dirty || update.isPending} onClick={() => update.mutate(form)}>
					{update.isPending ? m.state_saving() : m.action_save()}
				</Button>
			</div>
		</div>
	)
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor={id} className="text-base">
				{label}
			</Label>
			{children}
			{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
		</div>
	)
}
