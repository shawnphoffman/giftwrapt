import { createFileRoute } from '@tanstack/react-router'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/(core)/temp/')({
	component: TempIndex,
})

function TempIndex() {
	return (
		<Card className="animate-page-in max-w-xl">
			<CardHeader>
				<CardTitle className="text-2xl">Scratch Space</CardTitle>
				<CardDescription>
					Admin-only area for previewing experimental UI and platform features that aren't ready to ship behind a stable URL. Pages here are
					not linked from the global sidebar.
				</CardDescription>
			</CardHeader>
			<CardContent className="text-sm text-muted-foreground">
				Pick a tool from the left. Currently: <span className="font-medium text-foreground">Widgets</span> - previews the iOS
				upcoming-birthdays widget logic.
			</CardContent>
		</Card>
	)
}
