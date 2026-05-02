'use client'

import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Sprout } from 'lucide-react'

import { getMyDependents } from '@/api/dependents'
import DependentAvatar from '@/components/common/dependent-avatar'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { BirthMonth } from '@/db/schema/enums'

export const Route = createFileRoute('/(core)/settings/dependents')({
	component: DependentsSettingsPage,
})

const monthLabels: Record<BirthMonth, string> = {
	january: 'January',
	february: 'February',
	march: 'March',
	april: 'April',
	may: 'May',
	june: 'June',
	july: 'July',
	august: 'August',
	september: 'September',
	october: 'October',
	november: 'November',
	december: 'December',
}

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
		<div className="animate-page-in gap-6 flex flex-col">
			<CardHeader>
				<CardTitle className="text-2xl flex items-center gap-2">
					<Sprout className="size-5 text-emerald-600" />
					Dependents
				</CardTitle>
				<CardDescription>
					People you receive gifts on behalf of (a pet, baby, or anyone managed by you). Ask an admin to add a new dependent or change
					guardians.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{isLoading ? (
					<LoadingSkeleton />
				) : !data || data.dependents.length === 0 ? (
					<div className="text-sm text-muted-foreground py-6 text-center">You aren't a guardian of any dependents yet.</div>
				) : (
					data.dependents.map(d => {
						const birthLabel = d.birthMonth
							? `${monthLabels[d.birthMonth]}${d.birthDay ? ` ${d.birthDay}` : ''}${d.birthYear ? `, ${d.birthYear}` : ''}`
							: null
						return (
							<div key={d.id} className="flex items-center gap-3 rounded-md border p-3">
								<DependentAvatar name={d.name} image={d.image} size="medium" />
								<div className="flex-1 min-w-0">
									<div className="font-medium truncate">{d.name}</div>
									{birthLabel && <div className="text-xs text-muted-foreground">Birthday: {birthLabel}</div>}
								</div>
							</div>
						)
					})
				)}
			</CardContent>
		</div>
	)
}
