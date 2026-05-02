import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { PasskeysPanelContent, type PasskeySummary } from '@/components/settings/passkeys-panel'
import { authClient } from '@/lib/auth-client'

// Quick check for browser WebAuthn support. We bail out of the panel
// entirely if it's not present so users don't get confused by failing
// "register" calls in old Chromium / Firefox-on-iPad-via-RDP setups.
// Default to `true` so SSR matches the common case; downgrade after
// mount if the API isn't actually present.
function browserSupportsPasskeys(): boolean {
	return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function'
}

export default function PasskeysSection() {
	const [supported, setSupported] = useState(true)
	useEffect(() => {
		setSupported(browserSupportsPasskeys())
	}, [])
	const list = authClient.useListPasskeys()
	const [busyId, setBusyId] = useState<string | null>(null)
	const [registering, setRegistering] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const passkeys: Array<PasskeySummary> | null = list.data
		? list.data.map(p => ({
				id: p.id,
				name: p.name,
				deviceType: p.deviceType,
				createdAt: p.createdAt,
			}))
		: null

	const handleRegister = async (name: string) => {
		setError(null)
		setRegistering(true)
		try {
			const { error: addError } = await authClient.passkey.addPasskey({ name })
			if (addError) throw new Error(addError.message ?? 'Registration failed.')
			toast.success(`Passkey "${name}" added`)
			await list.refetch()
		} catch (err) {
			// User-cancel / WebAuthn-NotAllowedError surfaces here; a
			// generic copy is fine since the browser already showed its
			// own dialog.
			setError(err instanceof Error ? err.message : "Couldn't register that passkey.")
		} finally {
			setRegistering(false)
		}
	}

	const handleRename = async (id: string, name: string) => {
		setError(null)
		setBusyId(id)
		try {
			// `passkey.updatePasskey` is mapped from /passkey/update-passkey.
			const { error: updateError } = await authClient.passkey.updatePasskey({ id, name })
			if (updateError) throw new Error(updateError.message ?? 'Rename failed.')
			toast.success('Passkey renamed')
			await list.refetch()
		} catch (err) {
			setError(err instanceof Error ? err.message : "Couldn't rename that passkey.")
		} finally {
			setBusyId(null)
		}
	}

	const handleDelete = async (id: string) => {
		setError(null)
		setBusyId(id)
		try {
			const { error: deleteError } = await authClient.passkey.deletePasskey({ id })
			if (deleteError) throw new Error(deleteError.message ?? 'Delete failed.')
			toast.success('Passkey removed')
			await list.refetch()
		} catch (err) {
			setError(err instanceof Error ? err.message : "Couldn't remove that passkey.")
		} finally {
			setBusyId(null)
		}
	}

	return (
		<PasskeysPanelContent
			passkeys={passkeys}
			loading={list.isPending}
			supported={supported}
			error={error}
			busyId={busyId}
			registering={registering}
			onRegister={handleRegister}
			onRename={handleRename}
			onDelete={handleDelete}
		/>
	)
}
