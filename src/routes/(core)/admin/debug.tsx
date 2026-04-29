import { ClientOnly, createFileRoute } from '@tanstack/react-router'

import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAdminAppSettings } from '@/hooks/use-app-settings'
import { useSession } from '@/lib/auth-client'
import { BUILD_INFO } from '@/lib/build-info'

export const Route = createFileRoute('/(core)/admin/debug')({
	component: AdminDebugPage,
})

function AdminDebugPage() {
	const { data: session } = useSession()
	const { data: appSettings, isLoading: isLoadingSettings } = useAdminAppSettings()

	return (
		<>
			{/*  */}
			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Build Info</CardTitle>
				</CardHeader>
				<CardContent className="divide-y">
					{Object.entries({
						version: BUILD_INFO.version,
						commit: BUILD_INFO.commitShort || '(unknown)',
						buildTime: BUILD_INFO.buildTime || '(unknown)',
					}).map(([key, value]) => (
						<div key={key} className="flex flex-col w-full not-first:pt-1 not-last:pb-1 overflow-hidden">
							<span className="font-mono text-xs font-bold text-gray-500">{key}</span>
							<span className="font-mono text-xs break-all">{value}</span>
						</div>
					))}
				</CardContent>
			</Card>
			{/*  */}
			{BUILD_INFO.vercel && (
				<Card className="animate-page-in">
					<CardHeader>
						<CardTitle className="text-2xl">Vercel Deployment</CardTitle>
					</CardHeader>
					<CardContent className="divide-y">
						{Object.entries(BUILD_INFO.vercel)
							.filter(([, value]) => value)
							.map(([key, value]) => (
								<div key={key} className="flex flex-col w-full not-first:pt-1 not-last:pb-1 overflow-hidden">
									<span className="font-mono text-xs font-bold text-gray-500">{key}</span>
									<span className="font-mono text-xs break-all">{value}</span>
								</div>
							))}
					</CardContent>
				</Card>
			)}
			{/*  */}
			<Card className="animate-page-in">
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
			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Environment Variables</CardTitle>
				</CardHeader>
				<CardContent className="divide-y">
					<ClientOnly>
						{Object.entries(import.meta.env)
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
			<Card className="animate-page-in">
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
