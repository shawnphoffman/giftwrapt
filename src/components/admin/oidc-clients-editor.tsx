import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import {
	createOidcApplicationAsAdmin,
	deleteOidcApplicationAsAdmin,
	listOidcApplicationsAsAdmin,
	type OidcApplicationRow,
	type OidcAppType,
	oidcAppTypeValues,
	rotateOidcSecretAsAdmin,
	updateOidcApplicationAsAdmin,
} from '@/api/admin-oidc'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

const QUERY_KEY = ['admin', 'oidc-applications'] as const

const TYPE_LABELS: Record<OidcAppType, string> = {
	web: 'Web (server-side)',
	native: 'Native (mobile/desktop)',
	public: 'SPA (browser-only)',
	'user-agent-based': 'User-agent based',
}

export function OidcClientsEditor() {
	const queryClient = useQueryClient()
	const { data, isLoading } = useQuery({
		queryKey: QUERY_KEY,
		queryFn: () => listOidcApplicationsAsAdmin(),
	})

	const [createOpen, setCreateOpen] = useState(false)
	const [secretReveal, setSecretReveal] = useState<{ name: string; clientId: string; clientSecret: string | null } | null>(null)

	const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

	const createMutation = useMutation({
		mutationFn: (input: { name: string; type: OidcAppType; redirectUrls: Array<string>; icon?: string }) =>
			createOidcApplicationAsAdmin({ data: input }),
		onSuccess: row => {
			toast.success('OIDC client created')
			void refresh()
			setSecretReveal({ name: row.name, clientId: row.clientId, clientSecret: row.clientSecret })
		},
		onError: err => toast.error(err instanceof Error ? err.message : 'Could not create client'),
	})

	const updateMutation = useMutation({
		mutationFn: (input: { id: string; disabled?: boolean }) => updateOidcApplicationAsAdmin({ data: input }),
		onSuccess: () => void refresh(),
	})

	const deleteMutation = useMutation({
		mutationFn: (id: string) => deleteOidcApplicationAsAdmin({ data: { id } }),
		onSuccess: () => {
			toast.success('OIDC client deleted')
			void refresh()
		},
	})

	const rotateMutation = useMutation({
		mutationFn: (id: string) => rotateOidcSecretAsAdmin({ data: { id } }),
		onSuccess: (resp, id) => {
			const row = data?.find(r => r.id === id)
			toast.success('Secret rotated')
			if (row) setSecretReveal({ name: row.name, clientId: row.clientId, clientSecret: resp.clientSecret })
			void refresh()
		},
	})

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-end">
				<Button size="sm" onClick={() => setCreateOpen(true)}>
					<Plus className="size-4" />
					Add OIDC client
				</Button>
			</div>

			{isLoading ? (
				<p className="text-sm text-muted-foreground">Loading…</p>
			) : !data || data.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					No OIDC clients yet. Click "Add OIDC client" to register a third-party app that wants to "Sign in with GiftWrapt".
				</p>
			) : (
				<ClientsTable
					rows={data}
					onToggleDisabled={(row, disabled) => updateMutation.mutate({ id: row.id, disabled })}
					onDelete={row => deleteMutation.mutate(row.id)}
					onRotate={row => rotateMutation.mutate(row.id)}
					onShowSecret={row => setSecretReveal({ name: row.name, clientId: row.clientId, clientSecret: row.clientSecret })}
					busyId={
						updateMutation.isPending
							? updateMutation.variables.id
							: deleteMutation.isPending
								? deleteMutation.variables
								: rotateMutation.isPending
									? rotateMutation.variables
									: null
					}
				/>
			)}

			<CreateClientDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				submitting={createMutation.isPending}
				onSubmit={async input => {
					await createMutation.mutateAsync(input)
					setCreateOpen(false)
				}}
			/>

			<SecretRevealDialog reveal={secretReveal} onClose={() => setSecretReveal(null)} />
		</div>
	)
}

function ClientsTable({
	rows,
	onToggleDisabled,
	onDelete,
	onRotate,
	onShowSecret,
	busyId,
}: {
	rows: Array<OidcApplicationRow>
	onToggleDisabled: (row: OidcApplicationRow, disabled: boolean) => void
	onDelete: (row: OidcApplicationRow) => void
	onRotate: (row: OidcApplicationRow) => void
	onShowSecret: (row: OidcApplicationRow) => void
	busyId: string | null
}) {
	const [deleteRow, setDeleteRow] = useState<OidcApplicationRow | null>(null)

	return (
		<div className="overflow-hidden rounded-md border">
			<table className="w-full text-sm">
				<thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
					<tr>
						<th className="px-3 py-2 text-left">Name</th>
						<th className="px-3 py-2 text-left">Type</th>
						<th className="px-3 py-2 text-left">Client ID</th>
						<th className="px-3 py-2 text-left">Status</th>
						<th className="px-3 py-2" />
					</tr>
				</thead>
				<tbody>
					{rows.map(row => (
						<tr key={row.id} className="border-t">
							<td className="px-3 py-2 font-medium">{row.name}</td>
							<td className="px-3 py-2 text-muted-foreground">
								<Badge variant="secondary">{TYPE_LABELS[row.type]}</Badge>
							</td>
							<td className="px-3 py-2 font-mono text-xs">
								<button
									type="button"
									className="inline-flex items-center gap-1 hover:underline"
									onClick={() => {
										void navigator.clipboard.writeText(row.clientId)
										toast.success('Client ID copied')
									}}
								>
									<Copy className="size-3" />
									{row.clientId.slice(0, 8)}…
								</button>
							</td>
							<td className="px-3 py-2">
								<Switch
									checked={!row.disabled}
									disabled={busyId === row.id}
									onCheckedChange={enabled => onToggleDisabled(row, !enabled)}
									aria-label={row.disabled ? 'Enable client' : 'Disable client'}
								/>
							</td>
							<td className="px-3 py-2 text-right">
								<div className="inline-flex gap-1">
									{row.type !== 'public' && (
										<Button
											size="icon-sm"
											variant="ghost"
											title="Reveal client secret"
											disabled={busyId === row.id}
											onClick={() => onShowSecret(row)}
										>
											<KeyRound className="size-4" />
										</Button>
									)}
									{row.type !== 'public' && (
										<Button
											size="icon-sm"
											variant="ghost"
											title="Rotate client secret"
											disabled={busyId === row.id}
											onClick={() => onRotate(row)}
										>
											<RefreshCw className="size-4" />
										</Button>
									)}
									<Button
										size="icon-sm"
										variant="ghost"
										className="text-destructive hover:text-destructive"
										title="Delete client"
										disabled={busyId === row.id}
										onClick={() => setDeleteRow(row)}
									>
										<Trash2 className="size-4" />
									</Button>
								</div>
							</td>
						</tr>
					))}
				</tbody>
			</table>

			<AlertDialog open={!!deleteRow} onOpenChange={open => !open && setDeleteRow(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete "{deleteRow?.name}"?</AlertDialogTitle>
						<AlertDialogDescription>
							Removes the OIDC client and revokes every access token issued to it. Users who signed in via this client will need to
							re-authenticate.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => {
								if (deleteRow) onDelete(deleteRow)
								setDeleteRow(null)
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

function CreateClientDialog({
	open,
	onOpenChange,
	submitting,
	onSubmit,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	submitting: boolean
	onSubmit: (input: { name: string; type: OidcAppType; redirectUrls: Array<string>; icon?: string }) => Promise<void>
}) {
	const [name, setName] = useState('')
	const [type, setType] = useState<OidcAppType>('web')
	const [redirectsText, setRedirectsText] = useState('')
	const [icon, setIcon] = useState('')
	const [error, setError] = useState<string | null>(null)

	const reset = () => {
		setName('')
		setType('web')
		setRedirectsText('')
		setIcon('')
		setError(null)
	}

	const handle = async (e: React.FormEvent) => {
		e.preventDefault()
		setError(null)
		const redirectUrls = redirectsText
			.split(/\r?\n/)
			.map(s => s.trim())
			.filter(Boolean)
		if (redirectUrls.length === 0) {
			setError('At least one redirect URL is required.')
			return
		}
		try {
			await onSubmit({ name: name.trim(), type, redirectUrls, icon: icon.trim() || undefined })
			reset()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not create client')
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={next => {
				if (!next) reset()
				onOpenChange(next)
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Register a new OIDC client</DialogTitle>
					<DialogDescription>The client_id and client_secret will be shown once when the client is created.</DialogDescription>
				</DialogHeader>
				<form onSubmit={handle} className="space-y-3">
					<div className="grid gap-1">
						<Label htmlFor="oidc-name">Application name</Label>
						<Input id="oidc-name" value={name} onChange={e => setName(e.target.value)} required disabled={submitting} maxLength={120} />
					</div>
					<div className="grid gap-1">
						<Label htmlFor="oidc-type">Application type</Label>
						<Select value={type} onValueChange={v => setType(v as OidcAppType)} disabled={submitting}>
							<SelectTrigger id="oidc-type">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{oidcAppTypeValues.map(t => (
									<SelectItem key={t} value={t}>
										{TYPE_LABELS[t]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							{type === 'public' || type === 'user-agent-based'
								? 'No client secret will be issued (browser-only clients store nothing safely).'
								: 'A client secret will be generated for this client.'}
						</p>
					</div>
					<div className="grid gap-1">
						<Label htmlFor="oidc-redirects">Redirect URLs</Label>
						<textarea
							id="oidc-redirects"
							rows={3}
							value={redirectsText}
							onChange={e => setRedirectsText(e.target.value)}
							placeholder={'https://app.example.com/callback\nhttps://app.example.com/callback-debug'}
							disabled={submitting}
							className="rounded-md border px-2 py-1.5 text-sm font-mono"
						/>
						<p className="text-xs text-muted-foreground">One full https:// URL per line.</p>
					</div>
					<div className="grid gap-1">
						<Label htmlFor="oidc-icon">Icon URL (optional)</Label>
						<Input
							id="oidc-icon"
							value={icon}
							onChange={e => setIcon(e.target.value)}
							placeholder="https://app.example.com/logo.png"
							disabled={submitting}
						/>
					</div>
					{error && <p className="text-sm text-destructive">{error}</p>}
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
							Cancel
						</Button>
						<Button type="submit" disabled={submitting || !name.trim() || !redirectsText.trim()}>
							{submitting ? 'Creating…' : 'Create'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

function SecretRevealDialog({
	reveal,
	onClose,
}: {
	reveal: { name: string; clientId: string; clientSecret: string | null } | null
	onClose: () => void
}) {
	return (
		<Dialog open={!!reveal} onOpenChange={open => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{reveal?.name} — credentials</DialogTitle>
					<DialogDescription>Copy these now. The client secret can't be retrieved later — you'd have to rotate it.</DialogDescription>
				</DialogHeader>
				{reveal && (
					<div className="space-y-2 text-sm">
						<CopyableField label="Client ID" value={reveal.clientId} />
						{reveal.clientSecret ? (
							<CopyableField label="Client Secret" value={reveal.clientSecret} secret />
						) : (
							<p className="text-xs text-muted-foreground">Public clients don't have a client secret.</p>
						)}
					</div>
				)}
				<DialogFooter>
					<Button onClick={onClose}>I've saved it</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function CopyableField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
	return (
		<div className="grid gap-1">
			<Label>{label}</Label>
			<div className="flex items-center gap-2">
				<code className={`flex-1 rounded bg-muted px-2 py-1 font-mono text-xs break-all ${secret ? '' : ''}`}>{value}</code>
				<Button
					type="button"
					size="icon-sm"
					variant="ghost"
					title={`Copy ${label}`}
					onClick={() => {
						void navigator.clipboard.writeText(value)
						toast.success(`${label} copied`)
					}}
				>
					<Copy className="size-4" />
				</Button>
			</div>
		</div>
	)
}
