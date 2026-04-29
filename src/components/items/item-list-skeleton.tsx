import { Skeleton } from '@/components/ui/skeleton'

type Props = {
	count?: number
}

export function ItemListSkeleton({ count = 4 }: Props) {
	return (
		<div className="flex flex-col gap-2 xs:pl-6">
			{Array.from({ length: count }).map((_, i) => (
				<Skeleton key={i} className="h-12 w-full" />
			))}
		</div>
	)
}
