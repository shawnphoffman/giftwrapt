import { createContext, type ReactNode, useContext } from 'react'

import type { ListSummary } from '@/api/lists'

type SummariesMap = ReadonlyMap<number, ListSummary>

const EMPTY: SummariesMap = new Map()

const InternalListLinksContext = createContext<SummariesMap>(EMPTY)

export function InternalListLinksProvider({ value, children }: { value: SummariesMap; children: ReactNode }) {
	return <InternalListLinksContext.Provider value={value}>{children}</InternalListLinksContext.Provider>
}

export function useInternalListLinks(): SummariesMap {
	return useContext(InternalListLinksContext)
}
