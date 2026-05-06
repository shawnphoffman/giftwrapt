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

import { DEFAULT_APP_SETTINGS } from '@/lib/settings'

type OkResult = { kind: 'ok' }
const ok = (): Promise<OkResult> => Promise.resolve({ kind: 'ok' })
const emptyArray = (): Promise<Array<unknown>> => Promise.resolve([])

// @/api/items
export const createItem = ok
export const updateItem = ok
export const deleteItem = ok
export const archiveItem = ok
export const setItemAvailability = ok
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
export const copyItemToList = ok
export const getItemsForListView = (): Promise<{ kind: 'ok'; items: Array<unknown> }> => Promise.resolve({ kind: 'ok', items: [] })
export const getItemsForListEdit = (): Promise<{ kind: 'ok'; items: Array<unknown> }> => Promise.resolve({ kind: 'ok', items: [] })
export const archiveListPurchases = (): Promise<{ kind: 'ok'; archived: number }> => Promise.resolve({ kind: 'ok', archived: 0 })

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
type StorybookGiftIdeasRecipient = { id: string; name: string | null; email: string; image: string | null }
let storybookGiftIdeasRecipients: Array<StorybookGiftIdeasRecipient> = []
export function __setStorybookGiftIdeasRecipients(recipients: Array<StorybookGiftIdeasRecipient>) {
	storybookGiftIdeasRecipients = recipients
}
export const getGiftIdeasRecipients = (): Promise<Array<StorybookGiftIdeasRecipient>> => Promise.resolve(storybookGiftIdeasRecipients)
export const updateUserProfile = ok
export const updateUserPassword = ok

// @/api/lists
export const getListForViewing = () => Promise.resolve({ kind: 'ok' as const, list: null })
export const getMyLists = () => Promise.resolve({ lists: [], childGroups: [] })
export const createList = (): Promise<{ kind: 'ok'; list: { id: number; name: string; type: string } }> =>
	Promise.resolve({ kind: 'ok', list: { id: 1, name: 'New list', type: 'wishlist' } })
export const updateList = ok
export const deleteList = ok
export const setPrimaryList = ok
export const getListForEditing = () => Promise.resolve({ kind: 'ok' as const, list: null })
export const getListSummaries = (): Promise<{ summaries: Array<unknown> }> => Promise.resolve({ summaries: [] })
export const getMyLastHolidayCountry = (): Promise<string | null> => Promise.resolve(null)

// @/api/purchases
export const getPurchaseSummary = (): Promise<{ items: Array<unknown>; partner: null }> => Promise.resolve({ items: [], partner: null })

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
export const uploadAvatarAsAdmin = (): Promise<{ kind: 'ok'; value: { url: string } }> =>
	Promise.resolve({ kind: 'ok', value: { url: '' } })
export const removeAvatarAsAdmin = ok

// @/api/storage-status
export const fetchStorageStatus = (): Promise<{ configured: boolean }> => Promise.resolve({ configured: true })

// @/api/admin-oidc
export const oidcAppTypeValues = ['web', 'native', 'public', 'user-agent-based'] as const
export type OidcAppType = (typeof oidcAppTypeValues)[number]
export type OidcApplicationRow = {
	id: string
	clientId: string
	clientSecret: string | null
	name: string
	type: OidcAppType
	icon: string | null
	redirectUrls: Array<string>
	disabled: boolean
	createdAt: Date
	updatedAt: Date
}
export const listOidcApplicationsAsAdmin = (): Promise<Array<OidcApplicationRow>> => Promise.resolve([])
export const createOidcApplicationAsAdmin = ok
export const updateOidcApplicationAsAdmin = ok
export const deleteOidcApplicationAsAdmin = ok
export const rotateOidcSecretAsAdmin = ok

// @/api/oidc
export const getOidcClientPublicInfo = (): Promise<{ kind: 'ok'; client: null }> => Promise.resolve({ kind: 'ok', client: null })
export const submitOidcConsent = ok

// @/api/admin
export const getUsersAsAdmin = emptyArray
export const getUserDetailsAsAdmin = (): Promise<null> => Promise.resolve(null)
export const getPermissionsMatrixAsAdmin = (): Promise<{
	users: []
	dependents: []
	guardianships: []
	relationships: []
	listEditorCounts: []
}> => Promise.resolve({ users: [], dependents: [], guardianships: [], relationships: [], listEditorCounts: [] })
export const updateUserAsAdmin = ok
export const banUserAsAdmin = ok
export const unbanUserAsAdmin = ok
export const sendVerifyEmailAsAdmin = ok
export const updateUserPartner = ok
export const createGuardianships = ok
export const removeGuardianshipsForChild = ok
export const sendTestEmailAsAdmin = ok

// @/api/dependents
export type DependentSummary = {
	id: string
	name: string
	image: string | null
	birthMonth: string | null
	birthDay: number | null
	birthYear: number | null
	isArchived: boolean
	createdAt: string
	updatedAt: string
	guardianIds: Array<string>
}
type StorybookDependent = {
	id: string
	name: string
	image: string | null
	birthMonth: string | null
	birthDay: number | null
	birthYear: number | null
	isArchived: boolean
	createdAt: string
	updatedAt: string
	guardianIds: Array<string>
}
let storybookDependents: Array<StorybookDependent> = []
export function __setStorybookDependents(dependents: Array<StorybookDependent>) {
	storybookDependents = dependents
}
export const getMyDependents = (): Promise<{ dependents: Array<StorybookDependent> }> =>
	Promise.resolve({ dependents: storybookDependents })
export const getAllDependents = (): Promise<{ dependents: Array<unknown> }> => Promise.resolve({ dependents: [] })
export const createDependent = ok
export const updateDependent = ok
export const deleteDependent = ok
export const addDependentGuardian = ok
export const removeDependentGuardian = ok

// @/api/settings
export const fetchAppSettings = (): Promise<typeof DEFAULT_APP_SETTINGS> => Promise.resolve(DEFAULT_APP_SETTINGS)
export const fetchAppSettingsAsAdmin = (): Promise<typeof DEFAULT_APP_SETTINGS> => Promise.resolve(DEFAULT_APP_SETTINGS)
export const updateAppSettings = ok

// @/api/list-editors
export const addListEditor = ok
export const removeListEditor = ok
export const getListEditors = emptyArray
export const getAddableEditors = emptyArray
export const getPartnerEditorAffectedLists = (): Promise<{ toAdd: Array<unknown>; toRemove: Array<unknown> }> =>
	Promise.resolve({ toAdd: [], toRemove: [] })
export const applyPartnerEditorChanges = ok

// @/api/relation-labels
export const addRelationLabel = ok
export const removeRelationLabel = ok
export const getMyRelationLabels = emptyArray

// @/api/permissions
export const upsertUserRelationships = ok
export const upsertViewerRelationships = ok
export const getUsersWithRelationships = emptyArray

// @/api/intelligence
export const applyRecommendation = ok
export const dismissRecommendation = ok
export const getMyRecommendations = emptyArray
export const requestRecommendationsRefresh = ok

// @/api/admin-intelligence
export const adminInvalidateInputHash = ok
export const adminPurgeRecsForUser = ok
export const adminRunForMe = ok
export const adminRunForUser = ok
export const getAdminIntelligenceData = (): Promise<null> => Promise.resolve(null)
export const getAdminUserRunSummaries = emptyArray

// @/api/admin-ai
export const testAiConnectionAsAdmin = ok

// @/api/admin-cron
export const getCronEndpointsSummaryAsAdmin = (): Promise<{ endpoints: Array<unknown> }> => Promise.resolve({ endpoints: [] })
export const runCronAsAdmin = ok
export const getCronRunsAsAdmin = emptyArray

// @/api/admin-email
export const testResendApiKeyAsAdmin = ok

// @/api/admin-oidc-client
export const fetchOidcClientConfigAsAdmin = (): Promise<null> => Promise.resolve(null)
export const updateOidcClientConfigAsAdmin = ok

// @/api/admin-scrapes
export const getScrapeDetailAsAdmin = (): Promise<null> => Promise.resolve(null)
export const listScrapesAsAdmin = emptyArray

// @/api/admin-storage
export const fetchStorageBrowser = (): Promise<{ objects: Array<unknown>; summary: null }> =>
	Promise.resolve({ objects: [], summary: null })
export const deleteStorageObjectAsAdmin = ok

// @/api/backup
export const exportAppDataAsAdmin = ok
export const importAppDataAsAdmin = ok

// @/api/recent
// (only types are imported, but keep this section as a marker)

// @/api/received
// (only types are imported, but keep this section as a marker)

// @/api/import
export type ItemDraft = {
	title?: string | null
	url?: string | null
	price?: string | null
	currency?: string | null
	imageUrl?: string | null
	notes?: string | null
	priority?: string
	quantity?: number
}
export const bulkCreateItems = (): Promise<{ kind: 'ok'; items: Array<unknown>; enqueued: number }> =>
	Promise.resolve({ kind: 'ok', items: [], enqueued: 0 })
export const fetchImportSource = (): Promise<{ kind: 'ok'; drafts: Array<ItemDraft> }> => Promise.resolve({ kind: 'ok', drafts: [] })
