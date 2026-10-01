import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import type { ConnectedAppRow } from '@/api/_mcp-admin-impl'
import { listMyConnectedApps, revokeMyConnectedApp } from '@/api/mcp-grants'
import { fetchAppSettings } from '@/api/settings'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ConnectedAppsPanel } from '@/components/settings/connected-apps-panel'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'
import { useAppSetting } from '@/hooks/use-app-settings'

// Gated by `appSettings.enableMcp`, mirroring /settings/devices and
// `enableMobileApp`: the sidebar entry hides, and this redirect covers a
// direct URL.
export const Route = createFileRoute('/(core)/settings/connected-apps')({
	beforeLoad: async () => {
		const settings = await fetchAppSettings()
		if (!settings.enableMcp) {
			throw redirect({ to: '/settings' })
		}
	},
	component: ConnectedAppsPage,
})

const appsKey = ['connected-apps', 'mine'] as const

function ConnectedAppsPage() {
	return (
		<Card className="animate-page-in max-w-2xl">
			<CardHeader>
				<CardTitle className="text-2xl">Connected Apps</CardTitle>
				<CardDescription>
					AI assistants you have connected to your account. Each one acts as you, with the access you have, and can be disconnected here at
					any time.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ClientOnly>
					<Panel />
				</ClientOnly>
			</CardContent>
		</Card>
	)
}

function Panel() {
	const appTitle = useAppSetting('appTitle')
	const queryClient = useQueryClient()
	const { data: apps, isLoading } = useQuery({ queryKey: appsKey, queryFn: () => listMyConnectedApps(), staleTime: 15 * 1000 })
	const [target, setTarget] = useState<ConnectedAppRow | null>(null)

	const disconnect = useMutation({
		mutationFn: (app: ConnectedAppRow) => revokeMyConnectedApp({ data: { clientId: app.clientId } }),
		onSuccess: () => toast.success('Assistant disconnected'),
		onError: err => toast.error(err instanceof Error ? err.message : 'Could not disconnect'),
		onSettled: () => {
			setTarget(null)
			queryClient.invalidateQueries({ queryKey: appsKey })
		},
	})

	if (isLoading || !apps) return <LoadingSkeleton />
	return (
		<>
			<ConnectedAppsPanel
				apps={apps}
				origin={window.location.origin}
				appTitle={appTitle}
				busyClientId={disconnect.isPending ? (target?.clientId ?? null) : null}
				onDisconnect={app => setTarget(app)}
			/>
			<ConfirmDialog
				open={target !== null}
				onOpenChange={open => !open && setTarget(null)}
				title="Disconnect this assistant?"
				description={`${target?.clientName || 'The assistant'} will be signed out of your account immediately. You can connect it again later.`}
				confirmLabel="Disconnect"
				confirmBusyLabel="Disconnecting..."
				destructive
				onConfirm={async () => {
					if (target) await disconnect.mutateAsync(target)
				}}
			/>
		</>
	)
}
