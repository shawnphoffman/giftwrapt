import { createContext, useContext } from 'react'

import type { CategorySummary } from '@/lib/item-categories'

// The categories of the list being edited, for the rows, group blocks and
// the item form under it. The default (no categories) is what every surface
// outside the list edit view gets, so category controls simply don't render
// there.
export type ListCategoriesValue = {
	listId: number
	categories: ReadonlyArray<CategorySummary>
	// Opens the Categories dialog.
	onManage: () => void
}

const EMPTY: ListCategoriesValue = { listId: 0, categories: [], onManage: () => {} }

const ListCategoriesContext = createContext<ListCategoriesValue>(EMPTY)

export const ListCategoriesProvider = ListCategoriesContext.Provider

export function useListCategories(): ListCategoriesValue {
	return useContext(ListCategoriesContext)
}
