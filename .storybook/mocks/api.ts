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
const ok = async (): Promise<OkResult> => ({ kind: 'ok' })
const emptyArray = async (): Promise<Array<unknown>> => []

// @/api/items
export const createItem = ok
export const updateItem = ok
export const deleteItem = ok
export const archiveItem = ok
export const moveItemToList = ok
export const archiveItems = async (): Promise<{ kind: 'ok'; updated: number }> => ({ kind: 'ok', updated: 0 })
export const deleteItems = async (): Promise<{ kind: 'ok'; deleted: number }> => ({ kind: 'ok', deleted: 0 })
export const setItemsPriority = async (): Promise<{ kind: 'ok'; updated: number }> => ({ kind: 'ok', updated: 0 })
export const reorderItems = async (): Promise<{ kind: 'ok'; updated: number }> => ({ kind: 'ok', updated: 0 })
export const reorderListEntries = async (): Promise<{ kind: 'ok'; updatedItems: number; updatedGroups: number }> => ({
	kind: 'ok',
	updatedItems: 0,
	updatedGroups: 0,
})
export const setGroupsPriority = async (): Promise<{ kind: 'ok'; updated: number }> => ({ kind: 'ok', updated: 0 })
export const deleteGroups = async (): Promise<{ kind: 'ok'; deletedGroups: number; deletedItems: number }> => ({
	kind: 'ok',
	deletedGroups: 0,
	deletedItems: 0,
})
export const moveItemsToList = async (): Promise<{ kind: 'ok'; moved: number; claimsCleared: number; commentsDeleted: number }> => ({
	kind: 'ok',
	moved: 0,
	claimsCleared: 0,
	commentsDeleted: 0,
})

// @/api/groups
export const createItemGroup = ok
export const updateItemGroup = ok
export const deleteItemGroup = ok
export const assignItemsToGroup = ok
export const reorderGroupItems = ok
export const getGroupsForList = emptyArray

// @/api/gifts
export const getGiftsForItems = emptyArray
export const claimItemGift = ok
export const updateItemGift = ok
export const unclaimItemGift = ok
export const updateCoGifters = ok

// @/api/comments
export const getCommentsForItem = emptyArray
export const createItemComment = ok
export const updateItemComment = ok
export const deleteItemComment = ok
export const getRecentComments = emptyArray

// @/api/user
export const getPotentialPartners = emptyArray
export const updateUserProfile = ok
export const updateUserPassword = ok

// @/api/lists
export const getListForViewing = async () => ({ kind: 'ok', list: null })
export const getMyLists = async () => ({ lists: [], childGroups: [] })
export const createList = ok
export const updateList = ok
export const deleteList = ok
export const setPrimaryList = ok
export const getListForEditing = async () => ({ kind: 'ok', list: null })

// @/api/purchases
export const getPurchaseSummary = async (): Promise<Array<unknown>> => []

// @/api/list-addons
export const createListAddon = ok
export const updateListAddon = ok
export const archiveListAddon = ok
export const deleteListAddon = ok
