import type { Meta, StoryObj } from '@storybook/react-vite'
import { Fragment } from 'react'

// The `__setStorybookComments` helper only exists on the Storybook alias of
// `@/api/comments` (see .storybook/mocks/api.ts). TypeScript resolves the path
// to the real API module, so we opt out of the missing-export check.
// @ts-expect-error - storybook-only mock export
import { __setStorybookComments } from '@/api/comments'
import type { GroupSummary, ItemForEditing, ItemWithGifts } from '@/api/lists'

import { withGalleryFrame } from './_stories/decorators'
import {
	fourthGifter,
	makeGift,
	makeItemForEditing,
	makeItemWithGifts,
	otherGifter,
	placeholderImages,
	thirdGifter,
	viewerUser,
} from './_stories/fixtures'
import { GroupBlock } from './group-block'
import { GroupViewBlock } from './group-view-block'
import { ItemEditRow } from './item-edit-row'
import ItemRow from './item-row'

/**
 * Gallery: every meaningful item permutation in one long scroll. Sections
 * group rows by what's varying (priority, quantity, content, claim state,
 * groups, etc.) so a reviewer can scan top-to-bottom and compare apples to
 * apples. Most rows use the generic "Item" title; titles only deviate when
 * the title itself is what the row is showing off.
 *
 * The `view` control flips every row between the recipient (owner) view and
 * the gifter (buyer) view. Default is gifter so the claim affordance is
 * visible without changing the control.
 */

type View = 'recipient' | 'gifter'

// Stable IDs for rows that need seeded comments. The mock
// `getCommentsForItem` reads from a registry keyed by itemId (see
// .storybook/mocks/api.ts), so every commented row pins its id.
const COMMENTED = {
	single: 9001,
	multi: 9002,
	grouped: 9003,
	stressSolo: 9010,
	stressPartial: 9011,
	stressFull: 9012,
} as const

const COMMENT_NOW = new Date('2026-04-20T14:32:00Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function makeComment(
	id: number,
	itemId: number,
	user: { id: string; name: string | null; email: string; image: string | null },
	comment: string,
	createdAt: Date
) {
	return { id, itemId, comment, createdAt, updatedAt: createdAt, user }
}

__setStorybookComments(COMMENTED.single, [
	makeComment(
		1,
		COMMENTED.single,
		otherGifter,
		'Any preference on color? I see this comes in cream and slate.',
		new Date(COMMENT_NOW.getTime() - 2 * DAY)
	),
	makeComment(
		2,
		COMMENTED.single,
		viewerUser,
		"I was thinking cream, but honestly either works. Whatever's in stock.",
		new Date(COMMENT_NOW.getTime() - 2 * DAY + 90 * 60 * 1000)
	),
])

__setStorybookComments(COMMENTED.multi, [
	makeComment(
		3,
		COMMENTED.multi,
		thirdGifter,
		'Happy to split the 6-pack with anyone. I can grab 2 if someone else takes 2.',
		new Date(COMMENT_NOW.getTime() - 3 * DAY)
	),
	makeComment(
		4,
		COMMENTED.multi,
		fourthGifter,
		"I'll take 2 then. Let's coordinate before the party.",
		new Date(COMMENT_NOW.getTime() - 3 * DAY + 4 * HOUR)
	),
	makeComment(5, COMMENTED.multi, otherGifter, "Great, I'll cover the last 2. Done!", new Date(COMMENT_NOW.getTime() - 1 * DAY)),
])

__setStorybookComments(COMMENTED.grouped, [
	makeComment(
		6,
		COMMENTED.grouped,
		otherGifter,
		'Is the v1 version okay or do you need the newer revision?',
		new Date(COMMENT_NOW.getTime() - 6 * HOUR)
	),
])

const longComment = `I was digging through the reviews on this and wanted to share a few things before anyone commits to a particular variant:

1. The larger size apparently runs slightly narrow, so folks with wider feet keep mentioning they went up half a size.
2. The cream colorway has had some consistency issues per recent reviews, the slate one seems to be the safer pick if you want something that matches the photos.
3. There's a known issue with the elastic band on earlier production runs, but anything shipped after February should be fine.

Happy to dig deeper if anyone wants me to. Otherwise I'll plan to grab two unless someone speaks up.`

__setStorybookComments(COMMENTED.stressSolo, [
	makeComment(
		100,
		COMMENTED.stressSolo,
		otherGifter,
		'Saw these in person last weekend, the build quality is genuinely incredible. Definitely worth the hype.',
		new Date(COMMENT_NOW.getTime() - 5 * DAY)
	),
	makeComment(101, COMMENTED.stressSolo, thirdGifter, longComment, new Date(COMMENT_NOW.getTime() - 4 * DAY - 2 * HOUR)),
	makeComment(
		102,
		COMMENTED.stressSolo,
		viewerUser,
		'Thanks for the research! Cream it is. Really appreciate the deep dive.',
		new Date(COMMENT_NOW.getTime() - 4 * DAY)
	),
	makeComment(
		103,
		COMMENTED.stressSolo,
		fourthGifter,
		"Oh nice, I was eyeing these too. If you end up grabbing one I'd love to hear how the sizing compares to the v1.",
		new Date(COMMENT_NOW.getTime() - 3 * DAY - 7 * HOUR)
	),
	makeComment(
		104,
		COMMENTED.stressSolo,
		otherGifter,
		'Ordered! Should arrive Friday. Will report back.',
		new Date(COMMENT_NOW.getTime() - 2 * DAY)
	),
])

__setStorybookComments(COMMENTED.stressPartial, [
	makeComment(
		110,
		COMMENTED.stressPartial,
		thirdGifter,
		'I can cover 3 of these, going to order this weekend unless someone has a conflict.',
		new Date(COMMENT_NOW.getTime() - 8 * DAY)
	),
	makeComment(
		111,
		COMMENTED.stressPartial,
		fourthGifter,
		"I've got 2 locked in. Let me know if anyone wants to coordinate shipping, I can consolidate at my place if that's easier.",
		new Date(COMMENT_NOW.getTime() - 7 * DAY - 3 * HOUR)
	),
	makeComment(
		112,
		COMMENTED.stressPartial,
		viewerUser,
		"Grabbed 2 as well. Happy to drop mine off at your place if that's still on the table.",
		new Date(COMMENT_NOW.getTime() - 6 * DAY)
	),
	makeComment(
		113,
		COMMENTED.stressPartial,
		otherGifter,
		`Checking in, has anyone confirmed whether the recipient prefers the assembled version or the flat-pack? I remember someone mentioning something about wanting to put them together with the kids as a project but I can't find that message now.

If it's the kit version those are on backorder until mid-May FYI.`,
		new Date(COMMENT_NOW.getTime() - 5 * DAY - 4 * HOUR)
	),
	makeComment(
		114,
		COMMENTED.stressPartial,
		thirdGifter,
		'Assembled, confirmed. Got it from the original thread.',
		new Date(COMMENT_NOW.getTime() - 5 * DAY)
	),
	makeComment(
		115,
		COMMENTED.stressPartial,
		fourthGifter,
		'Perfect. Shipping labels printed. 2/12 incoming.',
		new Date(COMMENT_NOW.getTime() - 3 * DAY)
	),
	makeComment(
		116,
		COMMENTED.stressPartial,
		viewerUser,
		'Mine shipped too. Still need 5 more slots covered if anyone is lurking!',
		new Date(COMMENT_NOW.getTime() - 2 * DAY)
	),
	makeComment(
		117,
		COMMENTED.stressPartial,
		otherGifter,
		"I'll pick up the remaining 5 so we can close this out. Ordering tonight.",
		new Date(COMMENT_NOW.getTime() - 18 * HOUR)
	),
])

__setStorybookComments(COMMENTED.stressFull, [
	makeComment(120, COMMENTED.stressFull, otherGifter, 'Claiming 2 of these!', new Date(COMMENT_NOW.getTime() - 10 * DAY)),
	makeComment(
		121,
		COMMENTED.stressFull,
		thirdGifter,
		"Grabbed 2 also. Excited, they've been on my radar forever.",
		new Date(COMMENT_NOW.getTime() - 9 * DAY - 5 * HOUR)
	),
	makeComment(122, COMMENTED.stressFull, fourthGifter, '2 more from me.', new Date(COMMENT_NOW.getTime() - 9 * DAY)),
	makeComment(
		123,
		COMMENTED.stressFull,
		viewerUser,
		'Last 2 are mine, and that closes this one out. Will ping the group when they all arrive so we can wrap together.',
		new Date(COMMENT_NOW.getTime() - 8 * DAY)
	),
	makeComment(
		124,
		COMMENTED.stressFull,
		otherGifter,
		'Mine arrived yesterday, packaging is gorgeous.',
		new Date(COMMENT_NOW.getTime() - 2 * DAY)
	),
	makeComment(
		125,
		COMMENTED.stressFull,
		fourthGifter,
		"Same! Will bring mine on Saturday if that's still the plan?",
		new Date(COMMENT_NOW.getTime() - 1 * DAY - 6 * HOUR)
	),
	makeComment(126, COMMENTED.stressFull, thirdGifter, 'Saturday works! See everyone then.', new Date(COMMENT_NOW.getTime() - 1 * DAY)),
])

// Generic title used for every row where the title isn't the variation.
const GENERIC = 'Item'
const GENERIC_URL = 'https://www.example.com/item'
const GENERIC_PRICE = '50'

type Variation = {
	key: string
	label: string
	edit: ItemForEditing
	viewable: ItemWithGifts
}

function pair(edit: Partial<ItemForEditing>, extra: Partial<ItemWithGifts> = {}): { edit: ItemForEditing; viewable: ItemWithGifts } {
	const base = makeItemForEditing({ title: GENERIC, url: GENERIC_URL, price: GENERIC_PRICE, ...edit })
	return {
		edit: base,
		viewable: makeItemWithGifts({ ...base, gifts: [], commentCount: base.commentCount, ...extra }),
	}
}

// ----- Variations grouped by what they're showing off -----

const prioritySection: Array<Variation> = [
	{ key: 'priority-low', label: 'low', ...pair({ priority: 'low' }) },
	{ key: 'priority-normal', label: 'normal (no priority tab)', ...pair({ priority: 'normal' }) },
	{ key: 'priority-high', label: 'high', ...pair({ priority: 'high' }) },
	{ key: 'priority-very-high', label: 'very-high', ...pair({ priority: 'very-high' }) },
]

const quantitySection: Array<Variation> = [
	{ key: 'qty-1', label: 'quantity 1', ...pair({ quantity: 1 }) },
	{ key: 'qty-3', label: 'quantity 3', ...pair({ quantity: 3 }) },
	{ key: 'qty-6', label: 'quantity 6', ...pair({ quantity: 6 }) },
	{ key: 'qty-12', label: 'quantity 12', ...pair({ quantity: 12 }) },
	{ key: 'qty-99', label: 'quantity 99', ...pair({ quantity: 99 }) },
]

const contentSection: Array<Variation> = [
	{ key: 'content-basic', label: 'title + url + price', ...pair({}) },
	{ key: 'content-no-price', label: 'no price', ...pair({ price: null }) },
	{ key: 'content-no-url', label: 'no url', ...pair({ url: null }) },
	{ key: 'content-no-price-no-url', label: 'no price + no url', ...pair({ price: null, url: null }) },
	{
		key: 'content-long-title',
		label: 'very long title',
		...pair({
			title: 'A very very very very very very very very long product title that should truncate gracefully across the row',
		}),
	},
	{
		key: 'content-long-url',
		label: 'very long url',
		...pair({
			url: 'https://www.example-store.com/product/category/subcategory/item-id/12345678/variant-red-large-premium?utm_source=test',
		}),
	},
	{
		key: 'content-notes-short',
		label: 'short notes',
		...pair({ notes: 'Neutral colors preferred.' }),
	},
	{
		key: 'content-notes-markdown',
		label: 'markdown notes',
		...pair({
			notes: 'Prefer **enameled**: sage or cream. Avoid red.\n\nSize 5-7qt works. See [Staub](https://www.staub.com) or Le Creuset.',
		}),
	},
	{
		key: 'content-comments',
		label: 'with comments (2 users)',
		...pair({ id: COMMENTED.single, commentCount: 2 }),
	},
]

const imageSection: Array<Variation> = [
	{ key: 'image-none', label: 'no image', ...pair({ imageUrl: null }) },
	{ key: 'image-square', label: 'square 200', ...pair({ imageUrl: placeholderImages.square }) },
	{ key: 'image-tiny', label: 'tiny 48', ...pair({ imageUrl: placeholderImages.tiny }) },
	{ key: 'image-tall', label: 'tall 140x280', ...pair({ imageUrl: placeholderImages.tall }) },
	{ key: 'image-wide', label: 'wide 320x120', ...pair({ imageUrl: placeholderImages.wide }) },
	{ key: 'image-huge', label: 'huge 800x600', ...pair({ imageUrl: placeholderImages.huge }) },
	{
		key: 'image-plus-notes',
		label: 'image + notes',
		...pair({
			imageUrl: placeholderImages.square,
			notes: '**Favorite option**. Holds up well in dishwasher.',
		}),
	},
]

const availabilitySection: Array<Variation> = [
	{ key: 'avail-available', label: 'available', ...pair({}) },
	{
		key: 'avail-unavailable',
		label: 'unavailable (with date)',
		...pair({ availability: 'unavailable', availabilityChangedAt: new Date('2026-04-12T15:30:00Z') }),
	},
	{
		key: 'avail-unavailable-no-date',
		label: 'unavailable (no date)',
		...pair({ availability: 'unavailable', availabilityChangedAt: null }),
	},
]

// Claim-state variations only render in gifter view (they need pre-populated gifts).
const claimStateSection: Array<Variation> = [
	{ key: 'claim-none', label: 'no claims', ...pair({}) },
	{
		key: 'claim-other',
		label: 'claimed by another (qty 1)',
		...pair({}, { gifts: [makeGift({ quantity: 1 })] }),
	},
	{
		key: 'claim-you',
		label: 'claimed by you (qty 1)',
		...pair({}, { gifts: [makeGift({ gifterId: viewerUser.id, gifter: viewerUser, quantity: 1 })] }),
	},
	{
		key: 'claim-partial-2',
		label: 'partial (qty 6, 2 gifters)',
		...pair(
			{ quantity: 6 },
			{
				quantity: 6,
				gifts: [makeGift({ quantity: 2 }), makeGift({ quantity: 2, gifterId: thirdGifter.id, gifter: thirdGifter })],
			}
		),
	},
	{
		key: 'claim-partial-you',
		label: 'partial (qty 4, you + other)',
		...pair(
			{ quantity: 4 },
			{
				quantity: 4,
				gifts: [
					makeGift({ gifterId: viewerUser.id, gifter: viewerUser, quantity: 1 }),
					makeGift({ gifterId: otherGifter.id, gifter: otherGifter, quantity: 2 }),
				],
			}
		),
	},
	{
		key: 'claim-many-gifters',
		label: 'partial (qty 5, four gifters)',
		...pair(
			{ quantity: 5 },
			{
				quantity: 5,
				gifts: [
					makeGift({ quantity: 1 }),
					makeGift({ quantity: 1, gifterId: thirdGifter.id, gifter: thirdGifter }),
					makeGift({ quantity: 1, gifterId: fourthGifter.id, gifter: fourthGifter }),
					makeGift({ quantity: 1, gifterId: viewerUser.id, gifter: viewerUser }),
				],
			}
		),
	},
	{
		key: 'claim-full-others',
		label: 'fully claimed (others)',
		...pair({}, { gifts: [makeGift({ quantity: 1 })] }),
	},
	{
		key: 'claim-full-you',
		label: 'fully claimed (you)',
		...pair({}, { gifts: [makeGift({ gifterId: viewerUser.id, gifter: viewerUser, quantity: 1 })] }),
	},
	{
		key: 'claim-over',
		label: 'over-claimed (qty 2, 3 claimed)',
		...pair(
			{ quantity: 2 },
			{
				quantity: 2,
				gifts: [makeGift({ quantity: 2 }), makeGift({ quantity: 1, gifterId: thirdGifter.id, gifter: thirdGifter })],
			}
		),
	},
	{
		key: 'claim-unavail-with-yours',
		label: 'unavailable + your existing claim',
		...pair(
			{ availability: 'unavailable', availabilityChangedAt: new Date('2026-04-12T15:30:00Z') },
			{
				availability: 'unavailable',
				availabilityChangedAt: new Date('2026-04-12T15:30:00Z'),
				gifts: [makeGift({ gifterId: viewerUser.id, gifter: viewerUser, quantity: 1 })],
			}
		),
	},
	{
		key: 'claim-coordination',
		label: 'with comments (3 users coordinating)',
		...pair(
			{ id: COMMENTED.multi, quantity: 6, commentCount: 3 },
			{
				quantity: 6,
				commentCount: 3,
				gifts: [
					makeGift({ quantity: 2, gifterId: thirdGifter.id, gifter: thirdGifter }),
					makeGift({ quantity: 2, gifterId: fourthGifter.id, gifter: fourthGifter }),
					makeGift({ quantity: 2 }),
				],
			}
		),
	},
]

// ----- Group fixtures -----
// Each scenario produces matched edit/view item arrays so the same fixture
// renders in both recipient and gifter mode.

type GroupScenario = {
	key: string
	label: string
	group: GroupSummary
	edit: Array<ItemForEditing>
	view: Array<ItemWithGifts>
}

let nextGroupId = 1000
function makeGroup(overrides: Partial<GroupSummary> = {}): GroupSummary {
	return { id: ++nextGroupId, type: 'or', name: 'Group', priority: 'normal', sortOrder: null, ...overrides }
}

function buildGroupItems(groupId: number, count: number, base?: Partial<ItemForEditing>): Array<ItemForEditing> {
	return Array.from({ length: count }, (_, i) =>
		makeItemForEditing({
			title: `Option ${String.fromCharCode(65 + i)}`,
			url: null,
			price: GENERIC_PRICE,
			groupId,
			groupSortOrder: i,
			...base,
		})
	)
}

// Pick-one (or) scenarios.
const pickOneAllUnclaimed2 = (() => {
	const g = makeGroup({ name: 'Pick one (2 items)' })
	const items = buildGroupItems(g.id, 2)
	return {
		key: 'or-2-unclaimed',
		label: '2 items, all unclaimed',
		group: g,
		edit: items,
		view: items.map(i => makeItemWithGifts({ ...i, gifts: [] })),
	} satisfies GroupScenario
})()

const pickOneAllUnclaimed3 = (() => {
	const g = makeGroup({ name: 'Pick one (3 items)' })
	const items = buildGroupItems(g.id, 3)
	return {
		key: 'or-3-unclaimed',
		label: '3 items, all unclaimed',
		group: g,
		edit: items,
		view: items.map(i => makeItemWithGifts({ ...i, gifts: [] })),
	} satisfies GroupScenario
})()

const pickOneAllUnclaimed5 = (() => {
	const g = makeGroup({ name: 'Pick one (5 items)' })
	const items = buildGroupItems(g.id, 5)
	return {
		key: 'or-5-unclaimed',
		label: '5 items, all unclaimed',
		group: g,
		edit: items,
		view: items.map(i => makeItemWithGifts({ ...i, gifts: [] })),
	} satisfies GroupScenario
})()

const pickOneOneClaimed = (() => {
	const g = makeGroup({ name: 'Pick one (one claimed, siblings locked)' })
	const items = buildGroupItems(g.id, 3)
	const view = items.map((i, idx) =>
		makeItemWithGifts({
			...i,
			gifts: idx === 1 ? [makeGift({ gifterId: otherGifter.id, gifter: otherGifter })] : [],
		})
	)
	return { key: 'or-3-one-claimed', label: '3 items, one claimed (siblings locked)', group: g, edit: items, view } satisfies GroupScenario
})()

const pickOneYouClaimed = (() => {
	const g = makeGroup({ name: 'Pick one (you claimed)' })
	const items = buildGroupItems(g.id, 3)
	const view = items.map((i, idx) =>
		makeItemWithGifts({
			...i,
			gifts: idx === 0 ? [makeGift({ gifterId: viewerUser.id, gifter: viewerUser })] : [],
		})
	)
	return { key: 'or-3-you-claimed', label: '3 items, you claimed (siblings locked)', group: g, edit: items, view } satisfies GroupScenario
})()

const pickOneHighPriority = (() => {
	const g = makeGroup({ name: 'Headphones (pick one)', priority: 'high' })
	const items = [
		makeItemForEditing({ groupId: g.id, title: 'Sony WH-1000XM5', price: '399', imageUrl: placeholderImages.square }),
		makeItemForEditing({ groupId: g.id, title: 'Bose QuietComfort Ultra', price: '429' }),
		makeItemForEditing({ groupId: g.id, title: 'AirPods Max', price: '549', imageUrl: placeholderImages.squareSmall }),
	]
	return {
		key: 'or-3-high-priority',
		label: '3 items, high priority (tab on group, images vary)',
		group: g,
		edit: items,
		view: items.map(i => makeItemWithGifts({ ...i, gifts: [] })),
	} satisfies GroupScenario
})()

const pickOneUnnamed = (() => {
	const g = makeGroup({ name: null })
	const items = buildGroupItems(g.id, 2)
	return {
		key: 'or-2-unnamed',
		label: '2 items, unnamed group',
		group: g,
		edit: items,
		view: items.map(i => makeItemWithGifts({ ...i, gifts: [] })),
	} satisfies GroupScenario
})()

const pickOneEmpty = (() => {
	const g = makeGroup({ name: 'Pick one (empty)' })
	return { key: 'or-empty', label: 'empty group (recipient sees placeholder, gifter view hides)', group: g, edit: [], view: [] }
})()

// Ordered scenarios.
const orderedAllUnclaimed2 = (() => {
	const g = makeGroup({ type: 'order', name: 'Ordered (2 steps)' })
	const items = buildGroupItems(g.id, 2)
	return {
		key: 'order-2-unclaimed',
		label: '2 steps, none claimed',
		group: g,
		edit: items,
		view: items.map(i => makeItemWithGifts({ ...i, gifts: [] })),
	} satisfies GroupScenario
})()

const orderedAllUnclaimed4 = (() => {
	const g = makeGroup({ type: 'order', name: 'Ordered (4 steps)' })
	const items = buildGroupItems(g.id, 4)
	return {
		key: 'order-4-unclaimed',
		label: '4 steps, none claimed',
		group: g,
		edit: items,
		view: items.map(i => makeItemWithGifts({ ...i, gifts: [] })),
	} satisfies GroupScenario
})()

const orderedFirstClaimed = (() => {
	const g = makeGroup({ type: 'order', name: 'Ordered (first claimed)' })
	const items = buildGroupItems(g.id, 4)
	const view = items.map((i, idx) =>
		makeItemWithGifts({
			...i,
			gifts: idx === 0 ? [makeGift({ gifterId: otherGifter.id, gifter: otherGifter })] : [],
		})
	)
	return {
		key: 'order-4-first-claimed',
		label: '4 steps, first claimed (rest locked)',
		group: g,
		edit: items,
		view,
	} satisfies GroupScenario
})()

const orderedFirstTwoClaimed = (() => {
	const g = makeGroup({ type: 'order', name: 'Ordered (first two claimed)' })
	const items = buildGroupItems(g.id, 4)
	const view = items.map((i, idx) =>
		makeItemWithGifts({
			...i,
			gifts:
				idx < 2 ? [makeGift({ gifterId: idx === 0 ? otherGifter.id : thirdGifter.id, gifter: idx === 0 ? otherGifter : thirdGifter })] : [],
		})
	)
	return { key: 'order-4-first-two-claimed', label: '4 steps, first two claimed', group: g, edit: items, view } satisfies GroupScenario
})()

const orderedPartialQtyStep = (() => {
	const g = makeGroup({ type: 'order', name: 'Ordered (qty>1 partially claimed)' })
	const items = [
		makeItemForEditing({ groupId: g.id, title: 'Option A', quantity: 4, price: GENERIC_PRICE, url: null, groupSortOrder: 0 }),
		makeItemForEditing({ groupId: g.id, title: 'Option B', price: GENERIC_PRICE, url: null, groupSortOrder: 1 }),
		makeItemForEditing({ groupId: g.id, title: 'Option C', price: GENERIC_PRICE, url: null, groupSortOrder: 2 }),
	]
	const view: Array<ItemWithGifts> = [
		makeItemWithGifts({ ...items[0], quantity: 4, gifts: [makeGift({ quantity: 2 })] }),
		makeItemWithGifts({ ...items[1], gifts: [] }),
		makeItemWithGifts({ ...items[2], gifts: [] }),
	]
	return {
		key: 'order-3-first-step-partial',
		label: '3 steps, first step half-claimed (later steps locked)',
		group: g,
		edit: items,
		view,
	} satisfies GroupScenario
})()

const orderedFullyClaimed = (() => {
	const g = makeGroup({ type: 'order', name: 'Ordered (all claimed)' })
	const items = buildGroupItems(g.id, 3)
	const view = items.map((i, idx) =>
		makeItemWithGifts({
			...i,
			gifts: [
				makeGift({ gifterId: [otherGifter, thirdGifter, fourthGifter][idx].id, gifter: [otherGifter, thirdGifter, fourthGifter][idx] }),
			],
		})
	)
	return { key: 'order-3-fully-claimed', label: '3 steps, all claimed', group: g, edit: items, view } satisfies GroupScenario
})()

const orderedHighPriority = (() => {
	const g = makeGroup({ type: 'order', name: 'Coffee setup (in order)', priority: 'very-high' })
	const items = [
		makeItemForEditing({ groupId: g.id, title: 'Espresso machine', price: '699', groupSortOrder: 0, imageUrl: placeholderImages.square }),
		makeItemForEditing({
			id: COMMENTED.grouped,
			groupId: g.id,
			title: 'Grinder',
			price: '249',
			groupSortOrder: 1,
			commentCount: 1,
		}),
		makeItemForEditing({ groupId: g.id, title: 'Scale', price: '65', groupSortOrder: 2, imageUrl: placeholderImages.squareSmall }),
	]
	return {
		key: 'order-3-very-high-priority',
		label: '3 steps, very-high priority (group-level tab)',
		group: g,
		edit: items,
		view: items.map(i => makeItemWithGifts({ ...i, gifts: [] })),
	} satisfies GroupScenario
})()

const pickOneScenarios: Array<GroupScenario> = [
	pickOneAllUnclaimed2,
	pickOneAllUnclaimed3,
	pickOneAllUnclaimed5,
	pickOneOneClaimed,
	pickOneYouClaimed,
	pickOneHighPriority,
	pickOneUnnamed,
	pickOneEmpty,
]

const orderedScenarios: Array<GroupScenario> = [
	orderedAllUnclaimed2,
	orderedAllUnclaimed4,
	orderedFirstClaimed,
	orderedFirstTwoClaimed,
	orderedPartialQtyStep,
	orderedFullyClaimed,
	orderedHighPriority,
]

// Pool of groups exposed to the recipient's group-edit dropdowns. Just needs
// to be non-empty so the menu has things to render.
const groupsForMenu: Array<GroupSummary> = [
	makeGroup({ id: 1, name: 'Pick one', type: 'or' }),
	makeGroup({ id: 2, name: 'Ordered', type: 'order', priority: 'high' }),
]

// ----- Stress fixtures -----

const stressLongTitle =
	'The absolutely ridiculous super-premium artisan hand-forged limited-edition collector-grade deluxe professional-series reserve-quality signature-collection flagship product (2026 edition)'

const stressLongNotes = `## Color & finish preferences

- **Primary**: deep navy, forest green, or charcoal grey work best with the rest of the room.
- **Secondary**: cream or bone if the primary colors aren't in stock.
- Avoid anything glossy, we want a **matte** or satin finish if possible. No chrome, no mirror polish.

## Sizing

Go with the **medium** variant. If only large is available, check the [official size chart](https://example.com/sizes) first, apparently the large runs closer to an XL on this line.

> Heads up: the EU warehouse ships in ~2 weeks, the US warehouse is usually 3-5 days. Price difference is negligible.

## Backup options

If the primary is sold out, [this alternate](https://example.com/alt) is close enough. In a pinch, the \`v1\` version from last year is also fine, just slightly different hardware.

---

Thanks everyone for coordinating on this! Let me know if you have questions before ordering.`

const stressSection: Array<Variation> = [
	{
		key: 'stress-solo',
		label: 'overload (solo, no claims, 5 comments)',
		...pair({
			id: COMMENTED.stressSolo,
			title: stressLongTitle,
			notes: stressLongNotes,
			url: 'https://www.example-store.com/product/category/subcategory/item-id/12345678/variant-navy-medium-premium?utm_source=gallery',
			imageUrl: placeholderImages.square,
			price: '1,299.99',
			priority: 'very-high',
			quantity: 8,
			commentCount: 5,
		}),
	},
	{
		key: 'stress-partial',
		label: 'overload (qty 12, partial, 8 comments)',
		...pair(
			{
				id: COMMENTED.stressPartial,
				title: stressLongTitle,
				notes: stressLongNotes,
				url: 'https://www.example-store.com/product/category/subcategory/item-id/98765/variant-forest-medium',
				imageUrl: placeholderImages.square,
				price: '249 each',
				priority: 'high',
				quantity: 12,
				commentCount: 8,
			},
			{
				quantity: 12,
				commentCount: 8,
				gifts: [
					makeGift({ quantity: 3, gifterId: thirdGifter.id, gifter: thirdGifter }),
					makeGift({ quantity: 2, gifterId: fourthGifter.id, gifter: fourthGifter }),
					makeGift({ quantity: 2, gifterId: viewerUser.id, gifter: viewerUser }),
				],
			}
		),
	},
	{
		key: 'stress-full',
		label: 'overload (qty 8, fully claimed, 7 comments)',
		...pair(
			{
				id: COMMENTED.stressFull,
				title: stressLongTitle,
				notes: stressLongNotes,
				imageUrl: placeholderImages.square,
				price: '399.99',
				priority: 'very-high',
				quantity: 8,
				commentCount: 7,
			},
			{
				quantity: 8,
				commentCount: 7,
				gifts: [
					makeGift({ quantity: 2 }),
					makeGift({ quantity: 2, gifterId: thirdGifter.id, gifter: thirdGifter }),
					makeGift({ quantity: 2, gifterId: fourthGifter.id, gifter: fourthGifter }),
					makeGift({ quantity: 2, gifterId: viewerUser.id, gifter: viewerUser }),
				],
			}
		),
	},
]

// ----- Render helpers -----

function SectionHeader({ title, note }: { title: string; note?: string }) {
	return (
		<div className="pt-6 pb-2 border-b border-dashed border-muted-foreground/30 mb-2">
			<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
			{note && <p className="text-xs text-muted-foreground/80 mt-0.5">{note}</p>}
		</div>
	)
}

function RowLabel({ label }: { label: string }) {
	return <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 pt-3">{label}</div>
}

function VariationList({ variations, view }: { variations: Array<Variation>; view: View }) {
	return (
		<>
			{variations.map(v => (
				<Fragment key={v.key}>
					<RowLabel label={v.label} />
					{view === 'recipient' ? (
						<ItemEditRow item={v.edit} commentCount={v.edit.commentCount} groups={groupsForMenu} />
					) : (
						<ItemRow item={v.viewable} />
					)}
				</Fragment>
			))}
		</>
	)
}

function GroupList({ scenarios, view }: { scenarios: Array<GroupScenario>; view: View }) {
	return (
		<>
			{scenarios.map(s => (
				<Fragment key={s.key}>
					<RowLabel label={s.label} />
					{view === 'recipient' ? (
						<GroupBlock
							group={s.group}
							items={s.edit}
							groups={groupsForMenu}
							listId={1}
							isOwner
							onAddItem={() => {}}
							onDelete={() => {}}
							onMoveItem={() => {}}
							onReorder={() => {}}
						/>
					) : s.view.length === 0 ? (
						<div className="text-xs text-muted-foreground italic">Empty groups are hidden in buyer view.</div>
					) : (
						<GroupViewBlock group={s.group} items={s.view} />
					)}
				</Fragment>
			))}
		</>
	)
}

// ----- Gallery -----

type GalleryArgs = { view: View }

function Gallery({ view }: GalleryArgs) {
	return (
		<div className="flex flex-col">
			<SectionHeader title="Priority" note="Coloured tab on the left edge of the row. Normal renders no tab." />
			<VariationList variations={prioritySection} view={view} />

			<SectionHeader title="Quantity" note="Badge variants for different total quantities. No claims; remaining equals quantity." />
			<VariationList variations={quantitySection} view={view} />

			<SectionHeader title="Content" note="Combinations of title, url, price, notes, and comments. Image is held constant." />
			<VariationList variations={contentSection} view={view} />

			<SectionHeader title="Image" note="Different image sizes plus a row that pairs image with notes." />
			<VariationList variations={imageSection} view={view} />

			<SectionHeader title="Availability" note="Available, unavailable with a marked-on date tooltip, and unavailable without one." />
			<VariationList variations={availabilitySection} view={view} />

			{view === 'gifter' && (
				<>
					<SectionHeader
						title="Claim states (gifter only)"
						note="States that depend on existing claims. Recipient view hides claims by design (spoiler protection)."
					/>
					<VariationList variations={claimStateSection} view={view} />
				</>
			)}

			<SectionHeader
				title="Group: pick-one (or)"
				note="Different sizes (2, 3, 5), claim states, priority on the group, and unnamed/empty edge cases."
			/>
			<GroupList scenarios={pickOneScenarios} view={view} />

			<SectionHeader
				title="Group: ordered"
				note="Step counts from 2-4, sequential claim states, a step with qty>1 partially claimed, and a high-priority group-level tab."
			/>
			<GroupList scenarios={orderedScenarios} view={view} />

			<SectionHeader
				title="Stress"
				note="Long titles, long markdown notes, large quantities, deep comment threads. Use to spot layout breaks."
			/>
			<VariationList variations={stressSection.filter(v => view === 'gifter' || v.key === 'stress-solo')} view={view} />
		</div>
	)
}

const meta = {
	title: 'Items/Item Gallery',
	component: Gallery,
	parameters: {
		layout: 'fullscreen',
		session: { user: viewerUser },
		docs: {
			description: {
				component:
					'Every meaningful item permutation grouped by what varies. Switch the view control to flip every row between the recipient (owner) view and the gifter (buyer) view. Defaults to gifter so claim affordances render without changing the control.',
			},
		},
	},
	decorators: [withGalleryFrame],
	argTypes: {
		view: {
			control: { type: 'radio' },
			options: ['recipient', 'gifter'],
			description: 'Flip every row between recipient (owner/editor) view and gifter (buyer) view.',
		},
	},
	args: {
		view: 'gifter',
	},
} satisfies Meta<typeof Gallery>

export default meta
type Story = StoryObj<typeof meta>

export const Everything: Story = {}

export const RecipientView: Story = {
	args: { view: 'recipient' },
}

export const GifterView: Story = {
	args: { view: 'gifter' },
}
