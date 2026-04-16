import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Baby } from 'lucide-react'

import { getChildLists, getMyChildren, type ChildUser } from '@/api/children'
import ListTypeIcon from '@/components/common/list-type-icon'
import UserAvatar from '@/components/common/user-avatar'
import { Badge } from '@/components/ui/badge'
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/(core)/settings/connections')({
	component: ConnectionsPage,
})

function ConnectionsPage() {
	const { data: children, isLoading } = useQuery({
		queryKey: ['my-children'],
		queryFn: () => getMyChildren(),
	})

	return (
		<div className="animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">Connections</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				<div className="flex flex-col gap-2">
					<h3 className="flex items-center gap-2">
						<Baby className="size-5" /> Child Accounts
					</h3>
					<p className="text-sm text-muted-foreground">
						As a guardian, you have full edit access to your children's lists. Manage their items from the edit page.
					</p>
				</div>

				{isLoading ? (
					<div className="text-sm text-muted-foreground">Loading...</div>
				) : !children || children.length === 0 ? (
					<div className="text-sm text-muted-foreground py-4 text-center border rounded-lg bg-accent">
						No child accounts linked. An admin can set up guardianship connections.
					</div>
				) : (
					<div className="flex flex-col gap-4">
						{children.map(child => (
							<ChildSection key={child.id} child={child} />
						))}
					</div>
				)}
			</CardContent>
		</div>
	)
}

function ChildSection({ child }: { child: ChildUser }) {
	const name = child.name || child.email

	const { data: lists } = useQuery({
		queryKey: ['child-lists', child.id],
		queryFn: () => getChildLists({ data: { childId: child.id } }),
	})

	return (
		<div className="border rounded-lg bg-accent overflow-hidden">
			<div className="flex items-center gap-2 p-3 border-b">
				<UserAvatar name={name} image={child.image} />
				<span className="font-medium">{name}</span>
			</div>
			<div className="divide-y">
				{!lists || lists.length === 0 ? (
					<div className="text-sm text-muted-foreground p-3">No lists yet.</div>
				) : (
					lists.map(list => (
						<Link
							key={list.id}
							to="/lists/$listId/edit"
							params={{ listId: String(list.id) }}
							className="flex items-center gap-2 p-2 hover:bg-muted/50"
						>
							<ListTypeIcon type={list.type} className="size-5 shrink-0" />
							<span className="flex-1 font-medium leading-tight truncate">{list.name}</span>
							<Badge variant="secondary" className="text-xs tabular-nums shrink-0">
								{list.itemCount}
							</Badge>
						</Link>
					))
				)}
			</div>
		</div>
	)
}
