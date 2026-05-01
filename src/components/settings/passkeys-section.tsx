import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { PasskeysPanelContent, type PasskeySummary } from '@/components/settings/passkeys-panel'
import { authClient } from '@/lib/auth-client'

// Quick check for browser WebAuthn support. We bail out of the panel
// entirely if it's not present so users don't get confused by failing
// "register" calls in old Chromium / Firefox-on-iPad-via-RDP setups.
function browserSupportsPasskeys(): boolean {
	if (typeof window === 'undefined') return false
	return typeof window.PublicKeyCredential === 'function'
}

export default function PasskeysSection() {
	const [supported] = useState(() => browserSupportsPasskeys())
	const list = authClient.useListPasskeys()
	const [busyId, setBusyId] = useState<string | null>(null)
	const [registering, setRegistering] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [refreshTick, setRefreshTick] = useState(0)

	useEffect(() => {
		// Re-fetch when our local mutations (rename/delete) fire so the
		// rendered list catches up. The plugin's atom doesn't auto-
		// refresh on mutations to /passkey/* endpoints.
		void list.refetch()
	}, [list, refreshTick])

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
			setRefreshTick(n => n + 1)
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
			setRefreshTick(n => n + 1)
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
			setRefreshTick(n => n + 1)
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
