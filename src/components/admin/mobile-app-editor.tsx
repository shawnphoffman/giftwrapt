// Admin form for the mobile-app redirect-URI whitelist. Used to live
// inside [oidc-client-editor.tsx] but it gates BOTH passkey and OIDC
// begin endpoints, not just OIDC, so it now has its own card. The
// default value `wishlists://oauth` matches the canonical iOS app's
// `CFBundleURLSchemes` entry; fresh deployments get passkey on out
// of the box.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { fetchMobileAppConfigAsAdmin, type MobileAppConfigResponse, updateMobileAppConfigAsAdmin } from '@/api/admin-mobile-app'
import { RichMessage } from '@/components/common/rich-message'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { m } from '@/paraglide/messages.js'

const QUERY_KEY = ['admin', 'mobile-app'] as const

type FormState = {
	// Newline-separated for the textarea; serialized to/from arrays.
	redirectUrisText: string
}

function configToForm(config: MobileAppConfigResponse): FormState {
	return {
		redirectUrisText: config.redirectUris.join('\n'),
	}
}

export function MobileAppEditor() {
	const queryClient = useQueryClient()
	const { data, isLoading } = useQuery({
		queryKey: QUERY_KEY,
		queryFn: () => fetchMobileAppConfigAsAdmin(),
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
				redirectUris: state.redirectUrisText
					.split(/\n+/u)
					.map(s => s.trim())
					.filter(Boolean),
			}
			const result = await updateMobileAppConfigAsAdmin({ data: payload })
			if (!result.ok) throw new Error(result.error)
			return result
		},
		onSuccess: () => {
			toast.success(m.admin_settings_mobile_saved())
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
			<div className="space-y-1.5">
				<Label htmlFor="mobile-redirect-uris" className="text-base">
					{m.admin_settings_mobile_redirect_uris_label()}
				</Label>
				<Textarea
					id="mobile-redirect-uris"
					// eslint-disable-next-line i18next/no-literal-string -- URL scheme
					placeholder="wishlists://oauth"
					value={form.redirectUrisText}
					onChange={e => set('redirectUrisText', e.target.value)}
					rows={3}
				/>
				<p className="text-xs text-muted-foreground">
					<RichMessage
						parts={m.admin_settings_mobile_redirect_uris_description.parts()}
						tags={{ code: children => <code className="font-mono">{children}</code> }}
					/>
				</p>
			</div>

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
