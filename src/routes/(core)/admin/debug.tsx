import { ClientOnly, createFileRoute } from '@tanstack/react-router'

import { isEmailConfigured } from '@/api/common'
import SendTestEmailButton from '@/components/admin/send-test-email'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { env } from '@/env'
import { useAppSettings } from '@/hooks/use-app-settings'
import { useSession } from '@/lib/auth-client'

export const Route = createFileRoute('/(core)/admin/debug')({
	component: AdminDebugPage,
	loader: async () => {
		return {
			isEmailConfigured: await isEmailConfigured(),
		}
	},
})

function AdminDebugPage() {
	const { data: session } = useSession()
	const { data: appSettings, isLoading: isLoadingSettings } = useAppSettings()
	const { isEmailConfigured: isEmailEnabled } = Route.useLoaderData()

	return (
		<>
			{/*  */}
			<Card className="bg-accent animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Emails</CardTitle>
					<CardDescription>
						Test emails will be sent to the configured BCC address or the FROM address if no BCC address is configured.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{isEmailEnabled ? (
						<div className="flex flex-col gap-3 max-w-md mx-auto">
							<SendTestEmailButton />
						</div>
					) : (
						<p className="text-sm text-gray-500">Email is not currently configured</p>
					)}
				</CardContent>
			</Card>
			{/*  */}
			<Card className="bg-accent animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">App Settings</CardTitle>
				</CardHeader>
				<CardContent className="divide-y">
					{isLoadingSettings ? (
						<LoadingSkeleton />
					) : (
						Object.entries(appSettings!)
							.sort((a, b) => a[0].localeCompare(b[0]))
							.map(([key, value]) => (
								<div key={key} className="flex flex-col w-full not-first:pt-1 not-last:pb-1 overflow-hidden">
									<span className="font-mono text-xs font-bold text-gray-500">{key}</span>
									<span className="font-mono text-xs break-all">
										{typeof value === 'boolean' ? (
											<span className={value ? 'text-green-500' : 'text-red-500'}>{String(value)}</span>
										) : (
											String(value)
										)}
									</span>
								</div>
							))
					)}
				</CardContent>
			</Card>
			{/*  */}
			<Card className="bg-accent animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Environment Variables</CardTitle>
				</CardHeader>
				<CardContent className="divide-y">
					<ClientOnly>
						{Object.entries(env)
							// .filter(entry => !entry[0].startsWith('npm_'))
							.sort((a, b) => a[0].localeCompare(b[0]))
							.map(([key, value]) => (
								<div key={key} className="flex flex-col w-full not-first:pt-1 not-last:pb-1 overflow-hidden">
									<span className="font-mono text-xs font-bold text-gray-500">{key}</span>
									<span className="font-mono text-xs break-all">{String(value)}</span>
								</div>
							))}
					</ClientOnly>
				</CardContent>
			</Card>
			{/*  */}
			<Card className="bg-accent animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Current Session</CardTitle>
				</CardHeader>
				<CardContent className="divide-y overflow-scroll text-xs w-full">
					<ClientOnly>
						<pre className="break-all whitespace-break-spaces">
							<code>{JSON.stringify(session, null, 2)}</code>
						</pre>
					</ClientOnly>
				</CardContent>
			</Card>
		</>
	)
}
