// Server-fn surface for the edit-list dialog's calendar-proximity
// warnings. Implementation lives in `_list-change-impact-impl.ts` so
// the static import chain (db, intelligence helpers, settings) only
// loads on the server. Mirrors the api/lists.ts <-> _lists-impl.ts
// split.

import { createServerFn } from '@tanstack/react-start'

import type { InWindowEvent } from '@/lib/intelligence/upcoming-events-types'
import type { ListChangeImpactList } from '@/lib/list-change-impact'
import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

export type GetListChangeImpactInputsResult = {
	inWindowEvents: Array<InWindowEvent>
	// Sibling subject lists (excluding the one being edited). The dialog
	// passes both arrays into `evaluateListChangeImpact` along with the
	// list-being-edited's pre- and post-state.
	otherSubjectLists: Array<ListChangeImpactList>
}

export const getListChangeImpactInputs = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: { listId: number }) => ({ listId: data.listId }))
	.handler(async ({ context, data }): Promise<GetListChangeImpactInputsResult> => {
		const { getListChangeImpactInputsImpl } = await import('@/api/_list-change-impact-impl')
		return await getListChangeImpactInputsImpl({ userId: context.session.user.id, listId: data.listId })
	})
