import { useQuery } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { type DependentSummary, getAllDependents } from '@/api/dependents'
import DependentAvatar from '@/components/common/dependent-avatar'
import UserAvatar from '@/components/common/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { BirthMonth } from '@/db/schema/enums'

import { EditDependentDialog } from './edit-dependent-dialog'

type AdminDependent = DependentSummary & {
	guardians: Array<{ id: string; name: string | null; email: string; image: string | null }>
}

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

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent side="top">{label}</TooltipContent>
		</Tooltip>
	)
}

// Mirrors `AdminUsersList`: same grid breakpoints so dependents and users
// line up column-for-column when stacked under a single Card. Clicking a
// row opens the edit dialog.
export function AdminDependentsList() {
	const dependentsQuery = useQuery({
		queryKey: ['admin', 'dependents'],
		queryFn: () => getAllDependents(),
		staleTime: 60 * 1000,
	})

	if (dependentsQuery.isLoading) {
		return (
			<div className="space-y-3">
				{[...Array(2)].map((_, i) => (
					<div key={i} className="flex items-center gap-3">
						<Skeleton className="h-10 w-10 rounded-full" />
						<div className="flex-1 space-y-2">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-3 w-48" />
						</div>
					</div>
				))}
			</div>
		)
	}

	if (!dependentsQuery.data || dependentsQuery.data.dependents.length === 0) {
		return <div className="text-sm text-muted-foreground">No dependents yet.</div>
	}

	return (
		<TooltipProvider delayDuration={150}>
			<div className="grid grid-cols-1 divide-y @sm/admin-content:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)] @xl/admin-content:grid-cols-[minmax(0,2fr)_minmax(0,1.25fr)_minmax(0,1.5fr)]">
				{dependentsQuery.data.dependents.map(d => (
					<DependentRow key={d.id} dependent={d} />
				))}
			</div>
		</TooltipProvider>
	)
}

function DependentRow({ dependent }: { dependent: AdminDependent }) {
	const [open, setOpen] = useState(false)
	const monthName = dependent.birthMonth ? `${monthLabels[dependent.birthMonth]} ${dependent.birthDay ?? ''}`.trim() : null

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="grid grid-cols-subgrid col-span-full items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:bg-muted/50"
			>
				{/* Identity */}
				<div className="flex items-center gap-3 min-w-0">
					<DependentAvatar name={dependent.name} image={dependent.image} />
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2">
							<span className="font-medium text-sm truncate">{dependent.name}</span>
							{dependent.isArchived && <span className="text-[10px] uppercase tracking-wide text-muted-foreground italic">archived</span>}
						</div>
						<div className="text-xs text-muted-foreground">Dependent</div>
					</div>
				</div>

				{/* Birthday */}
				<div className="hidden @xl/admin-content:flex items-center justify-start gap-1 min-w-0">
					{monthName && (
						<Tip label={`Birthday: ${monthName}${dependent.birthYear ? `, ${dependent.birthYear}` : ''}`}>
							<Badge variant="outline">{monthName}</Badge>
						</Tip>
					)}
				</div>

				{/* Guardians */}
				<div className="hidden @sm/admin-content:flex items-center px-3 -space-x-2">
					{dependent.guardians.length === 0 && <span className="text-xs italic text-destructive">No guardians</span>}
					{dependent.guardians.map((g, i) => {
						const label = g.name || g.email
						const isTopmost = i === dependent.guardians.length - 1
						return (
							<Tip key={g.id} label={`Guardian: ${label}`}>
								<span className="relative inline-flex">
									<UserAvatar name={label} image={g.image} size="small" className="ring-1 ring-border" />
									{isTopmost && (
										<ShieldCheck className="absolute -bottom-0.5 -right-0.5 size-3.5 fill-emerald-500 text-white dark:text-background stroke-[2.5] drop-shadow-sm" />
									)}
								</span>
							</Tip>
						)
					})}
				</div>
			</button>

			<EditDependentDialog dependent={dependent} open={open} onOpenChange={setOpen} />
		</>
	)
}
