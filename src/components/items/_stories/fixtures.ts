import type { GiftOnItem, ItemForEditing, ItemWithGifts } from '@/api/lists'
import type { Item } from '@/db/schema/items'

export const NOW = new Date('2026-04-01T00:00:00Z')

export const viewerUser = {
	id: 'viewer-1',
	name: 'Alex Buyer',
	email: 'alex@example.com',
	image: null,
}

export const otherGifter = {
	id: 'friend-2',
	name: 'Jamie Friend',
	email: 'jamie@example.com',
	image: null,
}

export const thirdGifter = {
	id: 'friend-3',
	name: 'Sam Sibling',
	email: 'sam@example.com',
	image: null,
}

export const fourthGifter = {
	id: 'friend-4',
	name: 'Robin Cousin',
	email: 'robin@example.com',
	image: null,
}

export const placeholderImages = {
	square: 'https://placehold.co/200x200/png?text=Square',
	squareSmall: 'https://placehold.co/64x64/png?text=Sm',
	tall: 'https://placehold.co/140x280/png?text=Tall',
	wide: 'https://placehold.co/320x120/png?text=Wide',
	tiny: 'https://placehold.co/48x48/png?text=48',
	huge: 'https://placehold.co/800x600/png?text=Huge',
}

let nextId = 1000
const nextItemId = () => ++nextId

/** Build a plain Item (recipient/owner edit shape). */
export function makeItem(overrides: Partial<Item> = {}): Item {
	return {
		id: nextItemId(),
		listId: 1,
		groupId: null,
		title: 'Bluetooth headphones',
		status: 'incomplete',
		availability: 'available',
		availabilityChangedAt: null,
		url: 'https://www.amazon.com/dp/B0863TXGM3',
		vendorId: 'amazon',
		vendorSource: 'rule',
		imageUrl: null,
		price: '349.99',
		currency: 'USD',
		notes: null,
		priority: 'normal',
		isArchived: false,
		quantity: 1,
		groupSortOrder: null,
		sortOrder: null,
		createdAt: NOW,
		updatedAt: NOW,
		modifiedAt: null,
		...overrides,
	}
}

/** Build an ItemWithGifts (buyer view shape: Item + gifts[] + commentCount). */
export function makeItemWithGifts(overrides: Partial<ItemWithGifts> = {}): ItemWithGifts {
	return {
		...makeItem(),
		gifts: [],
		commentCount: 0,
		...overrides,
	}
}

/** Build an ItemForEditing (recipient view, mirrors makeItem but with commentCount). */
export function makeItemForEditing(overrides: Partial<ItemForEditing> = {}): ItemForEditing {
	return {
		...makeItem(),
		commentCount: 0,
		...overrides,
	}
}

let nextGiftId = 5000
export function makeGift(overrides: Partial<GiftOnItem> = {}): GiftOnItem {
	return {
		id: ++nextGiftId,
		itemId: 1,
		gifterId: otherGifter.id,
		quantity: 1,
		notes: null,
		totalCost: null,
		additionalGifterIds: null,
		createdAt: NOW,
		gifter: otherGifter,
		...overrides,
	}
}
