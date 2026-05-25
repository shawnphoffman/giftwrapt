import { Skeleton } from '@/components/ui/skeleton'

export function ListAddonsSectionSkeleton() {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-2 xs:flex-row xs:items-center xs:justify-between">
				<Skeleton className="h-6 w-32" />
				<Skeleton className="h-8 w-36 xs:w-44" />
			</div>
			<Skeleton className="h-12 w-full xs:ml-6" />
		</div>
	)
}
