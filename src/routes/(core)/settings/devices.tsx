'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Check, Copy, Smartphone, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { createMyApiKey, listMyApiKeys, type MobileApiKeySummary, revokeMyApiKey } from '@/api/mobile-keys'
import { fetchAppSettings } from '@/api/settings'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LIMITS } from '@/lib/validation/limits'

export const Route = createFileRoute('/(core)/settings/devices')({
	beforeLoad: async () => {
		const settings = await fetchAppSettings()
		if (!settings.enableMobileApp) {
			throw redirect({ to: '/settings' })
		}
	},
	component: DevicesPage,
})

const myApiKeysQueryKey = ['mobile-keys', 'mine'] as const

function DevicesPage() {
	const queryClient = useQueryClient()
	const [createOpen, setCreateOpen] = useState(false)
	const [revokeTarget, setRevokeTarget] = useState<MobileApiKeySummary | null>(null)
	const [mintedKey, setMintedKey] = useState<{ key: string; name: string } | null>(null)

	const { data: keys, isLoading } = useQuery({
		queryKey: myApiKeysQueryKey,
		queryFn: () => listMyApiKeys(),
		staleTime: 30 * 1000,
	})

	const revokeMutation = useMutation({
		mutationFn: (keyId: string) => revokeMyApiKey({ data: { keyId } }),
		onSuccess: () => {
			toast.success('Device key revoked')
			queryClient.invalidateQueries({ queryKey: myApiKeysQueryKey })
		},
		onError: err => {
			toast.error(err instanceof Error ? err.message : 'Failed to revoke key')
		},
		onSettled: () => setRevokeTarget(null),
	})

	const handleCreated = (result: { key: string; summary: MobileApiKeySummary }) => {
		setCreateOpen(false)
		setMintedKey({ key: result.key, name: result.summary.name ?? 'New device' })
		queryClient.invalidateQueries({ queryKey: myApiKeysQueryKey })
	}

	return (
		<Card className="animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">Devices</CardTitle>
				<CardDescription>
					Mint a per-device API key for the mobile companion app. Each device gets its own key so you can revoke a lost phone without
					signing out everywhere else.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="flex justify-end">
					<Button onClick={() => setCreateOpen(true)}>Create new device key</Button>
				</div>

				{isLoading ? (
					<LoadingSkeleton />
				) : !keys || keys.length === 0 ? (
					<div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
						No device keys yet. Create one to pair a phone or tablet.
					</div>
				) : (
					<ul className="space-y-2">
						{keys.map(key => (
							<DeviceRow key={key.id} keyRow={key} onRevoke={() => setRevokeTarget(key)} />
						))}
					</ul>
				)}
			</CardContent>

			<CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={handleCreated} />

			<MintedKeyDialog open={mintedKey !== null} onClose={() => setMintedKey(null)} mintedKey={mintedKey} />

			<AlertDialog open={revokeTarget !== null} onOpenChange={open => !open && setRevokeTarget(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Revoke this device key?</AlertDialogTitle>
						<AlertDialogDescription>
							{revokeTarget?.name ?? 'This device'} will be signed out of the mobile app immediately and will need a new key to sign back
							in.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={revokeMutation.isPending}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={revokeMutation.isPending}
							onClick={() => {
								if (revokeTarget) revokeMutation.mutate(revokeTarget.id)
							}}
						>
							{revokeMutation.isPending ? 'Revoking...' : 'Revoke'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Card>
	)
}

function DeviceRow({ keyRow, onRevoke }: { keyRow: MobileApiKeySummary; onRevoke: () => void }) {
	const created = formatRelative(keyRow.createdAt)
	const lastUsed = keyRow.lastRequest ? formatRelative(keyRow.lastRequest) : null
	return (
		<li className="group flex items-center gap-4 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
			<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
				<Smartphone className="size-5" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="font-medium truncate">{keyRow.name ?? 'Unnamed device'}</span>
					{keyRow.start && (
						<code className="hidden sm:inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
							{keyRow.start}…
						</code>
					)}
				</div>
				<div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
					<span>Added {created}</span>
					{lastUsed ? <span>Last used {lastUsed}</span> : <span className="italic">Never used</span>}
				</div>
			</div>
			<Button
				variant="ghost"
				size="sm"
				onClick={onRevoke}
				aria-label="Revoke device key"
				className="text-muted-foreground hover:text-destructive"
			>
				<Trash2 className="size-4" />
			</Button>
		</li>
	)
}

function CreateKeyDialog({
	open,
	onOpenChange,
	onCreated,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onCreated: (result: { key: string; summary: MobileApiKeySummary }) => void
}) {
	const [name, setName] = useState('')

	const mutation = useMutation({
		mutationFn: (deviceName: string) => createMyApiKey({ data: { deviceName } }),
		onSuccess: result => {
			setName('')
			onCreated(result)
		},
		onError: err => {
			toast.error(err instanceof Error ? err.message : 'Failed to create device key')
		},
	})

	const trimmed = name.trim()
	const canSubmit = trimmed.length > 0 && !mutation.isPending

	return (
		<Dialog
			open={open}
			onOpenChange={next => {
				if (!next) setName('')
				onOpenChange(next)
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create Device Key</DialogTitle>
					<DialogDescription>Give the device a name you'll recognize, like "My iPhone" or "Living room iPad".</DialogDescription>
				</DialogHeader>
				<form
					onSubmit={e => {
						e.preventDefault()
						if (canSubmit) mutation.mutate(trimmed)
					}}
					className="space-y-4"
				>
					<div className="space-y-2">
						<Label htmlFor="deviceName">Device Name</Label>
						<Input
							id="deviceName"
							value={name}
							onChange={e => setName(e.target.value)}
							maxLength={LIMITS.SHORT_NAME}
							autoFocus
							placeholder="My iPhone"
						/>
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
							Cancel
						</Button>
						<Button type="submit" disabled={!canSubmit}>
							{mutation.isPending ? 'Creating...' : 'Create key'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

function MintedKeyDialog({
	open,
	onClose,
	mintedKey,
}: {
	open: boolean
	onClose: () => void
	mintedKey: { key: string; name: string } | null
}) {
	const [copied, setCopied] = useState(false)

	const handleCopy = async () => {
		if (!mintedKey) return
		try {
			await navigator.clipboard.writeText(mintedKey.key)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
			toast.success('Copied to clipboard')
		} catch {
			toast.error('Could not copy. Select the key and copy it manually.')
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={next => {
				if (!next) {
					setCopied(false)
					onClose()
				}
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Key for {mintedKey?.name}</DialogTitle>
					<DialogDescription>Copy this key and paste it into the mobile app now. You won't be able to see it again.</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					<Label htmlFor="mintedKey">API Key</Label>
					<div className="flex items-stretch gap-2">
						<Input
							id="mintedKey"
							readOnly
							value={mintedKey?.key ?? ''}
							className="font-mono text-xs"
							onFocus={e => e.currentTarget.select()}
						/>
						<Button type="button" variant="outline" onClick={handleCopy} aria-label="Copy key">
							{copied ? <Check className="size-4" /> : <Copy className="size-4" />}
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						Treat this like a password. If it leaks, revoke it from this page and create a new one.
					</p>
				</div>
				<DialogFooter>
					<Button onClick={onClose}>Done</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

const RELATIVE_UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
	{ unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
	{ unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
	{ unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
	{ unit: 'day', ms: 24 * 60 * 60 * 1000 },
	{ unit: 'hour', ms: 60 * 60 * 1000 },
	{ unit: 'minute', ms: 60 * 1000 },
]

function formatRelative(iso: string): string {
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return 'unknown'
	const diffMs = d.getTime() - Date.now()
	const abs = Math.abs(diffMs)
	if (abs < 60 * 1000) return 'just now'
	const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
	for (const { unit, ms } of RELATIVE_UNITS) {
		if (abs >= ms) return rtf.format(Math.round(diffMs / ms), unit)
	}
	return 'just now'
}
