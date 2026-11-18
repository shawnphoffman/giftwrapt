'use client'

import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Sprout } from 'lucide-react'

import { getMyDependents } from '@/api/dependents'
import DependentAvatar from '@/components/common/dependent-avatar'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMonthDay } from '@/lib/i18n/labels'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/settings/dependents')({
	head: pageHead(() => m.page_dependents()),
	component: DependentsSettingsPage,
})

// Read-only view of the dependents the current user is a guardian of.
// CRUD lives in the admin surface (/admin/dependents); ask an admin to
// add or remove a dependent.
function DependentsSettingsPage() {
	const { data, isLoading } = useQuery({
		queryKey: ['dependents', 'mine'],
		queryFn: () => getMyDependents(),
		staleTime: 5 * 60 * 1000,
	})

	return (
		<Card className="animate-page-in max-w-2xl">
			<CardHeader>
				<CardTitle className="text-2xl flex items-center gap-2">
					<Sprout className="size-5 text-emerald-600" />
					{m.page_dependents()}
				</CardTitle>
				<CardDescription>{m.settings_dependents_page_description()}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{isLoading ? (
					<LoadingSkeleton />
				) : !data || data.dependents.length === 0 ? (
					<div className="text-sm text-muted-foreground py-6 text-center">{m.settings_dependents_empty()}</div>
				) : (
					data.dependents.map(d => {
						const birthLabel = d.birthMonth ? formatMonthDay(d.birthMonth, d.birthDay, d.birthYear) : null
						return (
							<div key={d.id} className="flex items-center gap-3 rounded-md border p-3">
								<DependentAvatar name={d.name} image={d.image} size="medium" />
								<div className="flex-1 min-w-0">
									<div className="font-medium truncate">{d.name}</div>
									{birthLabel && (
										<div className="text-xs text-muted-foreground">{m.settings_dependents_birthday({ date: birthLabel })}</div>
									)}
								</div>
							</div>
						)
					})
				)}
			</CardContent>
		</Card>
	)
}
