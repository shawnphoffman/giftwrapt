import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useLocation, useNavigate } from '@tanstack/react-router'
import { Baby, ListOrdered, Plus, Search, Sprout } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { SkeletonSuspense } from 'skullet/react'

import { type ChildListGroup, type DependentListGroup, getMyLists, type MyListRow, type MyListsResult } from '@/api/lists'
import DependentAvatar from '@/components/common/dependent-avatar'
import ListTypeIcon from '@/components/common/list-type-icon'
import { PageHeading } from '@/components/common/page-heading'
import { RichMessage } from '@/components/common/rich-message'
import UserAvatar from '@/components/common/user-avatar'
import { AddItemDialog } from '@/components/items/add-item-dialog'
import { ItemSearchDialog } from '@/components/items/item-search-dialog'
import { CreateListDialog } from '@/components/lists/create-list-dialog'
import { ListRow } from '@/components/lists/list-row'
import { ListTypeLegend } from '@/components/lists/list-type-legend'
import {
	ListsCard,
	ListsCardDescription,
	ListsCardHeader,
	ListsCardList,
	ListsCardLists,
	ListsCardTitle,
} from '@/components/lists/lists-card'
import { SAMPLE_MY_LISTS } from '@/components/lists/my-lists-sample'
import { PrimaryListNudge } from '@/components/lists/primary-list-nudge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { perfTime } from '@/lib/observability/perf'
import { useMeSSE } from '@/lib/use-me-sse'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

const myListsQueryOptions = {
	queryKey: ['my-lists'] as const,
	queryFn: () => perfTime('loader:me getMyLists', () => getMyLists()),
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
	head: pageHead(() => m.page_my_lists()),
	validateSearch: (search: Record<string, unknown>): MeSearch => {
		return isHttpUrlString(search.url) ? { url: search.url } : {}
	},
	// Empty-loader pattern: no data fetching in the loader. The route swaps
	// instantly; the dashboard mounts with a skeleton in place, then
	// useSuspenseQuery below kicks off getMyLists which fills in when ready.
	// Critically, we do NOT prefetch here - setupRouterSsrQueryIntegration
	// makes the router wait for any queries the loader touches before going
	// idle, which defeats the instant-swap goal.
	component: MyListsPage,
})

function MyListsPage() {
	useMeSSE()
	const [createOpen, setCreateOpen] = useState(false)
	const [addItemOpen, setAddItemOpen] = useState(false)
	const [searchOpen, setSearchOpen] = useState(false)
	const [pendingUrl, setPendingUrl] = useState<string | undefined>(undefined)
	const hash = useLocation({ select: l => l.hash })
	const search = Route.useSearch()
	const navigate = useNavigate()

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
		} else if (hash === 'search') {
			setSearchOpen(true)
			navigate({ to: '/me', hash: '', replace: true })
		}
	}, [hash, search.url, navigate])

	return (
		<>
			<CreateListDialog open={createOpen} onOpenChange={setCreateOpen} />
			<ItemSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
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
					{/* HEADING - renders synchronously so the route swap is instant. */}
					<PageHeading title={m.page_my_lists()} icon={ListOrdered} color="red">
						<div className="flex flex-row flex-wrap justify-end gap-1 items-center shrink-0">
							<Button size="sm" variant="outline" onClick={() => setSearchOpen(true)}>
								<Search className="size-4" /> {m.lists_my_search_items()}
							</Button>
							<Button size="sm" onClick={() => setCreateOpen(true)}>
								<Plus className="size-4" /> {m.lists_my_new_list()}
							</Button>
						</div>
					</PageHeading>
					<div className="text-sm text-muted-foreground">
						<RichMessage parts={m.lists_my_primary_hint.parts()} tags={{ strong: children => <strong>{children}</strong> }} />
					</div>
					<ListTypeLegend />
					<SkeletonSuspense id="my-lists" label={m.lists_loading_label()} skeleton={<MyListsPageBodySkeleton />}>
						<MyListsPageBody />
					</SkeletonSuspense>
				</div>
			</div>
		</>
	)
}

function MyListsPageBody() {
	const { data } = useSuspenseQuery(myListsQueryOptions)
	return <MyListsView data={data} nudge={<PrimaryListNudge />} />
}

// The page body without its query, so the loading skeleton can render the
// real sections from sample data.
function MyListsView({ data, nudge }: { data: MyListsResult; nudge?: ReactNode }) {
	const editableGiftIdeas = data.editable.filter(l => l.type === 'giftideas')
	const editableOther = data.editable.filter(l => l.type !== 'giftideas')

	// Its own gap-6 column: skullet wraps this body in block-level elements,
	// so it can't lean on the page column's gap.
	return (
		<div className="flex flex-col gap-6">
			{nudge}

			{/* PUBLIC LISTS */}
			<ListSection title={m.lists_my_public_title()} description={m.lists_my_public_description()} lists={data.public} />

			{/* PRIVATE LISTS */}
			<ListSection title={m.lists_my_private_title()} description={m.lists_my_private_description()} lists={data.private} />

			{/* GIFT IDEAS LISTS */}
			<ListsCard>
				<ListsCardHeader className="flex-col items-start gap-1">
					<ListsCardTitle>{m.lists_my_gift_ideas_title()}</ListsCardTitle>
					<ListsCardDescription className="italic">{m.lists_my_gift_ideas_description()}</ListsCardDescription>
				</ListsCardHeader>
				<ListsCardLists>
					{data.giftIdeas.length === 0 && editableGiftIdeas.length === 0 ? (
						<div className="text-sm text-muted-foreground py-3 px-3 border border-dashed rounded-lg bg-accent/30 italic">
							{m.lists_my_empty()}
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
									showOwner={
										list.subjectDependentId && list.subjectDependentName
											? { kind: 'dependent', name: list.subjectDependentName, image: list.subjectDependentImage }
											: { name: list.ownerName, email: list.ownerEmail, image: list.ownerImage }
									}
								/>
							))}
						</>
					)}
				</ListsCardLists>
			</ListsCard>

			{/* CHILDREN'S LISTS */}
			{data.children.length > 0 && (
				<ListsCard>
					<ListsCardHeader className="flex-col items-start gap-1">
						<ListsCardTitle className="flex items-center gap-2">
							<Baby className="size-5 inline" />
							{m.lists_my_children_title()}
						</ListsCardTitle>
						<ListsCardDescription className="italic">{m.lists_my_children_description()}</ListsCardDescription>
					</ListsCardHeader>
					<ListsCardLists className="gap-3">
						{data.children.map(child => (
							<ChildListSection key={child.childId} child={child} />
						))}
					</ListsCardLists>
				</ListsCard>
			)}

			{/* DEPENDENTS' LISTS */}
			{data.dependents.length > 0 && (
				<ListsCard>
					<ListsCardHeader className="flex-col items-start gap-1">
						<ListsCardTitle className="flex items-center gap-2">
							<Sprout className="size-5 inline" />
							{m.lists_my_dependents_title()}
						</ListsCardTitle>
						<ListsCardDescription className="italic">{m.lists_my_dependents_description()}</ListsCardDescription>
					</ListsCardHeader>
					<ListsCardLists className="gap-3">
						{data.dependents.map(dep => (
							<DependentListSection key={dep.dependentId} dependent={dep} />
						))}
					</ListsCardLists>
				</ListsCard>
			)}

			{/* EDITABLE LISTS */}
			{editableOther.length > 0 && (
				<ListsCard>
					<ListsCardHeader className="flex-col items-start gap-1">
						<ListsCardTitle>{m.lists_my_editable_title()}</ListsCardTitle>
						<ListsCardDescription className="italic">{m.lists_my_editable_description()}</ListsCardDescription>
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
							/>
						))}
					</ListsCardLists>
				</ListsCard>
			)}
		</div>
	)
}

// Measured by skullet from the real sections rendered with sample data.
function MyListsPageBodySkeleton() {
	return <MyListsView data={SAMPLE_MY_LISTS} />
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
					<div className="text-sm text-muted-foreground py-3 px-3 border border-dashed rounded-lg bg-accent/30 italic">
						{m.lists_my_empty()}
					</div>
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
					<div className="text-sm text-muted-foreground py-3 px-3 border border-dashed rounded-lg bg-accent/30 italic">
						{m.lists_my_empty()}
					</div>
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
					<div className="text-sm text-muted-foreground py-3 px-3 border border-dashed rounded-lg bg-accent/30 italic">
						{m.lists_my_empty()}
					</div>
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
