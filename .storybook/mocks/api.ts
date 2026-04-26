/**
 * Aliased in place of `@/api/*` for Storybook.
 *
 * The real API modules use `createServerFn` from @tanstack/react-start and
 * import server-only code (`@/db`, auth middleware, etc.). Pulling those into
 * the browser bundle means Storybook would try to load Drizzle + Postgres at
 * render time. Instead, we replace every API module with this stub so the
 * components can import names without dragging in the server.
 *
 * Only names that are actually imported at module-evaluation time need to
 * exist here. The stubs no-op; stories should not trigger server actions.
 */

type OkResult = { kind: 'ok' }
const ok = (): Promise<OkResult> => Promise.resolve({ kind: 'ok' })
const emptyArray = (): Promise<Array<unknown>> => Promise.resolve([])

// @/api/items
export const createItem = ok
export const updateItem = ok
export const deleteItem = ok
export const archiveItem = ok
export const moveItemToList = ok
export const archiveItems = (): Promise<{ kind: 'ok'; updated: number }> => Promise.resolve({ kind: 'ok', updated: 0 })
export const deleteItems = (): Promise<{ kind: 'ok'; deleted: number }> => Promise.resolve({ kind: 'ok', deleted: 0 })
export const setItemsPriority = (): Promise<{ kind: 'ok'; updated: number }> => Promise.resolve({ kind: 'ok', updated: 0 })
export const reorderItems = (): Promise<{ kind: 'ok'; updated: number }> => Promise.resolve({ kind: 'ok', updated: 0 })
export const reorderListEntries = (): Promise<{ kind: 'ok'; updatedItems: number; updatedGroups: number }> =>
	Promise.resolve({ kind: 'ok', updatedItems: 0, updatedGroups: 0 })
export const setGroupsPriority = (): Promise<{ kind: 'ok'; updated: number }> => Promise.resolve({ kind: 'ok', updated: 0 })
export const deleteGroups = (): Promise<{ kind: 'ok'; deletedGroups: number; deletedItems: number }> =>
	Promise.resolve({ kind: 'ok', deletedGroups: 0, deletedItems: 0 })
export const moveItemsToList = (): Promise<{ kind: 'ok'; moved: number; claimsCleared: number; commentsDeleted: number }> =>
	Promise.resolve({ kind: 'ok', moved: 0, claimsCleared: 0, commentsDeleted: 0 })

// @/api/groups
export const createItemGroup = ok
export const updateItemGroup = ok
export const deleteItemGroup = ok
export const assignItemsToGroup = ok
export const reorderGroupItems = ok
export const getGroupsForList = emptyArray
export const moveGroupToList = ok

// @/api/gifts
export const getGiftsForItems = emptyArray
export const claimItemGift = ok
export const updateItemGift = ok
export const unclaimItemGift = ok
export const updateCoGifters = ok

// @/api/comments
// Stories can seed comments per itemId via __setStorybookComments(itemId, [...]).
// getCommentsForItem reads from this registry; unknown ids return [].
type StorybookComment = {
	id: number
	itemId: number
	comment: string
	createdAt: Date
	updatedAt: Date
	user: { id: string; name: string | null; email: string; image: string | null }
}
const storybookCommentsByItem = new Map<number, Array<StorybookComment>>()
export function __setStorybookComments(itemId: number, comments: Array<StorybookComment>) {
	storybookCommentsByItem.set(itemId, comments)
}
export const getCommentsForItem = ({ data }: { data: { itemId: number } }): Promise<Array<StorybookComment>> =>
	Promise.resolve(storybookCommentsByItem.get(data.itemId) ?? [])
export const createItemComment = ok
export const updateItemComment = ok
export const deleteItemComment = ok
export const getRecentComments = emptyArray

// @/api/user
export const getPotentialPartners = emptyArray
export const updateUserProfile = ok
export const updateUserPassword = ok

// @/api/lists
export const getListForViewing = () => Promise.resolve({ kind: 'ok' as const, list: null })
export const getMyLists = () => Promise.resolve({ lists: [], childGroups: [] })
export const createList = ok
export const updateList = ok
export const deleteList = ok
export const setPrimaryList = ok
export const getListForEditing = () => Promise.resolve({ kind: 'ok' as const, list: null })

// @/api/purchases
export const getPurchaseSummary = (): Promise<Array<unknown>> => Promise.resolve([])

// @/api/list-addons
export const createListAddon = ok
export const updateListAddon = ok
export const archiveListAddon = ok
export const deleteListAddon = ok

// @/api/uploads
export const uploadItemImage = (): Promise<{ kind: 'ok'; value: { url: string } }> => Promise.resolve({ kind: 'ok', value: { url: '' } })
export const removeItemImage = ok
export const uploadAvatar = (): Promise<{ kind: 'ok'; value: { url: string } }> => Promise.resolve({ kind: 'ok', value: { url: '' } })
export const removeAvatar = ok

// @/api/storage-status
export const fetchStorageStatus = (): Promise<{ configured: boolean }> => Promise.resolve({ configured: true })
