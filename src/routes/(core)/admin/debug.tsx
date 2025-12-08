import { ClientOnly, createFileRoute } from '@tanstack/react-router'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { env } from '@/env'
import { useSession } from '@/lib/auth-client'

export const Route = createFileRoute('/(core)/admin/debug')({
	component: AdminDebugPage,
})

function AdminDebugPage() {
	const { data: session } = useSession()
	return (
		<>
			<Card className="bg-accent animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Current Session</CardTitle>
				</CardHeader>
				<CardContent className="divide-y overflow-scroll text-xs w-full">
					<ClientOnly>
						<pre>
							<code>{JSON.stringify(session, null, 2)}</code>
						</pre>
					</ClientOnly>
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
		</>
	)
}
