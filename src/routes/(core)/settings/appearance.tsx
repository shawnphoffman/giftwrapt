import { createFileRoute } from '@tanstack/react-router'

import { TextSizeSettings } from '@/components/settings/text-size-settings'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/settings/appearance')({
	head: pageHead('Appearance'),
	component: AppearancePage,
})

function AppearancePage() {
	return (
		<Card className="animate-page-in max-w-2xl">
			<CardHeader>
				<CardTitle className="text-2xl">Appearance</CardTitle>
				<CardDescription>How the app looks on this device.</CardDescription>
			</CardHeader>
			<CardContent>
				<TextSizeSettings />
			</CardContent>
		</Card>
	)
}
