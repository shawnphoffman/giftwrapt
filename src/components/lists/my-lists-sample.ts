import type { MyListRow, MyListsResult } from '@/api/lists'

// Stand-in data for the My Lists loading skeleton. Skullet renders the real
// sections from this, invisibly, and draws a bar over each line it measures,
// so the shape should look like a typical account. Nothing here is ever
// shown or sent anywhere.

function sampleRow(id: number, name: string, overrides: Partial<MyListRow> = {}): MyListRow {
	return {
		id: -id,
		name,
		type: 'wishlist',
		isActive: true,
		isPrivate: false,
		isPrimary: false,
		description: null,
		giftIdeasTargetUserId: null,
		giftIdeasTarget: null,
		giftIdeasTargetDependentId: null,
		giftIdeasTargetDependent: null,
		subjectDependentId: null,
		itemCount: 6,
		editors: [],
		...overrides,
	}
}

export const SAMPLE_MY_LISTS: MyListsResult = {
	public: [sampleRow(1, 'Birthday wishlist', { isPrimary: true }), sampleRow(2, 'Christmas list', { type: 'christmas' })],
	private: [sampleRow(3, 'Personal shopping', { isPrivate: true })],
	giftIdeas: [sampleRow(4, 'Ideas for someone', { type: 'giftideas', isPrivate: true })],
	editable: [],
	children: [],
	dependents: [],
}
