import { createFileRoute } from '@tanstack/react-router'

import { AiScrapingSection } from '@/components/admin/ai-scraping-section'
import { AiSettingsEditor } from '@/components/admin/ai-settings-editor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ClientOnly } from '@/components/utilities/client-only'

export const Route = createFileRoute('/(core)/admin/ai')({
	component: AdminAiPage,
})

function AdminAiPage() {
	return (
		<Card className="animate-page-in max-w-xl">
			<CardHeader>
				<CardTitle className="text-2xl">AI</CardTitle>
				<CardDescription>
					Configure the AI provider used for future enrichment features. Any OpenAI-compatible endpoint works. Values provided via
					environment variables take precedence and cannot be edited here.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-8">
				<ClientOnly>
					<AiSettingsEditor />
				</ClientOnly>

				<Separator />

				<ClientOnly>
					<AiScrapingSection />
				</ClientOnly>
			</CardContent>
		</Card>
	)
}
