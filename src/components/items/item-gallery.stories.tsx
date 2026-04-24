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
 * Gallery story. Scrollable showcase of every common Item state (priority,
 * quantity, price, availability, images, notes, grouped, claimed, etc.) in
 * one long stack. Use the `view` control to flip every row between the
 * recipient (owner) view and the gifter (buyer) view.
 */

type View = 'recipient' | 'gifter'

type Variation = {
	key: string
	label: string
	// Payload each row needs, shaped for both views.
	edit: ItemForEditing
	viewable: ItemWithGifts
}

// Known item IDs for rows that need seeded comments. The mock
// `getCommentsForItem` reads from a registry keyed by itemId (see
// .storybook/mocks/api.ts), so every commented row pins its id.
const COMMENTED_ITEM_IDS = {
	single: 9001,
	multiGifter: 9002,
	grouped: 9003,
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

__setStorybookComments(COMMENTED_ITEM_IDS.single, [
	makeComment(
		1,
		COMMENTED_ITEM_IDS.single,
		otherGifter,
		'Any preference on color? I see this comes in cream and slate.',
		new Date(COMMENT_NOW.getTime() - 2 * DAY)
	),
	makeComment(
		2,
		COMMENTED_ITEM_IDS.single,
		viewerUser,
		"I was thinking cream, but honestly either works. Whatever's in stock.",
		new Date(COMMENT_NOW.getTime() - 2 * DAY + 90 * 60 * 1000)
	),
])

__setStorybookComments(COMMENTED_ITEM_IDS.multiGifter, [
	makeComment(
		3,
		COMMENTED_ITEM_IDS.multiGifter,
		thirdGifter,
		'Happy to split the 6-pack with anyone. I can grab 2 if someone else takes 2.',
		new Date(COMMENT_NOW.getTime() - 3 * DAY)
	),
	makeComment(
		4,
		COMMENTED_ITEM_IDS.multiGifter,
		fourthGifter,
		"I'll take 2 then. Let's coordinate before the party.",
		new Date(COMMENT_NOW.getTime() - 3 * DAY + 4 * HOUR)
	),
	makeComment(
		5,
		COMMENTED_ITEM_IDS.multiGifter,
		otherGifter,
		"Great, I'll cover the last 2. Done!",
		new Date(COMMENT_NOW.getTime() - 1 * DAY)
	),
])

__setStorybookComments(COMMENTED_ITEM_IDS.grouped, [
	makeComment(
		6,
		COMMENTED_ITEM_IDS.grouped,
		otherGifter,
		'Is the v1 version okay or do you need the newer revision?',
		new Date(COMMENT_NOW.getTime() - 6 * HOUR)
	),
])

const pickOneGroup: GroupSummary = { id: 900, type: 'or', name: 'Headphones (pick one)', priority: 'high', sortOrder: null }
const orderedGroup: GroupSummary = { id: 901, type: 'order', name: 'Coffee setup (in order)', priority: 'very-high', sortOrder: null }
const unnamedPickOne: GroupSummary = { id: 902, type: 'or', name: null, priority: 'normal', sortOrder: null }
const groups: Array<GroupSummary> = [pickOneGroup, orderedGroup, unnamedPickOne]

function pair(edit: Partial<ItemForEditing>, extraGifts: Partial<ItemWithGifts> = {}): { edit: ItemForEditing; viewable: ItemWithGifts } {
	const base = makeItemForEditing(edit)
	return {
		edit: base,
		viewable: makeItemWithGifts({ ...base, gifts: [], commentCount: base.commentCount, ...extraGifts }),
	}
}

const standaloneVariations: Array<Variation> = [
	{ key: 'basic', label: 'Basic', ...pair({ title: 'Basic item', price: '25' }) },
	{ key: 'no-price', label: 'No price, no url', ...pair({ title: 'No price, no url', price: null, url: null }) },
	{
		key: 'priority-low',
		label: 'Low priority',
		...pair({ title: 'Low priority item', priority: 'low', price: '15' }),
	},
	{
		key: 'priority-high',
		label: 'High priority',
		...pair({ title: 'High priority item', priority: 'high', price: '120' }),
	},
	{
		key: 'priority-very-high',
		label: 'Very high priority',
		...pair({ title: 'Very high priority item', priority: 'very-high', price: '299' }),
	},
	{
		key: 'quantity-small',
		label: 'Quantity 3',
		...pair({ title: 'Cozy wool socks', price: '18', quantity: 3 }),
	},
	{
		key: 'quantity-large',
		label: 'Quantity 12',
		...pair({ title: 'Bulk wine glasses', price: '12 each', quantity: 12 }),
	},
	{
		key: 'long-title',
		label: 'Very long title',
		...pair({
			title: 'A very very very very very very very very long product title that should truncate gracefully across the row',
			price: '50',
		}),
	},
	{
		key: 'long-url',
		label: 'Very long URL',
		...pair({
			title: 'Product with a long url',
			url: 'https://www.example-store.com/product/category/subcategory/item-id/12345678/variant-red-large-premium?utm_source=test',
			price: '99',
		}),
	},
	{
		key: 'notes-short',
		label: 'Notes (short)',
		...pair({
			title: 'Ceramic mug',
			notes: 'Neutral colors preferred.',
			price: '42',
		}),
	},
	{
		key: 'notes-markdown',
		label: 'Notes (markdown)',
		...pair({
			title: 'Cast-iron dutch oven',
			notes: 'Prefer **enameled**: sage or cream. Avoid red.\n\nSize 5-7qt works. See [Staub](https://www.staub.com) or Le Creuset.',
			priority: 'high',
			price: '250',
		}),
	},
	{
		key: 'image-square',
		label: 'Image (square 200)',
		...pair({ title: 'With square image', imageUrl: placeholderImages.square, price: '64' }),
	},
	{
		key: 'image-tiny',
		label: 'Image (tiny 48)',
		...pair({ title: 'With tiny image', imageUrl: placeholderImages.tiny, price: '10' }),
	},
	{
		key: 'image-tall',
		label: 'Image (tall)',
		...pair({ title: 'With tall image', imageUrl: placeholderImages.tall, price: '80' }),
	},
	{
		key: 'image-wide',
		label: 'Image (wide)',
		...pair({ title: 'With wide image', imageUrl: placeholderImages.wide, price: '120' }),
	},
	{
		key: 'image-huge',
		label: 'Image (huge original)',
		...pair({ title: 'With oversized image', imageUrl: placeholderImages.huge, price: '150' }),
	},
	{
		key: 'image-notes',
		label: 'Image + notes + high',
		...pair({
			title: 'Image and notes together',
			imageUrl: placeholderImages.square,
			notes: '**Favorite option**. Holds up well in dishwasher.',
			priority: 'high',
			price: '85',
		}),
	},
	{
		key: 'everything',
		label: 'Everything at once',
		...pair({
			title: 'Everything on one row: title, url, price, qty, notes, image, priority',
			imageUrl: placeholderImages.square,
			notes: 'With **notes**, a [link](https://example.com), and more.',
			priority: 'very-high',
			quantity: 4,
			price: '399.99',
		}),
	},
	{
		key: 'with-comments',
		label: 'With comments (2 users)',
		...pair({
			id: COMMENTED_ITEM_IDS.single,
			title: 'Hand-thrown ceramic mug',
			price: '42',
			commentCount: 2,
		}),
	},
]

// Variations that only make sense for the buyer view, they need pre-populated
// gifts, so they're kept separate and only rendered in gifter mode.
const buyerOnlyVariations: Array<Variation> = [
	{
		key: 'claimed-by-other',
		label: 'Claimed by another',
		...pair(
			{ title: 'Claimed by another gifter', price: '45' },
			{
				gifts: [makeGift({ quantity: 1 })],
			}
		),
	},
	{
		key: 'claimed-by-you',
		label: 'Claimed by you',
		...pair(
			{ title: 'Claimed by you', price: '45' },
			{
				gifts: [makeGift({ gifterId: viewerUser.id, gifter: viewerUser })],
			}
		),
	},
	{
		key: 'partial-two-gifters',
		label: 'Partial (2 gifters)',
		...pair(
			{ title: 'Wine glasses', quantity: 6, price: '12 each' },
			{
				quantity: 6,
				gifts: [makeGift({ quantity: 2 }), makeGift({ quantity: 2, gifterId: thirdGifter.id, gifter: thirdGifter })],
			}
		),
	},
	{
		key: 'partial-you-plus-others',
		label: 'Partial (you + others)',
		...pair(
			{ title: 'Board game night starter pack', quantity: 4, price: '30 each' },
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
		key: 'fully-claimed',
		label: 'Fully claimed (others)',
		...pair(
			{ title: 'Espresso machine', price: '699', priority: 'very-high' },
			{
				gifts: [makeGift({ quantity: 1 })],
			}
		),
	},
	{
		key: 'fully-claimed-by-you',
		label: 'Fully claimed (you)',
		...pair(
			{ title: 'Cookbook', price: '35' },
			{
				gifts: [makeGift({ gifterId: viewerUser.id, gifter: viewerUser, quantity: 1 })],
			}
		),
	},
	{
		key: 'many-gifters',
		label: 'Many gifters',
		...pair(
			{ title: 'Group housewarming gift', quantity: 5, price: '200' },
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
		key: 'comments-coordination',
		label: 'Comments (3 users coordinating)',
		...pair(
			{
				id: COMMENTED_ITEM_IDS.multiGifter,
				title: 'Wine glasses',
				quantity: 6,
				price: '12 each',
				commentCount: 3,
			},
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

function SectionHeader({ title, note }: { title: string; note?: string }) {
	return (
		<div className="pt-2 pb-1">
			<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
			{note && <p className="text-xs text-muted-foreground/80">{note}</p>}
		</div>
	)
}

function RowLabel({ label }: { label: string }) {
	return <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 pt-3">{label}</div>
}

type GalleryArgs = { view: View }

function Gallery({ view }: GalleryArgs) {
	const pickOneItems = [
		makeItemForEditing({ groupId: pickOneGroup.id, title: 'Sony WH-1000XM5', price: '399', imageUrl: placeholderImages.square }),
		makeItemForEditing({ groupId: pickOneGroup.id, title: 'Bose QuietComfort Ultra', price: '429' }),
		makeItemForEditing({ groupId: pickOneGroup.id, title: 'AirPods Max', price: '549', imageUrl: placeholderImages.squareSmall }),
	]

	const orderedItems = [
		makeItemForEditing({
			groupId: orderedGroup.id,
			title: 'Espresso machine',
			price: '699',
			groupSortOrder: 0,
			imageUrl: placeholderImages.square,
		}),
		makeItemForEditing({
			id: COMMENTED_ITEM_IDS.grouped,
			groupId: orderedGroup.id,
			title: 'Grinder',
			price: '249',
			groupSortOrder: 1,
			commentCount: 1,
		}),
		makeItemForEditing({
			groupId: orderedGroup.id,
			title: 'Scale',
			price: '65',
			groupSortOrder: 2,
			imageUrl: placeholderImages.squareSmall,
		}),
	]

	const unnamedItems = [
		makeItemForEditing({ groupId: unnamedPickOne.id, title: 'Option A', price: '50' }),
		makeItemForEditing({ groupId: unnamedPickOne.id, title: 'Option B', price: '55' }),
	]

	// Pick-one group with one option already claimed (shows "Locked" on siblings in buyer view)
	const pickOnePartial = {
		group: pickOneGroup,
		items: [
			makeItemWithGifts({
				groupId: pickOneGroup.id,
				title: 'Sony WH-1000XM5',
				price: '399',
				imageUrl: placeholderImages.square,
				gifts: [],
			}),
			makeItemWithGifts({
				groupId: pickOneGroup.id,
				title: 'Bose QuietComfort Ultra',
				price: '429',
				gifts: [makeGift({ gifterId: otherGifter.id, gifter: otherGifter })],
			}),
			makeItemWithGifts({
				groupId: pickOneGroup.id,
				title: 'AirPods Max',
				price: '549',
				imageUrl: placeholderImages.squareSmall,
				gifts: [],
			}),
		],
	}

	// Ordered group with first item claimed, second/third locked
	const orderedPartial = {
		group: orderedGroup,
		items: [
			makeItemWithGifts({
				groupId: orderedGroup.id,
				title: 'Espresso machine',
				price: '699',
				groupSortOrder: 0,
				imageUrl: placeholderImages.square,
				gifts: [makeGift({ gifterId: otherGifter.id, gifter: otherGifter })],
			}),
			makeItemWithGifts({
				id: COMMENTED_ITEM_IDS.grouped,
				groupId: orderedGroup.id,
				title: 'Grinder',
				price: '249',
				groupSortOrder: 1,
				commentCount: 1,
			}),
			makeItemWithGifts({
				groupId: orderedGroup.id,
				title: 'Scale',
				price: '65',
				groupSortOrder: 2,
				imageUrl: placeholderImages.squareSmall,
			}),
		],
	}

	return (
		<div className="flex flex-col">
			<SectionHeader title="Standalone items" note="Items not in any group. Show how a wide range of props render together." />
			{standaloneVariations.map(v => (
				<Fragment key={v.key}>
					<RowLabel label={v.label} />
					{view === 'recipient' ? (
						<ItemEditRow item={v.edit} commentCount={v.edit.commentCount} groups={groups} />
					) : (
						<ItemRow item={v.viewable} />
					)}
				</Fragment>
			))}

			{view === 'gifter' && (
				<>
					<SectionHeader title="Claim states (gifter view only)" note="States that depend on claims." />
					{buyerOnlyVariations.map(v => (
						<Fragment key={v.key}>
							<RowLabel label={v.label} />
							<ItemRow item={v.viewable} />
						</Fragment>
					))}
				</>
			)}

			<SectionHeader title="Grouped: pick-one (or)" note="All-unclaimed state, then one claimed (locks siblings in buyer view)." />
			<RowLabel label="Pick one, no claims yet" />
			{view === 'recipient' ? (
				<GroupBlock
					group={pickOneGroup}
					items={pickOneItems}
					groups={groups}
					isOwner
					onAddItem={() => {}}
					onDelete={() => {}}
					onMoveItem={() => {}}
					onReorder={() => {}}
				/>
			) : (
				<GroupViewBlock group={pickOneGroup} items={pickOnePartial.items.map(i => ({ ...i, gifts: [] }))} />
			)}

			{view === 'gifter' && (
				<>
					<RowLabel label="Pick one, one claimed (siblings locked)" />
					<GroupViewBlock group={pickOnePartial.group} items={pickOnePartial.items} />
				</>
			)}

			<SectionHeader title="Grouped: ordered" note="Items claimed sequentially, later items locked until prior is filled." />
			<RowLabel label="Ordered, no claims yet" />
			{view === 'recipient' ? (
				<GroupBlock
					group={orderedGroup}
					items={orderedItems}
					groups={groups}
					isOwner
					onAddItem={() => {}}
					onDelete={() => {}}
					onMoveItem={() => {}}
					onReorder={() => {}}
				/>
			) : (
				<GroupViewBlock group={orderedGroup} items={orderedPartial.items.map(i => ({ ...i, gifts: [] }))} />
			)}

			{view === 'gifter' && (
				<>
					<RowLabel label="Ordered, first claimed (rest locked)" />
					<GroupViewBlock group={orderedPartial.group} items={orderedPartial.items} />
				</>
			)}

			<SectionHeader title="Edge cases" />
			<RowLabel label="Unnamed pick-one group" />
			{view === 'recipient' ? (
				<GroupBlock
					group={unnamedPickOne}
					items={unnamedItems}
					groups={groups}
					isOwner
					onAddItem={() => {}}
					onDelete={() => {}}
					onMoveItem={() => {}}
					onReorder={() => {}}
				/>
			) : (
				<GroupViewBlock group={unnamedPickOne} items={unnamedItems.map(i => ({ ...i, gifts: [], commentCount: 0 }))} />
			)}

			<RowLabel label="Empty pick-one group" />
			{view === 'recipient' ? (
				<GroupBlock
					group={pickOneGroup}
					items={[]}
					groups={groups}
					isOwner
					onAddItem={() => {}}
					onDelete={() => {}}
					onMoveItem={() => {}}
					onReorder={() => {}}
				/>
			) : (
				<div className="text-xs text-muted-foreground italic">Empty groups are hidden in buyer view.</div>
			)}
		</div>
	)
}

const meta = {
	title: 'Items/Gallery',
	component: Gallery,
	parameters: {
		layout: 'fullscreen',
		session: { user: viewerUser },
		docs: {
			description: {
				component:
					'Comprehensive showcase of item variations. Switch the view control to flip every row between the recipient (owner) view and the gifter (buyer) view.',
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
		view: 'recipient',
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
