import type { UserWithLists } from '@/db-collections/lists'

// Stand-in data for the All Lists feed's loading skeleton. Skullet renders
// the real person cards from this, invisibly, and draws a bar over each line
// it measures, so the shape should look like a typical feed. Nothing here is
// ever shown or sent anywhere.

const EPOCH = new Date(0).toISOString()

function sampleList(id: number, name: string, itemsTotal: number) {
	return {
		id: -id,
		name,
		type: 'wishlist' as const,
		description: null,
		isPrimary: false,
		createdAt: EPOCH,
		updatedAt: EPOCH,
		itemsTotal,
		itemsRemaining: itemsTotal,
		holidayDate: null,
	}
}

function samplePerson(id: number, name: string, lists: UserWithLists['lists']): UserWithLists {
	return {
		id: `sample-${id}`,
		name,
		email: 'sample@example.com',
		image: null,
		birthMonth: null,
		birthDay: null,
		partnerId: null,
		lastGiftedAt: null,
		lists,
	}
}

export const SAMPLE_FEED: Array<UserWithLists> = [
	samplePerson(1, 'Sample Person', [sampleList(1, 'Birthday wishlist', 8), sampleList(2, 'Christmas list', 5)]),
	samplePerson(2, 'Another Person', [sampleList(3, 'Wishlist', 12)]),
	samplePerson(3, 'Third Person', [sampleList(4, 'Wishlist', 6)]),
]
