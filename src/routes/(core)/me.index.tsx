import { createFileRoute, Link, useLocation, useNavigate } from '@tanstack/react-router'
import { Baby, ListOrdered, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'

import { getMyLists, type ChildListGroup } from '@/api/lists'
import ListTypeIcon from '@/components/common/list-type-icon'
import UserAvatar from '@/components/common/user-avatar'
import { CreateListDialog } from '@/components/lists/create-list-dialog'
import { MyListRow } from '@/components/lists/my-list-row'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/(core)/me/')({
	loader: () => getMyLists(),
	component: MyListsPage,
})

function MyListsPage() {
	const data = Route.useLoaderData()
	const [createOpen, setCreateOpen] = useState(false)
	const hash = useLocation({ select: l => l.hash })
	const navigate = useNavigate()

	useEffect(() => {
		if (hash === 'new') {
			setCreateOpen(true)
			navigate({ to: '/me', hash: '', replace: true })
		}
	}, [hash, navigate])

	return (
		<>
			<CreateListDialog open={createOpen} onOpenChange={setCreateOpen} />

			<div className="wish-page">
				<div className="flex flex-col flex-1 gap-6">
					{/* HEADING */}
					<div className="relative flex flex-row flex-wrap justify-between gap-2">
						<h1>My Lists</h1>
						<ListOrdered className="text-red-500 wish-page-icon" />
						<div className="flex flex-row flex-wrap justify-end flex-1 gap-0.5 items-center md:justify-end shrink-0">
							<Button size="sm" onClick={() => setCreateOpen(true)}>
								<Plus className="mr-1 size-4" /> New list
							</Button>
						</div>
					</div>

					{/* PUBLIC LISTS */}
					<ListSection
						title="My Public Lists"
						description="These are the lists that everybody can see and use for gift-giving. You can change your primary list from the action menu."
						lists={data.public}
					/>

					{/* PRIVATE LISTS */}
					<ListSection
						title="My Private Lists"
						description="Nobody else can see these lists unless you explicitly make them an editor. Nice for personal shopping lists."
						lists={data.private}
					/>

					{/* GIFT IDEAS LISTS */}
					<ListSection
						title="Gift Ideas for Others"
						description="Idea lists for other people. Helpful for adding things throughout the year that you think someone might like."
						lists={data.giftIdeas}
					/>

					{/* CHILDREN'S LISTS */}
					{data.children.length > 0 && (
						<div className="flex flex-col gap-2">
							<h3 className="flex items-center gap-2">
								<Baby className="size-5" /> Children's Lists
							</h3>
							<div className="text-sm italic leading-tight text-muted-foreground">
								Lists belonging to your child accounts. You have full edit access as their guardian.
							</div>
							<div className="flex flex-col gap-3">
								{data.children.map(child => (
									<ChildListSection key={child.childId} child={child} />
								))}
							</div>
						</div>
					)}

					{/* EDITABLE LISTS */}
					{data.editable.length > 0 && (
						<div className="flex flex-col gap-2">
							<h3>Lists I Can Edit</h3>
							<div className="text-sm italic leading-tight text-muted-foreground">
								Lists that others created and added you as an editor.
							</div>
							<div className="flex flex-col overflow-hidden border divide-y rounded-lg bg-accent">
								{data.editable.map(list => (
									<MyListRow
										key={list.id}
										list={list}
										showOwner={{ name: list.ownerName, email: list.ownerEmail }}
									/>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
		</>
	)
}

function ListSection({
	title,
	description,
	lists,
}: {
	title: string
	description: string
	lists: Array<Parameters<typeof MyListRow>[0]['list']>
}) {
	return (
		<div className="flex flex-col gap-2">
			<h3>{title}</h3>
			<div className="text-sm italic leading-tight text-muted-foreground">{description}</div>
			{lists.length === 0 ? (
				<div className="text-sm text-muted-foreground py-3 px-2">No lists yet.</div>
			) : (
				<div className="flex flex-col overflow-hidden border divide-y rounded-lg bg-accent">
					{lists.map(list => (
						<MyListRow key={list.id} list={list} />
					))}
				</div>
			)}
		</div>
	)
}

function ChildListSection({ child }: { child: ChildListGroup }) {
	const name = child.childName || child.childEmail
	return (
		<div className="border rounded-lg bg-accent overflow-hidden">
			<div className="flex items-center gap-2 p-2 border-b bg-muted/30">
				<UserAvatar name={name} image={child.childImage} size="small" />
				<span className="font-medium text-sm">{name}</span>
			</div>
			{child.lists.length === 0 ? (
				<div className="text-sm text-muted-foreground p-2">No lists yet.</div>
			) : (
				<div className="divide-y">
					{child.lists.map(list => (
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
					))}
				</div>
			)}
		</div>
	)
}
