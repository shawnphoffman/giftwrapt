import { Cpu, KeyRound, Pencil, ShieldCheck, Smartphone, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDate as formatLocaleDate } from '@/lib/i18n/format'
import { m } from '@/paraglide/messages.js'

// A row as surfaced from `authClient.useListPasskeys()`. We narrow to
// just the fields the UI uses so the panel doesn't depend on the full
// better-auth Passkey type (which carries publicKey, counter, etc.).
export type PasskeySummary = {
	id: string
	name?: string | null
	deviceType?: string | null
	createdAt?: Date | string | null
}

export type PasskeysPanelContentProps = {
	passkeys: Array<PasskeySummary> | null
	loading?: boolean
	supported?: boolean
	error?: string | null
	busyId?: string | null
	registering?: boolean
	onRegister: (name: string) => Promise<void> | void
	onRename: (id: string, name: string) => Promise<void> | void
	onDelete: (id: string) => Promise<void> | void
}

export function PasskeysPanelContent({
	passkeys,
	loading = false,
	supported = true,
	error,
	busyId,
	registering = false,
	onRegister,
	onRename,
	onDelete,
}: PasskeysPanelContentProps) {
	const [newName, setNewName] = useState('')

	const handleRegister = async (e: React.FormEvent) => {
		e.preventDefault()
		const trimmed = newName.trim()
		if (!trimmed) return
		await onRegister(trimmed)
		setNewName('')
	}

	if (!supported) {
		return (
			<Alert>
				<AlertTitle>{m.settings_passkeys_unsupported_title()}</AlertTitle>
				<AlertDescription>{m.settings_passkeys_unsupported_description()}</AlertDescription>
			</Alert>
		)
	}

	return (
		<div className="space-y-4">
			<form onSubmit={handleRegister} className="flex flex-col gap-2 sm:flex-row sm:items-end rounded-md border p-3">
				<div className="flex-1 grid gap-1">
					<Label htmlFor="new-passkey-name">{m.settings_passkeys_add_label()}</Label>
					<Input
						id="new-passkey-name"
						autoComplete="off"
						data-1p-ignore
						data-lpignore="true"
						value={newName}
						onChange={e => setNewName(e.target.value)}
						placeholder={m.settings_passkeys_name_placeholder()}
						maxLength={80}
						disabled={registering}
					/>
				</div>
				<Button type="submit" disabled={registering || !newName.trim()}>
					<KeyRound className="size-4" />
					{registering ? m.settings_passkeys_registering() : m.settings_passkeys_register_button()}
				</Button>
			</form>

			{error && (
				<Alert variant="destructive">
					<AlertTitle>{m.settings_passkeys_error_title()}</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{loading && <p className="text-xs text-muted-foreground">{m.settings_passkeys_loading()}</p>}

			{!loading && passkeys && passkeys.length === 0 && <p className="text-sm text-muted-foreground">{m.settings_passkeys_empty()}</p>}

			{passkeys && passkeys.length > 0 && (
				<ul className="divide-y rounded-md border">
					{passkeys.map(p => (
						<li key={p.id}>
							<PasskeyRow passkey={p} busy={busyId === p.id} onRename={onRename} onDelete={onDelete} />
						</li>
					))}
				</ul>
			)}
		</div>
	)
}

function PasskeyRow({
	passkey,
	busy,
	onRename,
	onDelete,
}: {
	passkey: PasskeySummary
	busy: boolean
	onRename: (id: string, name: string) => Promise<void> | void
	onDelete: (id: string) => Promise<void> | void
}) {
	const [editing, setEditing] = useState(false)
	const [draft, setDraft] = useState(passkey.name ?? '')
	const [confirmOpen, setConfirmOpen] = useState(false)

	const submitRename = async (e: React.FormEvent) => {
		e.preventDefault()
		const trimmed = draft.trim()
		if (!trimmed) return
		await onRename(passkey.id, trimmed)
		setEditing(false)
	}

	const Icon = passkey.deviceType === 'singleDevice' ? Cpu : Smartphone

	return (
		<div className="flex items-center gap-3 p-3">
			<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
				<Icon className="size-4" />
			</div>
			<div className="flex-1 min-w-0">
				{editing ? (
					<form onSubmit={submitRename} className="flex gap-1">
						<Input value={draft} onChange={e => setDraft(e.target.value)} disabled={busy} maxLength={80} autoFocus />
						<Button type="submit" size="sm" disabled={busy || !draft.trim()}>
							{m.action_save()}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => {
								setEditing(false)
								setDraft(passkey.name ?? '')
							}}
							disabled={busy}
						>
							{m.action_cancel()}
						</Button>
					</form>
				) : (
					<>
						<p className="text-sm font-medium truncate flex items-center gap-1.5">
							<ShieldCheck className="size-3.5 text-green-600 dark:text-green-500" />
							{passkey.name?.trim() || m.settings_passkeys_unnamed()}
						</p>
						<p className="text-xs text-muted-foreground">
							{passkey.createdAt
								? m.settings_passkeys_device_added({ device: describeDevice(passkey.deviceType), date: formatDate(passkey.createdAt) })
								: describeDevice(passkey.deviceType)}
						</p>
					</>
				)}
			</div>
			{!editing && (
				<div className="flex gap-0.5">
					<Button
						variant="outline"
						size="icon-sm"
						onClick={() => setEditing(true)}
						disabled={busy}
						aria-label={m.settings_passkeys_rename_label()}
					>
						<Pencil className="size-4" />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						onClick={() => setConfirmOpen(true)}
						disabled={busy}
						aria-label={m.settings_passkeys_remove_label()}
						className="text-destructive hover:text-destructive"
					>
						<Trash2 className="size-4" />
					</Button>
				</div>
			)}

			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{m.settings_passkeys_remove_confirm_title()}</AlertDialogTitle>
						<AlertDialogDescription>{m.settings_passkeys_remove_confirm_description()}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={busy}>{m.action_cancel()}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={busy}
							onClick={async e => {
								e.preventDefault()
								await onDelete(passkey.id)
								setConfirmOpen(false)
							}}
						>
							{m.action_remove()}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

// Map better-auth's WebAuthn deviceType ('singleDevice' /
// 'multiDevice') into something a human can read.
export function describeDevice(deviceType: string | null | undefined): string {
	if (deviceType === 'multiDevice') return m.settings_passkeys_device_synced()
	if (deviceType === 'singleDevice') return m.settings_passkeys_device_bound()
	return m.settings_passkeys_device_generic()
}

export function formatDate(value: Date | string): string {
	const d = typeof value === 'string' ? new Date(value) : value
	if (Number.isNaN(d.getTime())) return ''
	return formatLocaleDate(d, { month: 'short', day: 'numeric', year: 'numeric' })
}
