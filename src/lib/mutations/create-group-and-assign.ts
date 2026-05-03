import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'

import { assignItemsToGroup, type CreateGroupResult, createItemGroup } from '@/api/groups'
import type { GroupType } from '@/db/schema/enums'
import { itemsKeys } from '@/lib/queries/items'

export type CreateGroupAndAssignInput = {
	listId: number
	itemIds: ReadonlyArray<number>
	type: GroupType
}

type AssignError = { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'mixed-lists' }
export type CreateGroupAndAssignResult = CreateGroupResult | AssignError

export function useCreateGroupAndAssignItems() {
	const queryClient = useQueryClient()
	const router = useRouter()

	return useMutation({
		mutationKey: ['updateItem'],
		mutationFn: async (input: CreateGroupAndAssignInput): Promise<CreateGroupAndAssignResult> => {
			const created = await createItemGroup({ data: { listId: input.listId, type: input.type } })
			if (created.kind === 'error') return created
			const assigned = await assignItemsToGroup({
				data: { itemIds: [...input.itemIds], groupId: created.group.id },
			})
			if (assigned.kind === 'error') return assigned
			return created
		},

		onSettled: async (_result, _err, input) => {
			await Promise.all([router.invalidate(), queryClient.invalidateQueries({ queryKey: itemsKeys.byList(input.listId) })])
		},
	})
}
