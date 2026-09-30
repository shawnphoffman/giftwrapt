import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import type { OauthClientRow, OauthGrantRow } from '@/api/_mcp-admin-impl'
import {
	deleteOauthClientAsAdmin,
	listOauthClientsAsAdmin,
	listOauthGrantsAsAdmin,
	revokeOauthGrantAsAdmin,
	setOauthClientDisabledAsAdmin,
} from '@/api/admin-mcp'
import { fetchAppSettings } from '@/api/settings'
import { McpClientsTable } from '@/components/admin/mcp-clients-table'
import { type DiscoveryStatus, McpConnectCard } from '@/components/admin/mcp-connect-card'
import { McpGrantsTable } from '@/components/admin/mcp-grants-table'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'
import { buildMcpConnectInfo } from '@/lib/mcp-connect'

// Gated by `appSettings.enableMcp`, the same way /admin/barcode is gated
// by `enableMobileApp`: the sidebar entry in `admin/links.tsx` reads the
// flag, and this redirect is the backstop for direct-URL access.
export const Route = createFileRoute('/(core)/admin/mcp')({
	beforeLoad: async () => {
		const settings = await fetchAppSettings()
		if (!settings.enableMcp) {
			throw redirect({ to: '/admin' })
		}
	},
	component: AdminMcpPage,
})

const clientsKey = ['admin', 'mcp', 'clients'] as const
const grantsKey = ['admin', 'mcp', 'grants'] as const

function AdminMcpPage() {
	return (
		<>
			<ClientOnly>
				<ConnectSection />
			</ClientOnly>
			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<CardTitle className="text-2xl">Clients</CardTitle>
					<CardDescription>
						Apps that registered themselves to connect. Disable one to revoke its access and block new sign-ins; delete it to also forget
						every consent. Real clients simply register again next time.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ClientsSection />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<CardTitle className="text-2xl">Active Connections</CardTitle>
					<CardDescription>
						Every user-to-client connection that can still sign in. Revoking one signs that assistant out for that user.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<GrantsSection />
					</ClientOnly>
				</CardContent>
			</Card>
		</>
	)
}

function ConnectSection() {
	const origin = window.location.origin
	const info = buildMcpConnectInfo(origin)
	const [status, setStatus] = useState<Record<string, DiscoveryStatus>>({})

	useEffect(() => {
		let cancelled = false
		for (const d of info.discovery) {
			setStatus(prev => ({ ...prev, [d.url]: 'checking' }))
			fetch(d.url, { method: 'GET', cache: 'no-store' })
				.then(res => {
					if (!cancelled) setStatus(prev => ({ ...prev, [d.url]: res.ok ? 'ok' : 'unreachable' }))
				})
				.catch(() => {
					if (!cancelled) setStatus(prev => ({ ...prev, [d.url]: 'unreachable' }))
				})
		}
		return () => {
			cancelled = true
		}
		// The discovery list is a pure function of the origin.
	}, [origin])

	return <McpConnectCard origin={origin} discoveryStatus={status} />
}

function ClientsSection() {
	const queryClient = useQueryClient()
	const { data: clients, isLoading } = useQuery({ queryKey: clientsKey, queryFn: () => listOauthClientsAsAdmin(), staleTime: 15 * 1000 })
	const [deleteTarget, setDeleteTarget] = useState<OauthClientRow | null>(null)
	const [busy, setBusy] = useState<string | null>(null)

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: clientsKey })
		queryClient.invalidateQueries({ queryKey: grantsKey })
	}

	const toggle = useMutation({
		mutationFn: (client: OauthClientRow) =>
			setOauthClientDisabledAsAdmin({ data: { clientId: client.clientId, disabled: !client.disabled } }),
		onMutate: client => setBusy(client.clientId),
		onSuccess: (_result, client) => toast.success(client.disabled ? 'Client enabled' : 'Client disabled and its connections revoked'),
		onError: err => toast.error(err instanceof Error ? err.message : 'Could not update client'),
		onSettled: () => {
			setBusy(null)
			invalidate()
		},
	})

	const remove = useMutation({
		mutationFn: (client: OauthClientRow) => deleteOauthClientAsAdmin({ data: { clientId: client.clientId } }),
		onSuccess: () => toast.success('Client deleted'),
		onError: err => toast.error(err instanceof Error ? err.message : 'Could not delete client'),
		onSettled: () => {
			setDeleteTarget(null)
			invalidate()
		},
	})

	if (isLoading || !clients) return <LoadingSkeleton />
	return (
		<>
			<McpClientsTable clients={clients} busyClientId={busy} onToggleDisabled={c => toggle.mutate(c)} onDelete={c => setDeleteTarget(c)} />
			<ConfirmDialog
				open={deleteTarget !== null}
				onOpenChange={open => !open && setDeleteTarget(null)}
				title="Delete this client?"
				description={`${deleteTarget?.name || 'This client'} will lose every connection and consent. Users who still use it will be asked to connect again.`}
				confirmLabel="Delete"
				confirmBusyLabel="Deleting..."
				destructive
				onConfirm={async () => {
					if (deleteTarget) await remove.mutateAsync(deleteTarget)
				}}
			/>
		</>
	)
}

function GrantsSection() {
	const queryClient = useQueryClient()
	const { data: grants, isLoading } = useQuery({
		queryKey: grantsKey,
		queryFn: () => listOauthGrantsAsAdmin({ data: {} }),
		staleTime: 15 * 1000,
	})
	const [revokeTarget, setRevokeTarget] = useState<OauthGrantRow | null>(null)

	const revoke = useMutation({
		mutationFn: (grant: OauthGrantRow) => revokeOauthGrantAsAdmin({ data: { tokenId: grant.id } }),
		onSuccess: () => toast.success('Connection revoked'),
		onError: err => toast.error(err instanceof Error ? err.message : 'Could not revoke connection'),
		onSettled: () => {
			setRevokeTarget(null)
			queryClient.invalidateQueries({ queryKey: grantsKey })
			queryClient.invalidateQueries({ queryKey: clientsKey })
		},
	})

	if (isLoading || !grants) return <LoadingSkeleton />
	return (
		<>
			<McpGrantsTable
				grants={grants}
				busyGrantId={revoke.isPending ? (revokeTarget?.id ?? null) : null}
				onRevoke={g => setRevokeTarget(g)}
			/>
			<ConfirmDialog
				open={revokeTarget !== null}
				onOpenChange={open => !open && setRevokeTarget(null)}
				title="Revoke this connection?"
				description={`${revokeTarget?.clientName || 'The assistant'} will be signed out of ${revokeTarget?.userName ?? 'this user'}'s account immediately.`}
				confirmLabel="Revoke"
				confirmBusyLabel="Revoking..."
				destructive
				onConfirm={async () => {
					if (revokeTarget) await revoke.mutateAsync(revokeTarget)
				}}
			/>
		</>
	)
}
