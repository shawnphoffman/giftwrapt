import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import type { ConnectedAppRow } from '@/api/_mcp-admin-impl'
import { listMyConnectedApps, revokeMyConnectedApp, setMyConnectedAppAccess } from '@/api/mcp-grants'
import { fetchAppSettings } from '@/api/settings'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ConnectedAppsPanel } from '@/components/settings/connected-apps-panel'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'
import { useAppSetting } from '@/hooks/use-app-settings'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

// Gated by `appSettings.enableMcp`, mirroring /settings/devices and
// `enableMobileApp`: the sidebar entry hides, and this redirect covers a
// direct URL.
export const Route = createFileRoute('/(core)/settings/connected-apps')({
	head: pageHead(() => m.page_connected_apps()),
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
				<CardTitle className="text-2xl">{m.page_connected_apps()}</CardTitle>
				<CardDescription>{m.settings_apps_page_description()}</CardDescription>
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
		onSuccess: () => toast.success(m.settings_apps_disconnected_toast()),
		onError: err => toast.error(err instanceof Error ? err.message : m.settings_apps_disconnect_failed()),
		onSettled: () => {
			setTarget(null)
			queryClient.invalidateQueries({ queryKey: appsKey })
		},
	})

	const changeAccess = useMutation({
		mutationFn: (vars: { app: ConnectedAppRow; access: ConnectedAppRow['access'] }) =>
			setMyConnectedAppAccess({ data: { clientId: vars.app.clientId, access: vars.access } }),
		onSuccess: (_result, vars) =>
			toast.success(vars.access === 'read' ? m.settings_apps_access_read_toast() : m.settings_apps_access_write_toast()),
		onError: err => toast.error(err instanceof Error ? err.message : m.settings_apps_access_failed()),
		onSettled: () => queryClient.invalidateQueries({ queryKey: appsKey }),
	})

	if (isLoading || !apps) return <LoadingSkeleton />
	return (
		<>
			<ConnectedAppsPanel
				apps={apps}
				origin={window.location.origin}
				appTitle={appTitle}
				busyClientId={
					disconnect.isPending ? (target?.clientId ?? null) : changeAccess.isPending ? changeAccess.variables.app.clientId : null
				}
				onDisconnect={app => setTarget(app)}
				onAccessChange={(app, access) => changeAccess.mutate({ app, access })}
			/>
			<ConfirmDialog
				open={target !== null}
				onOpenChange={open => !open && setTarget(null)}
				title={m.settings_apps_disconnect_confirm_title()}
				description={
					target?.clientName
						? m.settings_apps_disconnect_confirm_description({ name: target.clientName })
						: m.settings_apps_disconnect_confirm_description_unnamed()
				}
				confirmLabel={m.settings_apps_disconnect_button()}
				confirmBusyLabel={m.settings_apps_disconnecting()}
				destructive
				onConfirm={async () => {
					if (target) await disconnect.mutateAsync(target)
				}}
			/>
		</>
	)
}
