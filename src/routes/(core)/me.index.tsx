import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useLocation, useNavigate } from '@tanstack/react-router'
import { Baby, ListOrdered, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'

import { type ChildListGroup, type DependentListGroup, getMyLists, type MyListRow } from '@/api/lists'
import DependentAvatar from '@/components/common/dependent-avatar'
import ListTypeIcon from '@/components/common/list-type-icon'
import UserAvatar from '@/components/common/user-avatar'
import { AddItemDialog } from '@/components/items/add-item-dialog'
import { CreateListDialog } from '@/components/lists/create-list-dialog'
import { ListRow } from '@/components/lists/list-row'
import {
	ListsCard,
	ListsCardDescription,
	ListsCardHeader,
	ListsCardList,
	ListsCardLists,
	ListsCardTitle,
} from '@/components/lists/lists-card'
import { PrimaryListNudge } from '@/components/lists/primary-list-nudge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const myListsQueryOptions = {
	queryKey: ['my-lists'] as const,
	queryFn: () => getMyLists(),
	staleTime: 60 * 1000,
}

type MeSearch = { url?: string }

const isHttpUrlString = (raw: unknown): raw is string => {
	if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2000) return false
	try {
		const parsed = new URL(raw)
		return parsed.protocol === 'http:' || parsed.protocol === 'https:'
	} catch {
		return false
	}
}

export const Route = createFileRoute('/(core)/me/')({
	validateSearch: (search: Record<string, unknown>): MeSearch => {
		return isHttpUrlString(search.url) ? { url: search.url } : {}
	},
	loader: ({ context }) => context.queryClient.ensureQueryData(myListsQueryOptions),
	component: MyListsPage,
	pendingComponent: MyListsPagePending,
})

function MyListsPagePending() {
	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				<div className="relative flex flex-row flex-wrap justify-between gap-2">
					<h1>My Lists</h1>
					<ListOrdered className="text-red-500 wish-page-icon" />
				</div>
				{Array.from({ length: 3 }).map((_section, sectionIdx) => (
					<div key={sectionIdx} className="flex flex-col gap-2">
						<Skeleton className="h-5 w-48" />
						<Skeleton className="h-4 w-2/3 max-w-md" />
						<div className="flex flex-col gap-2 mt-1">
							{Array.from({ length: 2 }).map((_row, rowIdx) => (
								<Skeleton key={rowIdx} className="h-12 w-full" />
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	)
}

function MyListsPage() {
	const { data } = useSuspenseQuery(myListsQueryOptions)
	const [createOpen, setCreateOpen] = useState(false)
	const [addItemOpen, setAddItemOpen] = useState(false)
	const [pendingUrl, setPendingUrl] = useState<string | undefined>(undefined)
	const hash = useLocation({ select: l => l.hash })
	const search = Route.useSearch()
	const navigate = useNavigate()

	const editableGiftIdeas = data.editable.filter(l => l.type === 'giftideas')
	const editableOther = data.editable.filter(l => l.type !== 'giftideas')

	useEffect(() => {
		if (search.url) {
			setPendingUrl(search.url)
			setAddItemOpen(true)
			navigate({ to: '/me', search: {}, hash: '', replace: true })
			return
		}
		if (hash === 'new') {
			setCreateOpen(true)
			navigate({ to: '/me', hash: '', replace: true })
		} else if (hash === 'add-item') {
			setAddItemOpen(true)
			navigate({ to: '/me', hash: '', replace: true })
		}
	}, [hash, search.url, navigate])

	return (
		<>
			<CreateListDialog open={createOpen} onOpenChange={setCreateOpen} />
			<AddItemDialog
				open={addItemOpen}
				onOpenChange={next => {
					setAddItemOpen(next)
					if (!next) setPendingUrl(undefined)
				}}
				initialUrl={pendingUrl}
			/>

			<div className="wish-page">
				<div className="flex flex-col flex-1 gap-6">
					{/* HEADING */}
					<div className="relative flex flex-row flex-wrap justify-between gap-2">
						<h1>My Lists</h1>
						<ListOrdered className="text-red-500 wish-page-icon" />
						<div className="flex flex-row flex-wrap justify-end flex-1 gap-0.5 items-center md:justify-end shrink-0">
							<Button size="sm" onClick={() => setCreateOpen(true)}>
								<Plus className="size-4" /> New list
							</Button>
						</div>
					</div>
					<div className="text-sm text-muted-foreground">
						Mark any list as <strong>primary</strong> from its action menu. Quick-imported gift ideas land there by default.
					</div>
					<PrimaryListNudge />

					{/* PUBLIC LISTS */}
					<ListSection
						title="My Public Lists"
						description="These are the lists that everybody can see and use for gift-giving."
						lists={data.public}
					/>

					{/* PRIVATE LISTS */}
					<ListSection
						title="My Private Lists"
						description="Nobody else can see these lists unless you explicitly make them an editor. Nice for personal shopping lists."
						lists={data.private}
					/>

					{/* GIFT IDEAS LISTS */}
					<ListsCard>
						<ListsCardHeader className="flex-col items-start gap-1">
							<ListsCardTitle>Gift Ideas for Others</ListsCardTitle>
							<ListsCardDescription className="italic">
								Idea lists for other people. Helpful for adding things throughout the year that you think someone might like.
							</ListsCardDescription>
						</ListsCardHeader>
						<ListsCardLists>
							{data.giftIdeas.length === 0 && editableGiftIdeas.length === 0 ? (
								<div className="text-sm text-muted-foreground py-3 px-3 border border-dashed rounded-lg bg-accent/30 italic">
									No lists yet.
								</div>
							) : (
								<>
									{data.giftIdeas.map(list => (
										<ListRow key={list.id} role="recipient" list={list} />
									))}
									{editableGiftIdeas.map(list => (
										<ListRow
											key={list.id}
											role="recipient"
											list={list}
											showOwner={{ name: list.ownerName, email: list.ownerEmail, image: list.ownerImage }}
											editors={list.otherEditors}
										/>
									))}
								</>
							)}
						</ListsCardLists>
					</ListsCard>

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

					{/* DEPENDENTS' LISTS */}
					{data.dependents.length > 0 && (
						<div className="flex flex-col gap-2">
							<h3>Dependents' Lists</h3>
							<div className="text-sm italic leading-tight text-muted-foreground">
								Lists for pets, babies, or anyone else you receive gifts on behalf of.
							</div>
							<div className="flex flex-col gap-3">
								{data.dependents.map(dep => (
									<DependentListSection key={dep.dependentId} dependent={dep} />
								))}
							</div>
						</div>
					)}

					{/* EDITABLE LISTS */}
					{editableOther.length > 0 && (
						<ListsCard>
							<ListsCardHeader className="flex-col items-start gap-1">
								<ListsCardTitle>Lists I Can Edit</ListsCardTitle>
								<ListsCardDescription className="italic">Lists that others created and added you as an editor.</ListsCardDescription>
							</ListsCardHeader>
							<ListsCardLists>
								{editableOther.map(list => (
									<ListRow
										key={list.id}
										role="recipient"
										list={list}
										showOwner={
											list.subjectDependentId && list.subjectDependentName
												? { kind: 'dependent', name: list.subjectDependentName, image: list.subjectDependentImage }
												: { name: list.ownerName, email: list.ownerEmail, image: list.ownerImage }
										}
										editors={list.otherEditors}
									/>
								))}
							</ListsCardLists>
						</ListsCard>
					)}
				</div>
			</div>
		</>
	)
}

function ListSection({ title, description, lists }: { title: string; description: string; lists: Array<MyListRow> }) {
	return (
		<ListsCard>
			<ListsCardHeader className="flex-col items-start gap-1">
				<ListsCardTitle>{title}</ListsCardTitle>
				<ListsCardDescription className="italic">{description}</ListsCardDescription>
			</ListsCardHeader>
			<ListsCardLists>
				{lists.length === 0 ? (
					<div className="text-sm text-muted-foreground py-3 px-3 border border-dashed rounded-lg bg-accent/30 italic">No lists yet.</div>
				) : (
					lists.map(list => <ListRow key={list.id} role="recipient" list={list} />)
				)}
			</ListsCardLists>
		</ListsCard>
	)
}

function ChildListSection({ child }: { child: ChildListGroup }) {
	const name = child.childName || child.childEmail
	return (
		<ListsCard>
			<ListsCardHeader>
				<UserAvatar name={name} image={child.childImage} size="small" />
				<ListsCardTitle className="text-base font-medium">{name}</ListsCardTitle>
			</ListsCardHeader>
			<ListsCardLists>
				{child.lists.length === 0 ? (
					<div className="text-sm text-muted-foreground py-3 px-3 border border-dashed rounded-lg bg-accent/30 italic">No lists yet.</div>
				) : (
					child.lists.map(list => (
						<ListsCardList key={list.id} asChild className="text-base">
							<Link to="/lists/$listId/edit" params={{ listId: String(list.id) }}>
								<ListTypeIcon type={list.type} className="size-5 shrink-0" />
								<span className="flex-1 font-medium leading-tight truncate">{list.name}</span>
								<Badge variant="secondary" className="text-xs tabular-nums shrink-0">
									{list.itemCount}
								</Badge>
							</Link>
						</ListsCardList>
					))
				)}
			</ListsCardLists>
		</ListsCard>
	)
}

function DependentListSection({ dependent }: { dependent: DependentListGroup }) {
	return (
		<ListsCard>
			<ListsCardHeader>
				<DependentAvatar name={dependent.dependentName} image={dependent.dependentImage} size="small" />
				<ListsCardTitle className="text-base font-medium">{dependent.dependentName}</ListsCardTitle>
			</ListsCardHeader>
			<ListsCardLists>
				{dependent.lists.length === 0 ? (
					<div className="text-sm text-muted-foreground py-3 px-3 border border-dashed rounded-lg bg-accent/30 italic">No lists yet.</div>
				) : (
					dependent.lists.map(list => (
						<ListsCardList key={list.id} asChild className="text-base">
							<Link to="/lists/$listId/edit" params={{ listId: String(list.id) }}>
								<ListTypeIcon type={list.type} className="size-5 shrink-0" />
								<span className="flex-1 font-medium leading-tight truncate">{list.name}</span>
								<Badge variant="secondary" className="text-xs tabular-nums shrink-0">
									{list.itemCount}
								</Badge>
							</Link>
						</ListsCardList>
					))
				)}
			</ListsCardLists>
		</ListsCard>
	)
}
