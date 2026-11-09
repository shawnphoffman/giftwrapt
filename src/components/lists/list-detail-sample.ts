import type { ItemWithGifts, ListHeader } from '@/api/lists'

// Stand-in data for the list detail page's loading skeletons. Skullet
// renders the real components from this, invisibly, and draws a bar over
// each line it measures, so lengths here should look like a typical list.
// Nothing here is ever shown or sent anywhere.

// A blank square with an intrinsic size, so the image box takes the same
// space a real thumbnail does without a network request.
const SAMPLE_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'/%3E"

const EPOCH = new Date(0)

export const SAMPLE_LIST_HEADING: Pick<ListHeader, 'name' | 'type' | 'owner' | 'subjectDependent'> = {
	name: 'Birthday wishlist',
	type: 'wishlist',
	owner: { id: 'sample', name: 'Sample Person', email: 'sample@example.com', image: null },
	subjectDependent: null,
}

function sampleItem(id: number, title: string, price: string, withImage: boolean, notes: string | null = null): ItemWithGifts {
	return {
		id: -id,
		listId: 0,
		groupId: null,
		title,
		status: 'incomplete',
		availability: 'available',
		availabilityChangedAt: null,
		url: null,
		vendorId: null,
		vendorSource: null,
		imageUrl: withImage ? SAMPLE_IMAGE : null,
		price,
		currency: 'USD',
		notes,
		ratingValue: null,
		ratingCount: null,
		priority: 'normal',
		isArchived: false,
		archivedAt: null,
		pendingDeletionAt: null,
		quantity: 1,
		groupSortOrder: null,
		sortOrder: id,
		createdAt: EPOCH,
		updatedAt: EPOCH,
		modifiedAt: null,
		gifts: [],
		commentCount: 0,
	}
}

export const SAMPLE_ITEMS: Array<ItemWithGifts> = [
	sampleItem(1, 'Wireless noise cancelling headphones', '249.99', true),
	sampleItem(2, 'Cast iron skillet, 12 inch', '39.95', true, 'The pre-seasoned one, not enameled.'),
	sampleItem(3, 'Paperback novel', '16.00', true),
	sampleItem(4, 'Wool hiking socks, size medium', '24.00', false),
]
