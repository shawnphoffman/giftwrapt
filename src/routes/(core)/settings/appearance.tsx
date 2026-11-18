import { createFileRoute } from '@tanstack/react-router'

import { LanguageSettings } from '@/components/settings/language-settings'
import { TextSizeSettings } from '@/components/settings/text-size-settings'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/settings/appearance')({
	head: pageHead(() => m.page_appearance()),
	component: AppearancePage,
})

function AppearancePage() {
	return (
		<Card className="animate-page-in max-w-2xl">
			<CardHeader>
				<CardTitle className="text-2xl">{m.page_appearance()}</CardTitle>
				<CardDescription>{m.settings_appearance_description()}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-8">
				<TextSizeSettings />
				<LanguageSettings />
			</CardContent>
		</Card>
	)
}
