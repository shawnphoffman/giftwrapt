import { createFileRoute } from '@tanstack/react-router'
import { ListChecks } from 'lucide-react'

import { PageHeading } from '@/components/common/page-heading'
import { ListsByUser } from '@/components/lists/lists-by-user'
import { NoListsPopover } from '@/components/lists/no-lists-popover'

export const Route = createFileRoute('/(core)/')({
	component: ListsPage,
})

export default function ListsPage() {
	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				<PageHeading
					title={
						<span className="flex items-center gap-1">
							Wish Lists
							<NoListsPopover />
						</span>
					}
					icon={ListChecks}
					color="green"
				/>
				<ListsByUser />
			</div>
		</div>
	)
}
