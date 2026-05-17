import { createFileRoute } from '@tanstack/react-router'

import { AiFeaturesCard } from '@/components/admin/ai-features-card'
import { AiSettingsEditor } from '@/components/admin/ai-settings-editor'
import { ClientOnly } from '@/components/utilities/client-only'

export const Route = createFileRoute('/(core)/admin/ai')({
	component: AdminAiPage,
})

function AdminAiPage() {
	return (
		<div className="flex flex-col gap-6 max-w-xl animate-page-in">
			<ClientOnly>
				<AiSettingsEditor />
			</ClientOnly>

			<ClientOnly>
				<AiFeaturesCard />
			</ClientOnly>
		</div>
	)
}
