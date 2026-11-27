import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router'
import { Group as GroupIcon, ListOrdered, Settings, Settings2, Shuffle, Tag } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Skeleton, SkeletonSuspense } from 'skullet/react'
import { toast } from 'sonner'

import { createItemGroup, deleteItemGroup, reorderGroupItems } from '@/api/groups'
import { getAddableEditors, getListEditors } from '@/api/list-editors'
import { getListForEditing, getListSummaries, type ItemForEditing, type ListForEditing, type ListSummary } from '@/api/lists'
import DependentAvatar from '@/components/common/dependent-avatar'
import ListTypeTile from '@/components/common/list-type-tile'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import UserAvatar from '@/components/common/user-avatar'
import { ArrangeByToggle, type Arrangement } from '@/components/items/arrange-by-toggle'
import { CategoriesDialog } from '@/components/items/categories-dialog'
import { CategoryFilterChips } from '@/components/items/category-filter-chips'
import { GroupBlock } from '@/components/items/group-block'
import { AddItemSplitButton } from '@/components/items/import/add-item-split-button'
import { InternalListLinksProvider } from '@/components/items/internal-list-links-context'
import { ItemEditRow } from '@/components/items/item-edit-row'
import { ItemFormDialog } from '@/components/items/item-form-dialog'
import { ListCategoriesProvider } from '@/components/items/list-categories-context'
import { MoveItemDialog } from '@/components/items/move-item-dialog'
import { AddBirthdayBanner } from '@/components/lists/add-birthday-banner'
import { ArchiveManagerBadge } from '@/components/lists/archive-manager-badge'
import BackToParentList from '@/components/lists/back-to-parent-list'
import { SAMPLE_ITEMS, SAMPLE_LIST_HEADING } from '@/components/lists/list-detail-sample'
import { ListSettingsSheet } from '@/components/lists/list-settings-sheet'
import { PendingPage } from '@/components/skeletons/pending-page'
import { TodoList } from '@/components/todos/todo-list'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { GroupType } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'
import { type CategoryKey, categoryKeyOfEntry, type CategorySummary, countEntriesByCategory } from '@/lib/item-categories'
import { buildListEntries, type ListEntry } from '@/lib/list-entries'
import { itemsKeys, listItemsEditQueryOptions } from '@/lib/queries/items'
import { parseInternalListLink } from '@/lib/urls'
import { useListAutoRefresh } from '@/lib/use-list-auto-refresh'
import { useListSSE } from '@/lib/use-list-sse'
import { useScrollToHash } from '@/lib/use-scroll-to-hash'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

type EditSearch = { from?: number; settings?: boolean; edit?: number }

export const Route = createFileRoute('/(core)/lists_/$listId/edit')({
	validateSearch: (search: Record<string, unknown>): EditSearch => {
		const result: EditSearch = {}
		const rawFrom = search.from
		const num = typeof rawFrom === 'number' ? rawFrom : typeof rawFrom === 'string' ? Number(rawFrom) : NaN
		if (Number.isFinite(num) && num > 0) result.from = num
		const rawSettings = search.settings
		if (rawSettings === true || rawSettings === 'true' || rawSettings === 1 || rawSettings === '1') result.settings = true
		const rawEdit = search.edit
		const editNum = typeof rawEdit === 'number' ? rawEdit : typeof rawEdit === 'string' ? Number(rawEdit) : NaN
		if (Number.isFinite(editNum) && editNum > 0) result.edit = editNum
		return result
	},
	loader: async ({ params, context }) => {
		const listId = Number(params.listId)
		if (!Number.isFinite(listId)) throw notFound()

		void context.queryClient.prefetchQuery(listItemsEditQueryOptions(listId))

		const [listResult, editors, addableUsers] = await Promise.all([
			getListForEditing({ data: { listId: params.listId } }),
			getListEditors({ data: { listId } }),
			getAddableEditors({ data: { listId } }),
		])

		if (listResult.kind === 'error') throw notFound()

		return { list: listResult.list, editors, addableUsers }
	},
	head: pageHead<{ list: { name: string } }>(d => d?.list.name ?? m.lists_edit_page_title_fallback()),
	component: ListEditPage,
	pendingComponent: ListEditPagePending,
})

// Shown instead of the app-wide spinner while the loader resolves the list.
function ListEditPagePending() {
	return (
		<PendingPage>
			<Skeleton loading label={m.lists_detail_loading()}>
				<ListEditSkeleton />
			</Skeleton>
		</PendingPage>
	)
}

function ListEditPage() {
	const { list, editors, addableUsers } = Route.useLoaderData()
	const { from, settings } = Route.useSearch()
	const router = useRouter()
	const navigate = Route.useNavigate()
	const queryClient = useQueryClient()
	useListSSE(list.id, 'edit')
	useListAutoRefresh(list.id)
	const [addItemOpen, setAddItemOpen] = useState(false)
	const [addItemGroupId, setAddItemGroupId] = useState<number | null>(null)
	const [addItemPhotoFile, setAddItemPhotoFile] = useState<File | null>(null)
	const [moveItem, setMoveItem] = useState<Item | null>(null)
	useScrollToHash([list.id])

	// Categories (docs/logic.md "Item categories"). The arrangement and the
	// filter are view state, like the gifter view's filters: not saved.
	const [categoriesOpen, setCategoriesOpen] = useState(false)
	const [arrangement, setArrangement] = useState<Arrangement>('priority')
	const [categoryFilter, setCategoryFilter] = useState<ReadonlySet<CategoryKey>>(() => new Set())
	const toggleCategoryFilter = useCallback((key: CategoryKey) => {
		setCategoryFilter(prev => {
			const next = new Set(prev)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})
	}, [])
	const clearCategoryFilter = useCallback(() => setCategoryFilter(new Set()), [])
	const openCategories = useCallback(() => setCategoriesOpen(true), [])
	const categoriesValue = useMemo(
		() => ({ listId: list.id, categories: list.categories, onManage: openCategories }),
		[list.id, list.categories, openCategories]
	)
	// Same query the items body suspends on; read here without suspending so
	// the toolbar and the dialog can count rows per category.
	const { data: loadedItems } = useQuery(listItemsEditQueryOptions(list.id))
	const categoryCounts = useMemo(() => {
		const known = new Set(list.categories.map(c => c.id))
		return countEntriesByCategory(buildListEntries({ items: loadedItems ?? [], groups: list.groups }), known)
	}, [loadedItems, list.groups, list.categories])
	const itemCountsByCategory = useMemo(() => {
		const map = new Map<number, number>()
		for (const [key, n] of categoryCounts) if (key !== 'none') map.set(key, n)
		return map
	}, [categoryCounts])
	// Arrange By appears only once something on the list has a category.
	const hasCategorized = itemCountsByCategory.size > 0

	const initialSettingsOpen = useRef(settings === true).current
	useEffect(() => {
		if (settings) {
			void navigate({ search: (prev: EditSearch) => ({ ...prev, settings: undefined }), replace: true })
		}
	}, [settings, navigate])

	const refreshAfterGroupChange = () =>
		Promise.all([router.invalidate(), queryClient.invalidateQueries({ queryKey: itemsKeys.byList(list.id) })])

	const scrollToGroup = (groupId: number) => {
		let attempts = 0
		const tryScroll = () => {
			const el = document.getElementById(`group-${groupId}`)
			if (el) {
				const rect = el.getBoundingClientRect()
				const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight
				if (!isVisible) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
				return
			}
			if (attempts++ < 20) setTimeout(tryScroll, 50)
		}
		tryScroll()
	}

	const handleCreateGroup = async (type: GroupType) => {
		const result = await createItemGroup({ data: { listId: list.id, type } })
		if (result.kind === 'ok') {
			toast.success(type === 'or' ? m.lists_edit_group_created_or() : m.lists_edit_group_created_order())
			await refreshAfterGroupChange()
			scrollToGroup(result.group.id)
		} else {
			toast.error(m.lists_edit_group_create_failed())
		}
	}

	const handleDeleteGroup = async (groupId: number) => {
		const result = await deleteItemGroup({ data: { groupId } })
		if (result.kind === 'ok') {
			toast.success(m.lists_edit_group_removed())
			await refreshAfterGroupChange()
		}
	}

	const handleReorder = async (groupId: number, orderedItems: Array<Item>, fromIndex: number, direction: -1 | 1) => {
		const toIndex = fromIndex + direction
		if (toIndex < 0 || toIndex >= orderedItems.length) return
		const next = orderedItems.slice()
		;[next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]]
		const result = await reorderGroupItems({ data: { groupId, itemIds: next.map(i => i.id) } })
		if (result.kind === 'ok') {
			await refreshAfterGroupChange()
		} else {
			toast.error(m.lists_edit_reorder_failed())
		}
	}

	const openAddItemDialog = (groupId: number | null) => {
		setAddItemGroupId(groupId)
		setAddItemOpen(true)
	}

	const openAddItemFromPhoto = (file: File) => {
		setAddItemGroupId(null)
		setAddItemPhotoFile(file)
		setAddItemOpen(true)
	}

	// Held in a variable so the provider can wrap it without re-indenting the page.
	const page = (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				<EditListHeading
					list={list}
					back={<BackToParentList from={from} />}
					settings={
						<ListSettingsSheet
							listId={list.id}
							name={list.name}
							type={list.type}
							isPrivate={list.isPrivate}
							description={list.description}
							giftIdeasTargetUserId={list.giftIdeasTargetUserId}
							subjectDependentId={list.subjectDependentId}
							customHolidayId={list.customHolidayId}
							editors={editors}
							addableUsers={addableUsers}
							isOwner={list.isOwner}
							archiveApplies={list.archiveInfo.applies}
							lastArchivedAt={list.archiveInfo.lastArchivedAt}
							defaultOpen={initialSettingsOpen}
						/>
					}
				/>
				{list.description && <MarkdownNotes content={list.description} className="text-muted-foreground" />}
				{list.isOwner && list.archiveInfo.notApplicableReason === 'owner-no-birthday' && <AddBirthdayBanner />}
				{list.archiveInfo.notApplicableReason === 'dependent-no-birthday' && list.subjectDependent && (
					<AddBirthdayBanner dependentName={list.subjectDependent.name} />
				)}

				{list.type === 'todos' ? (
					// Reaching this route requires canEditList; any caller here
					// is either the owner or an editor with explicit grant, so
					// canEdit is unconditionally true.
					<TodoList listId={list.id} canEdit />
				) : (
					<div className="flex flex-col gap-2">
						<EditListToolbar
							listId={list.id}
							leading={
								<ArchiveManagerBadge
									listId={list.id}
									archiveInfo={list.archiveInfo}
									recipientName={list.subjectDependent ? list.subjectDependent.name : list.owner.name || list.owner.email}
								/>
							}
							arrange={hasCategorized ? <ArrangeByToggle value={arrangement} onChange={setArrangement} /> : null}
							onManageCategories={openCategories}
							onCreateGroup={handleCreateGroup}
							onAddItem={() => openAddItemDialog(null)}
							onAddItemFromPhoto={openAddItemFromPhoto}
						/>
						<SkeletonSuspense id={`list-edit-items-${list.id}`} label={m.lists_items_loading()} skeleton={<EditItemsSkeleton />}>
							<EditItemsBody
								list={list}
								arrangement={arrangement}
								categoryFilter={categoryFilter}
								onToggleCategory={toggleCategoryFilter}
								onClearCategoryFilter={clearCategoryFilter}
								onMoveItem={setMoveItem}
								onAddItem={openAddItemDialog}
								onDeleteGroup={handleDeleteGroup}
								onReorder={handleReorder}
							/>
						</SkeletonSuspense>
					</div>
				)}
			</div>

			{list.type !== 'todos' && (
				<ItemFormDialog
					open={addItemOpen}
					onOpenChange={open => {
						setAddItemOpen(open)
						if (!open) {
							setAddItemGroupId(null)
							setAddItemPhotoFile(null)
						}
					}}
					mode="create"
					listId={list.id}
					groupId={addItemGroupId}
					initialPhotoFile={addItemPhotoFile}
				/>
			)}

			{moveItem && (
				<MoveItemDialog
					open={!!moveItem}
					onOpenChange={open => {
						if (!open) setMoveItem(null)
					}}
					item={moveItem}
				/>
			)}

			{list.type !== 'todos' && (
				<CategoriesDialog
					open={categoriesOpen}
					onOpenChange={setCategoriesOpen}
					listId={list.id}
					categories={list.categories}
					itemCounts={itemCountsByCategory}
				/>
			)}
		</div>
	)

	return <ListCategoriesProvider value={categoriesValue}>{page}</ListCategoriesProvider>
}

type EditListHeadingProps = {
	list: Pick<ListForEditing, 'name' | 'type' | 'isOwner' | 'owner' | 'subjectDependent'>
	back?: ReactNode
	settings: ReactNode
}

function EditListHeading({ list, back, settings }: EditListHeadingProps) {
	return (
		<div className="flex flex-col gap-1">
			{back}
			<div className="flex items-center gap-1 xs:gap-3 min-w-0">
				{list.subjectDependent ? (
					<DependentAvatar
						name={list.subjectDependent.name}
						image={list.subjectDependent.image}
						size="large"
						className="border-2 border-background"
					/>
				) : !list.isOwner ? (
					<UserAvatar
						name={list.owner.name || list.owner.email}
						image={list.owner.image}
						size="large"
						className="border-2 border-background"
					/>
				) : null}
				<ListTypeTile type={list.type} />
				<h1 className="truncate flex-1">{list.name}</h1>
				{settings}
			</div>
		</div>
	)
}

type EditListToolbarProps = {
	listId: number
	leading: ReactNode
	// The Arrange By switch, or null while nothing on the list has a category.
	arrange?: ReactNode
	onManageCategories: () => void
	onCreateGroup: (type: GroupType) => void
	onAddItem: () => void
	onAddItemFromPhoto: (file: File) => void
}

function EditListToolbar({
	listId,
	leading,
	arrange,
	onManageCategories,
	onCreateGroup,
	onAddItem,
	onAddItemFromPhoto,
}: EditListToolbarProps) {
	return (
		<div className="flex flex-wrap items-center justify-end gap-2">
			{arrange && <div className="mr-auto">{arrange}</div>}
			{leading}
			<div className="flex gap-2">
				<Button size="sm" variant="outline" asChild>
					<Link to="/lists/$listId/organize" params={{ listId: String(listId) }}>
						<Settings2 className="size-4" />
						<span className="sr-only xs:not-sr-only">{m.lists_edit_organize()}</span>
					</Link>
				</Button>
				<Button size="sm" variant="outline" onClick={onManageCategories}>
					<Tag className="size-4" />
					<span className="sr-only xs:not-sr-only">{m.items_categories_button()}</span>
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="sm" variant="outline">
							<GroupIcon className="size-4" /> <span className="xs:hidden">{m.lists_edit_group_short()}</span>
							<span className="hidden xs:inline">{m.lists_edit_new_group()}</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={() => onCreateGroup('or')}>
							<Shuffle className="size-4" /> {m.lists_edit_group_pick_one()}
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => onCreateGroup('order')}>
							<ListOrdered className="size-4" /> {m.lists_edit_group_in_order()}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<AddItemSplitButton listId={listId} onAddItem={onAddItem} onAddItemFromPhoto={onAddItemFromPhoto} />
			</div>
		</div>
	)
}

const noop = () => {}
const noopAsync = async () => {}

// Measured by skullet from the real heading, toolbar and rows rendered with
// sample data, as the owner sees them. Used while the loader runs and while
// the items load, so both waits read as one skeleton.
function ListEditSkeleton() {
	return (
		<div className="flex flex-col gap-6">
			<EditListHeading
				list={{ ...SAMPLE_LIST_HEADING, isOwner: true }}
				settings={
					<Button variant="outline" size="icon" tabIndex={-1}>
						<Settings className="size-4" />
					</Button>
				}
			/>
			<div className="flex flex-col gap-2">
				<EditListToolbar
					listId={0}
					leading={null}
					onManageCategories={noop}
					onCreateGroup={noop}
					onAddItem={noop}
					onAddItemFromPhoto={noop}
				/>
				<EditItemsSkeleton />
			</div>
		</div>
	)
}

function EditItemsSkeleton() {
	return (
		<EditItemsView
			list={{ id: 0, groups: [] }}
			items={SAMPLE_ITEMS}
			onMoveItem={noop}
			onAddItem={noop}
			onDeleteGroup={noopAsync}
			onReorder={noopAsync}
		/>
	)
}

type EditItemsBodyProps = {
	list: ListForEditing
	arrangement?: Arrangement
	categoryFilter?: ReadonlySet<CategoryKey>
	onToggleCategory?: (key: CategoryKey) => void
	onClearCategoryFilter?: () => void
	onMoveItem: (item: Item) => void
	onAddItem: (groupId: number | null) => void
	onDeleteGroup: (groupId: number) => Promise<void>
	onReorder: (groupId: number, items: Array<Item>, fromIndex: number, direction: -1 | 1) => Promise<void>
}

function EditItemsBody(props: EditItemsBodyProps) {
	const { data: items } = useSuspenseQuery(listItemsEditQueryOptions(props.list.id))
	return <EditItemsView {...props} items={items} />
}

type EditItemsViewProps = Omit<EditItemsBodyProps, 'list'> & {
	list: Pick<ListForEditing, 'id' | 'groups'> & { categories?: ReadonlyArray<CategorySummary> }
	items: Array<ItemForEditing>
}

// The items body without its query, so the loading skeleton can render the
// real rows from sample items (see list-detail-sample.ts).
const NO_CATEGORIES: ReadonlyArray<CategorySummary> = []
const NO_FILTER: ReadonlySet<CategoryKey> = new Set()

function EditItemsView({
	list,
	items,
	arrangement = 'priority',
	categoryFilter = NO_FILTER,
	onToggleCategory = noop,
	onClearCategoryFilter = noop,
	onMoveItem,
	onAddItem,
	onDeleteGroup,
	onReorder,
}: EditItemsViewProps) {
	const entries = buildListEntries({ items, groups: list.groups })
	const categories = list.categories ?? NO_CATEGORIES
	const knownCategoryIds = useMemo(() => new Set(categories.map(c => c.id)), [categories])
	const categoryCounts = countEntriesByCategory(entries, knownCategoryIds)
	// A chip whose category was deleted, or emptied, stops filtering.
	const activeFilter = [...categoryFilter].filter(key => (categoryCounts.get(key) ?? 0) > 0)
	const shownEntries =
		activeFilter.length > 0 ? entries.filter(e => activeFilter.includes(categoryKeyOfEntry(e, knownCategoryIds))) : entries
	const hasCategorized = [...categoryCounts.keys()].some(key => key !== 'none')

	const internalListIds = useMemo(() => {
		if (typeof window === 'undefined') return [] as Array<number>
		const origin = window.location.origin
		const set = new Set<number>()
		for (const i of items) {
			const hit = parseInternalListLink(i.url, origin)
			if (hit) set.add(hit.listId)
		}
		return [...set].sort((a, b) => a - b)
	}, [items])

	const { data: summaryData } = useQuery({
		queryKey: ['list-summaries', internalListIds],
		queryFn: () => getListSummaries({ data: { listIds: internalListIds } }),
		enabled: internalListIds.length > 0,
		staleTime: 60_000,
	})

	const internalListLinks = useMemo(() => {
		const map = new Map<number, ListSummary>()
		for (const s of summaryData?.summaries ?? []) map.set(s.id, s)
		return map
	}, [summaryData])

	const renderEntry = (entry: ListEntry<ItemForEditing>) =>
		entry.kind === 'item' ? (
			<ItemEditRow
				key={`item-${entry.item.id}`}
				item={entry.item}
				commentCount={entry.item.commentCount}
				onMoveClick={onMoveItem}
				groups={list.groups}
			/>
		) : (
			<GroupBlock
				key={`group-${entry.group.id}`}
				group={entry.group}
				items={entry.items}
				groups={list.groups}
				listId={list.id}
				onAddItem={onAddItem}
				onDelete={onDeleteGroup}
				onMoveItem={onMoveItem}
				onReorder={onReorder}
			/>
		)

	if (items.length === 0 && list.groups.length === 0) {
		return (
			<div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg bg-accent/30">
				{m.lists_edit_empty()}
			</div>
		)
	}

	return (
		<InternalListLinksProvider value={internalListLinks}>
			<div className="flex flex-col gap-2 xs:pl-6">
				{categories.length > 0 && (
					<CategoryFilterChips
						categories={categories}
						counts={categoryCounts}
						total={entries.length}
						selected={new Set(activeFilter)}
						onToggle={onToggleCategory}
						onClear={onClearCategoryFilter}
					/>
				)}
				{shownEntries.length === 0 ? (
					<div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg bg-accent/30">
						{m.items_category_filter_empty()}
					</div>
				) : arrangement === 'category' && hasCategorized ? (
					// One section per category that has rows, in the owner's order, then
					// the rows with no category. Headers show how many rows, never claims.
					[
						...categories.map(c => ({ key: c.id as CategoryKey, name: c.name })),
						{ key: 'none' as CategoryKey, name: m.items_category_none() },
					].map(section => {
						const rows = shownEntries.filter(e => categoryKeyOfEntry(e, knownCategoryIds) === section.key)
						if (rows.length === 0) return null
						return (
							<section key={`category-${section.key}`} className="flex flex-col gap-2 not-first:mt-3">
								<div className="flex items-baseline gap-2 border-b pb-1.5">
									<div role="heading" aria-level={2} className="truncate font-bold leading-tight">
										{section.name}
									</div>
									<span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">{rows.length}</span>
								</div>
								{rows.map(renderEntry)}
							</section>
						)
					})
				) : (
					shownEntries.map(renderEntry)
				)}
			</div>
		</InternalListLinksProvider>
	)
}
