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
 * groups, combos, stress) so a reviewer can scan top-to-bottom and compare
 * apples to apples.
 *
 * Items use realistic gift titles, notes, and prices throughout. The thing
 * being varied is what changes between rows in a section; everything else
 * stays representative so the gallery reads like a real list.
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
	mug: 9001,
	wineGlasses: 9002,
	grinder: 9003,
	cookbook: 9004,
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

__setStorybookComments(COMMENTED.mug, [
	makeComment(
		1,
		COMMENTED.mug,
		otherGifter,
		'Any preference on color? I see this comes in cream and slate.',
		new Date(COMMENT_NOW.getTime() - 2 * DAY)
	),
	makeComment(
		2,
		COMMENTED.mug,
		viewerUser,
		"Cream would be perfect, but honestly whichever's in stock works.",
		new Date(COMMENT_NOW.getTime() - 2 * DAY + 90 * 60 * 1000)
	),
])

__setStorybookComments(COMMENTED.wineGlasses, [
	makeComment(
		3,
		COMMENTED.wineGlasses,
		thirdGifter,
		'Happy to split the 6-pack with anyone. I can grab 2 if someone else takes 2.',
		new Date(COMMENT_NOW.getTime() - 3 * DAY)
	),
	makeComment(
		4,
		COMMENTED.wineGlasses,
		fourthGifter,
		"I'll take 2 then. Let's coordinate before the party.",
		new Date(COMMENT_NOW.getTime() - 3 * DAY + 4 * HOUR)
	),
	makeComment(5, COMMENTED.wineGlasses, otherGifter, "Great, I'll cover the last 2. Done!", new Date(COMMENT_NOW.getTime() - 1 * DAY)),
])

__setStorybookComments(COMMENTED.grinder, [
	makeComment(
		6,
		COMMENTED.grinder,
		otherGifter,
		'Is the Encore okay or do you actually want the Virtuoso+? Big price jump.',
		new Date(COMMENT_NOW.getTime() - 6 * HOUR)
	),
])

__setStorybookComments(COMMENTED.cookbook, [
	makeComment(
		7,
		COMMENTED.cookbook,
		thirdGifter,
		'Hardcover or paperback? Hardcover holds up better in the kitchen but it is a lot more expensive.',
		new Date(COMMENT_NOW.getTime() - 12 * HOUR)
	),
	makeComment(
		8,
		COMMENTED.cookbook,
		viewerUser,
		'Hardcover if you can, but paperback is totally fine too.',
		new Date(COMMENT_NOW.getTime() - 10 * HOUR)
	),
	makeComment(
		9,
		COMMENTED.cookbook,
		fourthGifter,
		"I have a coupon from the bookstore, I'll grab it.",
		new Date(COMMENT_NOW.getTime() - 4 * HOUR)
	),
	makeComment(10, COMMENTED.cookbook, otherGifter, 'Perfect, thanks!', new Date(COMMENT_NOW.getTime() - 2 * HOUR)),
])

const stressLongComment = `I was digging through the reviews on this and wanted to share a few things before anyone commits to a particular variant:

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
	makeComment(101, COMMENTED.stressSolo, thirdGifter, stressLongComment, new Date(COMMENT_NOW.getTime() - 4 * DAY - 2 * HOUR)),
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

type Variation = {
	key: string
	label: string
	edit: ItemForEditing
	viewable: ItemWithGifts
}

function pair(edit: Partial<ItemForEditing>, extra: Partial<ItemWithGifts> = {}): { edit: ItemForEditing; viewable: ItemWithGifts } {
	const base = makeItemForEditing(edit)
	return {
		edit: base,
		viewable: makeItemWithGifts({ ...base, gifts: [], commentCount: base.commentCount, ...extra }),
	}
}

// ----- Realistic gift fixtures -----
//
// A small catalogue of realistic gifts to draw from. Each section pulls items
// that fit the variation, mostly without reusing the same one twice in a row,
// so the gallery reads like a real wishlist rather than the same item over
// and over.

const prioritySection: Array<Variation> = [
	{
		key: 'priority-low',
		label: 'low — "if you have leftover budget"',
		...pair({
			title: 'Field Notes 3-pack notebooks',
			url: 'https://fieldnotesbrand.com/products/original-kraft-3-pack',
			price: '12.95',
			priority: 'low',
		}),
	},
	{
		key: 'priority-normal',
		label: 'normal — no priority tab rendered',
		...pair({
			title: 'Stainless steel French press (32 oz)',
			url: 'https://www.bodum.com/products/chambord-french-press-34-oz',
			price: '45',
			priority: 'normal',
		}),
	},
	{
		key: 'priority-high',
		label: 'high — "really want this"',
		...pair({
			title: 'Sony WH-1000XM5 wireless headphones',
			url: 'https://www.sony.com/electronics/headband-headphones/wh-1000xm5',
			price: '399.99',
			priority: 'high',
		}),
	},
	{
		key: 'priority-very-high',
		label: 'very-high — "top of my list"',
		...pair({
			title: 'KitchenAid Artisan stand mixer (5 qt, empire red)',
			url: 'https://www.kitchenaid.com/countertop-appliances/stand-mixers/artisan-series',
			price: '449',
			priority: 'very-high',
		}),
	},
]

const quantitySection: Array<Variation> = [
	{
		key: 'qty-1',
		label: 'quantity 1 — single item, badge hides count',
		...pair({
			title: 'Lodge 12" cast-iron skillet',
			url: 'https://www.lodgecastiron.com/product/seasoned-cast-iron-skillet-12-inch',
			price: '39.99',
			quantity: 1,
		}),
	},
	{
		key: 'qty-3',
		label: 'quantity 3 — small set',
		...pair({
			title: 'Linen napkins (set of 3, natural)',
			url: 'https://www.brooklinen.com/products/linen-napkin',
			price: '24 each',
			quantity: 3,
		}),
	},
	{
		key: 'qty-6',
		label: 'quantity 6 — typical "set of"',
		...pair({
			title: 'Stemless wine glasses',
			url: 'https://www.crateandbarrel.com/stemless-wine-glass',
			price: '12 each',
			quantity: 6,
		}),
	},
	{
		key: 'qty-12',
		label: 'quantity 12 — bulk',
		...pair({
			title: '12 oz wide-mouth mason jars',
			url: 'https://www.target.com/p/ball-12oz-wide-mouth-canning-jars-12pk',
			price: '3.50 each',
			quantity: 12,
		}),
	},
	{
		key: 'qty-99',
		label: 'quantity 99 — high-count edge case',
		...pair({
			title: 'Beeswax tea lights',
			url: null,
			price: '$1 each',
			quantity: 99,
		}),
	},
]

const contentSection: Array<Variation> = [
	{
		key: 'content-basic',
		label: 'title + url + price',
		...pair({
			title: 'Hario V60 ceramic dripper',
			url: 'https://www.hario.com/v60-02-ceramic-dripper-white',
			price: '32',
		}),
	},
	{
		key: 'content-no-price',
		label: 'no price — "ask me"',
		...pair({
			title: 'Vintage leather club chair',
			url: 'https://www.chairish.com/product/leather-club-chair',
			price: null,
		}),
	},
	{
		key: 'content-no-url',
		label: 'no url — "you decide where"',
		...pair({
			title: 'A really good pair of merino wool socks',
			url: null,
			price: '25',
		}),
	},
	{
		key: 'content-no-price-no-url',
		label: 'no price + no url — open-ended request',
		...pair({
			title: 'Sourdough starter from your kitchen',
			url: null,
			price: null,
		}),
	},
	{
		key: 'content-long-title',
		label: 'very long title — should truncate gracefully',
		...pair({
			title:
				"Patagonia Better Sweater 1/4-Zip fleece pullover (women's medium, classic navy with industrial green trim) - 2026 spring season colorway",
			url: 'https://www.patagonia.com/product/womens-better-sweater-fleece-jacket',
			price: '139',
		}),
	},
	{
		key: 'content-long-url',
		label: 'very long url — UrlBadge collapses domain',
		...pair({
			title: 'Cast-iron pizza pan (15")',
			url: 'https://www.amazon.com/dp/B0863TXGM3/ref=cm_sw_r_apan_glt_i_KX2VFY8K3M4G7Q3JX8P1?_encoding=UTF8&psc=1&pf_rd_p=abcd1234-5678&utm_source=storybook&utm_medium=gallery&utm_campaign=long-url-stress',
			price: '54',
		}),
	},
	{
		key: 'content-short-notes',
		label: 'short notes — one-liner preference',
		...pair({
			title: 'Hand-thrown ceramic mug',
			url: 'https://www.etsy.com/listing/handmade-ceramic-mug',
			price: '42',
			notes: 'Any neutral color works, cream or stone preferred over bright glazes.',
		}),
	},
	{
		key: 'content-medium-notes',
		label: 'medium notes — couple of sentences',
		...pair({
			title: 'Field Notes 3-pack notebooks',
			url: 'https://fieldnotesbrand.com',
			price: '12.95',
			notes:
				'The graph-paper version please, not lined or blank. I usually go through a pack every two months so multiples are great if anyone wants to pitch in.',
		}),
	},
	{
		key: 'content-markdown-notes',
		label: 'markdown notes — bullets + links + bold',
		...pair({
			title: 'Cast-iron Dutch oven (5-7 qt)',
			url: 'https://www.staub.com',
			price: '250',
			notes:
				'Strongly prefer **enameled** in sage, cream, or stone. Avoid bright red.\n\nBoth [Staub](https://www.staub.com) and [Le Creuset](https://www.lecreuset.com) are great. The 5.5qt round is the sweet spot for our kitchen.',
		}),
	},
	{
		key: 'content-comments-2',
		label: 'comments (2 users, short thread)',
		...pair({
			id: COMMENTED.mug,
			title: 'Hand-thrown ceramic mug',
			url: 'https://www.etsy.com/listing/handmade-ceramic-mug',
			price: '42',
			commentCount: 2,
		}),
	},
	{
		key: 'content-comments-4',
		label: 'comments (4 users, ongoing thread)',
		...pair({
			id: COMMENTED.cookbook,
			title: 'Salt, Fat, Acid, Heat by Samin Nosrat',
			url: 'https://www.saltfatacidheat.com',
			price: '37',
			commentCount: 4,
		}),
	},
]

const imageSection: Array<Variation> = [
	{
		key: 'image-none',
		label: 'no image',
		...pair({ title: 'Indoor herb garden starter kit', url: null, price: '38', imageUrl: null }),
	},
	{
		key: 'image-square-200',
		label: 'square 200×200 — standard product shot',
		...pair({
			title: 'Le Creuset enameled mug (12 oz)',
			url: 'https://www.lecreuset.com/stoneware-mug',
			price: '24',
			imageUrl: placeholderImages.square,
		}),
	},
	{
		key: 'image-tiny-48',
		label: 'tiny 48×48 — low-res scrape fallback',
		...pair({
			title: 'Beeswax candle (single taper)',
			url: 'https://www.example.com/beeswax-taper',
			price: '8',
			imageUrl: placeholderImages.tiny,
		}),
	},
	{
		key: 'image-tall',
		label: 'tall 140×280 — portrait poster',
		...pair({
			title: 'Vintage botanical print (18×24, fern study)',
			url: 'https://www.society6.com/botanical-fern-print',
			price: '65',
			imageUrl: placeholderImages.tall,
		}),
	},
	{
		key: 'image-wide',
		label: 'wide 320×120 — landscape banner',
		...pair({
			title: 'Reclaimed wood floating shelf (36")',
			url: 'https://www.westelm.com/reclaimed-wood-shelf',
			price: '120',
			imageUrl: placeholderImages.wide,
		}),
	},
	{
		key: 'image-huge',
		label: 'huge 800×600 — unoptimized scrape',
		...pair({
			title: 'Oversized lumbar pillow (14"×36", linen)',
			url: 'https://www.parachutehome.com/products/lumbar-pillow',
			price: '110',
			imageUrl: placeholderImages.huge,
		}),
	},
	{
		key: 'image-plus-notes',
		label: 'image + notes',
		...pair({
			title: 'Waffle-weave bath robe (medium, charcoal)',
			url: 'https://www.brooklinen.com/products/super-plush-robe',
			price: '98',
			imageUrl: placeholderImages.square,
			notes: 'Charcoal or stone please. Avoid white, it shows everything. Medium runs slightly oversized which is what I want.',
		}),
	},
]

const availabilitySection: Array<Variation> = [
	{
		key: 'avail-available',
		label: 'available — normal state',
		...pair({
			title: 'Audio-Technica AT-LP60X turntable',
			url: 'https://www.audio-technica.com/at-lp60x',
			price: '149',
			availability: 'available',
		}),
	},
	{
		key: 'avail-unavailable-with-date',
		label: 'unavailable — sold out, with marked-on date tooltip',
		...pair({
			title: 'Limited-edition vinyl pressing (Phoebe Bridgers - Punisher, blue)',
			url: 'https://www.example.com/limited-vinyl',
			price: '85',
			availability: 'unavailable',
			availabilityChangedAt: new Date('2026-04-12T15:30:00Z'),
		}),
	},
	{
		key: 'avail-unavailable-no-date',
		label: 'unavailable — no date (legacy / hand-flagged)',
		...pair({
			title: 'Discontinued Hario kettle (gooseneck, copper)',
			url: 'https://www.hario.com/buono-kettle-copper',
			price: '110',
			availability: 'unavailable',
			availabilityChangedAt: null,
		}),
	},
]

// Claim-state variations only render in gifter view (they need pre-populated gifts).
const claimStateSection: Array<Variation> = [
	{
		key: 'claim-none',
		label: 'no claims — open',
		...pair({ title: 'Yeti Rambler insulated tumbler (20 oz, black)', url: 'https://www.yeti.com/rambler-20oz', price: '38' }),
	},
	{
		key: 'claim-other',
		label: 'claimed by another (qty 1) — shows their avatar',
		...pair(
			{ title: 'Klean Kanteen 27 oz insulated water bottle', url: 'https://www.kleankanteen.com', price: '36' },
			{ gifts: [makeGift({ quantity: 1 })] }
		),
	},
	{
		key: 'claim-you',
		label: 'claimed by you (qty 1) — "Edit claim" button',
		...pair(
			{ title: 'Hand-knit beanie (alpaca, oatmeal)', url: 'https://www.etsy.com/listing/alpaca-beanie', price: '54' },
			{ gifts: [makeGift({ gifterId: viewerUser.id, gifter: viewerUser, quantity: 1 })] }
		),
	},
	{
		key: 'claim-partial-2',
		label: 'partial (qty 6, 2 gifters covering 4)',
		...pair(
			{ title: 'Riedel stemless wine glasses (set of 6)', url: 'https://www.riedel.com', price: '12 each', quantity: 6 },
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
			{ title: 'Board game night starter set', url: 'https://www.target.com/board-games', price: '30 each', quantity: 4 },
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
		label: 'partial (qty 5, four different gifters)',
		...pair(
			{ title: 'Group housewarming gift kitty', url: null, price: '40 each', quantity: 5 },
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
		key: 'claim-co-gifters',
		label: 'co-gifters (one claim, three names on the gift)',
		...pair(
			{ title: 'Big Green Egg Mini grill', url: 'https://www.biggreenegg.com/mini', price: '479', priority: 'high' },
			{
				gifts: [
					makeGift({
						gifterId: otherGifter.id,
						gifter: otherGifter,
						additionalGifterIds: [thirdGifter.id, fourthGifter.id],
					}),
				],
			}
		),
	},
	{
		key: 'claim-full-others',
		label: 'fully claimed (others) — claim button suppressed, row dimmed',
		...pair(
			{
				title: 'Breville Barista Express espresso machine',
				url: 'https://www.breville.com/barista-express',
				price: '699',
				priority: 'very-high',
			},
			{ gifts: [makeGift({ quantity: 1 })] }
		),
	},
	{
		key: 'claim-full-you',
		label: 'fully claimed (you) — "Edit claim" only',
		...pair(
			{ title: 'Salt, Fat, Acid, Heat (signed hardcover)', url: 'https://www.saltfatacidheat.com', price: '42' },
			{ gifts: [makeGift({ gifterId: viewerUser.id, gifter: viewerUser, quantity: 1 })] }
		),
	},
	{
		key: 'claim-over',
		label: 'over-claimed (qty 2, 3 claimed) — yellow badge',
		...pair(
			{ title: 'Smeg electric kettle (cream)', url: 'https://www.smegusa.com/kettle', price: '180', quantity: 2 },
			{
				quantity: 2,
				gifts: [makeGift({ quantity: 2 }), makeGift({ quantity: 1, gifterId: thirdGifter.id, gifter: thirdGifter })],
			}
		),
	},
	{
		key: 'claim-unavail-with-yours',
		label: 'unavailable but you still have a claim',
		...pair(
			{
				title: 'Limited-edition vinyl pressing (signed)',
				url: 'https://www.example.com/signed-vinyl',
				price: '95',
				availability: 'unavailable',
				availabilityChangedAt: new Date('2026-04-12T15:30:00Z'),
			},
			{
				availability: 'unavailable',
				availabilityChangedAt: new Date('2026-04-12T15:30:00Z'),
				gifts: [makeGift({ gifterId: viewerUser.id, gifter: viewerUser, quantity: 1 })],
			}
		),
	},
	{
		key: 'claim-coordination',
		label: 'with comments (3 users coordinating a 6-pack)',
		...pair(
			{
				id: COMMENTED.wineGlasses,
				title: 'Riedel stemless wine glasses (set of 6)',
				url: 'https://www.riedel.com',
				price: '12 each',
				quantity: 6,
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

// ----- Group fixtures -----

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

// Pick-one (or) scenarios.

const orHeadphones2 = (() => {
	const g = makeGroup({ name: 'Headphones (pick one)' })
	const items = [
		makeItemForEditing({
			groupId: g.id,
			title: 'Sony WH-1000XM5',
			url: 'https://www.sony.com/wh-1000xm5',
			price: '399',
			imageUrl: placeholderImages.square,
		}),
		makeItemForEditing({ groupId: g.id, title: 'Bose QuietComfort Ultra', url: 'https://www.bose.com/qc-ultra', price: '429' }),
	]
	return {
		key: 'or-headphones-2',
		label: '2 options, both unclaimed',
		group: g,
		edit: items,
		view: items.map(i => makeItemWithGifts({ ...i, gifts: [] })),
	} satisfies GroupScenario
})()

const orHeadphones3 = (() => {
	const g = makeGroup({ name: 'Headphones (pick one)' })
	const items = [
		makeItemForEditing({
			groupId: g.id,
			title: 'Sony WH-1000XM5',
			url: 'https://www.sony.com/wh-1000xm5',
			price: '399',
			imageUrl: placeholderImages.square,
		}),
		makeItemForEditing({ groupId: g.id, title: 'Bose QuietComfort Ultra', url: 'https://www.bose.com/qc-ultra', price: '429' }),
		makeItemForEditing({
			groupId: g.id,
			title: 'AirPods Max',
			url: 'https://www.apple.com/airpods-max',
			price: '549',
			imageUrl: placeholderImages.squareSmall,
		}),
	]
	return {
		key: 'or-headphones-3',
		label: '3 options, all unclaimed',
		group: g,
		edit: items,
		view: items.map(i => makeItemWithGifts({ ...i, gifts: [] })),
	} satisfies GroupScenario
})()

const orKnives5 = (() => {
	const g = makeGroup({ name: '8" chef\'s knife (pick one)' })
	const items = [
		makeItemForEditing({ groupId: g.id, title: 'Wüsthof Classic', url: 'https://www.wusthof.com/classic', price: '169' }),
		makeItemForEditing({
			groupId: g.id,
			title: "Misen Chef's Knife",
			url: 'https://misen.com/chefs-knife',
			price: '85',
			imageUrl: placeholderImages.square,
		}),
		makeItemForEditing({ groupId: g.id, title: 'Mac MTH-80', url: 'https://www.macknife.com/mth-80', price: '155' }),
		makeItemForEditing({
			groupId: g.id,
			title: 'Tojiro DP',
			url: 'https://www.tojiro.net/dp',
			price: '95',
			imageUrl: placeholderImages.squareSmall,
		}),
		makeItemForEditing({ groupId: g.id, title: 'Victorinox Fibrox Pro', url: 'https://www.victorinox.com/fibrox-pro', price: '50' }),
	]
	return {
		key: 'or-knives-5',
		label: '5 options, all unclaimed',
		group: g,
		edit: items,
		view: items.map(i => makeItemWithGifts({ ...i, gifts: [] })),
	} satisfies GroupScenario
})()

const orHeadphonesOneClaimed = (() => {
	const g = makeGroup({ name: 'Headphones (pick one)' })
	const items = [
		makeItemForEditing({
			groupId: g.id,
			title: 'Sony WH-1000XM5',
			url: 'https://www.sony.com/wh-1000xm5',
			price: '399',
			imageUrl: placeholderImages.square,
		}),
		makeItemForEditing({ groupId: g.id, title: 'Bose QuietComfort Ultra', url: 'https://www.bose.com/qc-ultra', price: '429' }),
		makeItemForEditing({
			groupId: g.id,
			title: 'AirPods Max',
			url: 'https://www.apple.com/airpods-max',
			price: '549',
			imageUrl: placeholderImages.squareSmall,
		}),
	]
	const view = items.map((i, idx) =>
		makeItemWithGifts({
			...i,
			gifts: idx === 1 ? [makeGift({ gifterId: otherGifter.id, gifter: otherGifter })] : [],
		})
	)
	return {
		key: 'or-headphones-one-claimed',
		label: '3 options, middle one claimed (siblings locked)',
		group: g,
		edit: items,
		view,
	} satisfies GroupScenario
})()

const orHeadphonesYouClaimed = (() => {
	const g = makeGroup({ name: 'Headphones (pick one)' })
	const items = [
		makeItemForEditing({
			groupId: g.id,
			title: 'Sony WH-1000XM5',
			url: 'https://www.sony.com/wh-1000xm5',
			price: '399',
			imageUrl: placeholderImages.square,
		}),
		makeItemForEditing({ groupId: g.id, title: 'Bose QuietComfort Ultra', url: 'https://www.bose.com/qc-ultra', price: '429' }),
		makeItemForEditing({
			groupId: g.id,
			title: 'AirPods Max',
			url: 'https://www.apple.com/airpods-max',
			price: '549',
			imageUrl: placeholderImages.squareSmall,
		}),
	]
	const view = items.map((i, idx) =>
		makeItemWithGifts({
			...i,
			gifts: idx === 0 ? [makeGift({ gifterId: viewerUser.id, gifter: viewerUser })] : [],
		})
	)
	return {
		key: 'or-headphones-you-claimed',
		label: '3 options, you claimed Sony (siblings locked)',
		group: g,
		edit: items,
		view,
	} satisfies GroupScenario
})()

const orBoardGamesHighPriority = (() => {
	const g = makeGroup({ name: 'Two-player board game (pick one)', priority: 'high' })
	const items = [
		makeItemForEditing({
			groupId: g.id,
			title: 'Patchwork',
			url: 'https://www.lookout-spiele.de/patchwork',
			price: '30',
			imageUrl: placeholderImages.square,
		}),
		makeItemForEditing({ groupId: g.id, title: '7 Wonders Duel', url: 'https://www.asmodee.com/7-wonders-duel', price: '32' }),
		makeItemForEditing({
			groupId: g.id,
			title: 'Hive Pocket',
			url: 'https://www.hivegame.com',
			price: '20',
			imageUrl: placeholderImages.squareSmall,
		}),
	]
	return {
		key: 'or-board-games-high',
		label: '3 options, high priority (group-level tab)',
		group: g,
		edit: items,
		view: items.map(i => makeItemWithGifts({ ...i, gifts: [] })),
	} satisfies GroupScenario
})()

const orUnnamed = (() => {
	const g = makeGroup({ name: null })
	const items = [
		makeItemForEditing({ groupId: g.id, title: 'Indoor citrus tree (Meyer lemon)', url: null, price: '85' }),
		makeItemForEditing({
			groupId: g.id,
			title: 'Bonsai starter kit',
			url: 'https://www.brusselbonsai.com/starter-kit',
			price: '110',
			imageUrl: placeholderImages.square,
		}),
	]
	return {
		key: 'or-unnamed-2',
		label: '2 options, unnamed group',
		group: g,
		edit: items,
		view: items.map(i => makeItemWithGifts({ ...i, gifts: [] })),
	} satisfies GroupScenario
})()

const orEmpty = (() => {
	const g = makeGroup({ name: 'Picking out a new lamp' })
	return { key: 'or-empty', label: 'empty group (recipient sees placeholder, gifter hides it)', group: g, edit: [], view: [] }
})()

// Ordered scenarios.

const orderedCake2 = (() => {
	const g = makeGroup({ type: 'order', name: 'Birthday cake supplies (in order)' })
	const items = [
		makeItemForEditing({ groupId: g.id, title: 'Layer cake mix (vanilla)', url: null, price: '6', groupSortOrder: 0 }),
		makeItemForEditing({ groupId: g.id, title: 'Buttercream frosting', url: null, price: '8', groupSortOrder: 1 }),
	]
	return {
		key: 'order-cake-2',
		label: '2 steps, none claimed',
		group: g,
		edit: items,
		view: items.map(i => makeItemWithGifts({ ...i, gifts: [] })),
	} satisfies GroupScenario
})()

const orderedCoffeeSetup4 = (() => {
	const g = makeGroup({ type: 'order', name: 'Coffee setup (in order, beginner → pro)' })
	const items = [
		makeItemForEditing({
			groupId: g.id,
			title: 'Aeropress',
			url: 'https://aeropress.com',
			price: '40',
			groupSortOrder: 0,
			imageUrl: placeholderImages.squareSmall,
		}),
		makeItemForEditing({
			groupId: g.id,
			title: 'Baratza Encore grinder',
			url: 'https://baratza.com/encore',
			price: '170',
			groupSortOrder: 1,
		}),
		makeItemForEditing({ groupId: g.id, title: 'Acaia Pearl scale', url: 'https://acaia.co/pearl', price: '165', groupSortOrder: 2 }),
		makeItemForEditing({
			groupId: g.id,
			title: 'Breville Barista Express',
			url: 'https://breville.com/barista-express',
			price: '699',
			groupSortOrder: 3,
			imageUrl: placeholderImages.square,
		}),
	]
	return {
		key: 'order-coffee-4',
		label: '4 steps, none claimed',
		group: g,
		edit: items,
		view: items.map(i => makeItemWithGifts({ ...i, gifts: [] })),
	} satisfies GroupScenario
})()

const orderedCampingFirstClaimed = (() => {
	const g = makeGroup({ type: 'order', name: 'Camping setup (in order)' })
	const items = [
		makeItemForEditing({
			groupId: g.id,
			title: 'REI Half Dome 2-person tent',
			url: 'https://www.rei.com/half-dome',
			price: '249',
			groupSortOrder: 0,
			imageUrl: placeholderImages.square,
		}),
		makeItemForEditing({
			groupId: g.id,
			title: 'Therm-a-Rest sleeping pad',
			url: 'https://www.thermarest.com',
			price: '95',
			groupSortOrder: 1,
		}),
		makeItemForEditing({
			groupId: g.id,
			title: 'MSR PocketRocket stove',
			url: 'https://www.msrgear.com/pocketrocket',
			price: '50',
			groupSortOrder: 2,
		}),
		makeItemForEditing({
			groupId: g.id,
			title: 'Black Diamond headlamp',
			url: 'https://www.blackdiamondequipment.com/headlamp',
			price: '45',
			groupSortOrder: 3,
		}),
	]
	const view = items.map((i, idx) =>
		makeItemWithGifts({
			...i,
			gifts: idx === 0 ? [makeGift({ gifterId: otherGifter.id, gifter: otherGifter })] : [],
		})
	)
	return {
		key: 'order-camping-first-claimed',
		label: '4 steps, first claimed (rest locked)',
		group: g,
		edit: items,
		view,
	} satisfies GroupScenario
})()

const orderedCampingFirstTwoClaimed = (() => {
	const g = makeGroup({ type: 'order', name: 'Camping setup (in order)' })
	const items = [
		makeItemForEditing({
			groupId: g.id,
			title: 'REI Half Dome 2-person tent',
			url: 'https://www.rei.com/half-dome',
			price: '249',
			groupSortOrder: 0,
			imageUrl: placeholderImages.square,
		}),
		makeItemForEditing({
			groupId: g.id,
			title: 'Therm-a-Rest sleeping pad',
			url: 'https://www.thermarest.com',
			price: '95',
			groupSortOrder: 1,
		}),
		makeItemForEditing({
			groupId: g.id,
			title: 'MSR PocketRocket stove',
			url: 'https://www.msrgear.com/pocketrocket',
			price: '50',
			groupSortOrder: 2,
		}),
		makeItemForEditing({
			groupId: g.id,
			title: 'Black Diamond headlamp',
			url: 'https://www.blackdiamondequipment.com/headlamp',
			price: '45',
			groupSortOrder: 3,
		}),
	]
	const gifters = [otherGifter, thirdGifter]
	const view = items.map((i, idx) =>
		makeItemWithGifts({
			...i,
			gifts: idx < 2 ? [makeGift({ gifterId: gifters[idx].id, gifter: gifters[idx] })] : [],
		})
	)
	return {
		key: 'order-camping-first-two-claimed',
		label: '4 steps, first two claimed (last two locked)',
		group: g,
		edit: items,
		view,
	} satisfies GroupScenario
})()

const orderedPartialQtyStep = (() => {
	const g = makeGroup({ type: 'order', name: 'Dinner party (in order)' })
	const items = [
		makeItemForEditing({ groupId: g.id, title: 'Wine glasses (qty 4)', url: null, price: '12 each', quantity: 4, groupSortOrder: 0 }),
		makeItemForEditing({ groupId: g.id, title: 'Decanter', url: null, price: '45', groupSortOrder: 1 }),
		makeItemForEditing({ groupId: g.id, title: 'Bottle of Barolo', url: null, price: '60', groupSortOrder: 2 }),
	]
	const view: Array<ItemWithGifts> = [
		makeItemWithGifts({ ...items[0], quantity: 4, gifts: [makeGift({ quantity: 2 })] }),
		makeItemWithGifts({ ...items[1], gifts: [] }),
		makeItemWithGifts({ ...items[2], gifts: [] }),
	]
	return {
		key: 'order-dinner-first-partial',
		label: '3 steps, first step half-claimed (later steps still locked)',
		group: g,
		edit: items,
		view,
	} satisfies GroupScenario
})()

const orderedFullyClaimed = (() => {
	const g = makeGroup({ type: 'order', name: 'Birthday morning (in order)' })
	const items = [
		makeItemForEditing({ groupId: g.id, title: 'Fresh croissants from Bourke St', url: null, price: '24', groupSortOrder: 0 }),
		makeItemForEditing({ groupId: g.id, title: 'A really good coffee', url: null, price: '8', groupSortOrder: 1 }),
		makeItemForEditing({ groupId: g.id, title: 'Birthday card from the kids', url: null, price: null, groupSortOrder: 2 }),
	]
	const gifters = [otherGifter, thirdGifter, fourthGifter]
	const view = items.map((i, idx) => makeItemWithGifts({ ...i, gifts: [makeGift({ gifterId: gifters[idx].id, gifter: gifters[idx] })] }))
	return { key: 'order-birthday-full', label: '3 steps, all claimed', group: g, edit: items, view } satisfies GroupScenario
})()

const orderedCoffeeVeryHighPriority = (() => {
	const g = makeGroup({ type: 'order', name: 'Espresso bar buildout (in order)', priority: 'very-high' })
	const items = [
		makeItemForEditing({
			groupId: g.id,
			title: 'Breville Barista Express',
			url: 'https://breville.com/barista-express',
			price: '699',
			groupSortOrder: 0,
			imageUrl: placeholderImages.square,
		}),
		makeItemForEditing({
			id: COMMENTED.grinder,
			groupId: g.id,
			title: 'Baratza Encore grinder',
			url: 'https://baratza.com/encore',
			price: '170',
			groupSortOrder: 1,
			commentCount: 1,
		}),
		makeItemForEditing({
			groupId: g.id,
			title: 'Acaia Pearl scale',
			url: 'https://acaia.co/pearl',
			price: '165',
			groupSortOrder: 2,
			imageUrl: placeholderImages.squareSmall,
		}),
	]
	return {
		key: 'order-coffee-very-high',
		label: '3 steps, very-high priority + commented middle step',
		group: g,
		edit: items,
		view: items.map(i => makeItemWithGifts({ ...i, gifts: [] })),
	} satisfies GroupScenario
})()

const pickOneScenarios: Array<GroupScenario> = [
	orHeadphones2,
	orHeadphones3,
	orKnives5,
	orHeadphonesOneClaimed,
	orHeadphonesYouClaimed,
	orBoardGamesHighPriority,
	orUnnamed,
	orEmpty,
]

const orderedScenarios: Array<GroupScenario> = [
	orderedCake2,
	orderedCoffeeSetup4,
	orderedCampingFirstClaimed,
	orderedCampingFirstTwoClaimed,
	orderedPartialQtyStep,
	orderedFullyClaimed,
	orderedCoffeeVeryHighPriority,
]

// Pool of groups exposed to the recipient's group-edit dropdowns. Just needs
// to be non-empty so the menu has things to render.
const groupsForMenu: Array<GroupSummary> = [
	makeGroup({ id: 1, name: 'Pick one', type: 'or' }),
	makeGroup({ id: 2, name: 'Ordered', type: 'order', priority: 'high' }),
]

// ----- Combo section -----
// Realistic rows that cross multiple variation axes at once, so the gallery
// shows what a "normal" list actually looks like alongside the single-axis
// sections above.

const comboSection: Array<Variation> = [
	{
		key: 'combo-priority-high-with-image-and-notes',
		label: 'high priority + image + notes + url',
		...pair({
			title: "Patagonia Better Sweater fleece (women's M, classic navy)",
			url: 'https://www.patagonia.com/product/womens-better-sweater-fleece-jacket',
			price: '139',
			priority: 'high',
			imageUrl: placeholderImages.square,
			notes: "Classic navy if possible. Last year's industrial green is a close second. **Medium**, runs true to size.",
		}),
	},
	{
		key: 'combo-low-priority-tiny-image-no-notes',
		label: 'low priority + tiny image + no notes',
		...pair({
			title: 'Field Notes 3-pack (graph paper)',
			url: 'https://fieldnotesbrand.com',
			price: '12.95',
			priority: 'low',
			imageUrl: placeholderImages.tiny,
		}),
	},
	{
		key: 'combo-very-high-qty-2-partial',
		label: 'very-high priority + qty 2 + partial claim (1 of 2)',
		...pair(
			{
				title: 'Adirondack chair (cedar)',
				url: 'https://www.lloydflanders.com/adirondack',
				price: '425',
				priority: 'very-high',
				quantity: 2,
				imageUrl: placeholderImages.square,
				notes: 'We have one already and would love a matching second for the deck.',
			},
			{
				quantity: 2,
				gifts: [makeGift({ quantity: 1, gifterId: thirdGifter.id, gifter: thirdGifter })],
			}
		),
	},
	{
		key: 'combo-qty-6-fully-claimed-by-many',
		label: 'qty 6 + fully claimed by 3 gifters + thread',
		...pair(
			{
				id: COMMENTED.wineGlasses,
				title: 'Riedel stemless wine glasses (set of 6)',
				url: 'https://www.riedel.com',
				price: '12 each',
				quantity: 6,
				priority: 'normal',
				commentCount: 3,
			},
			{
				quantity: 6,
				commentCount: 3,
				gifts: [
					makeGift({ quantity: 2, gifterId: thirdGifter.id, gifter: thirdGifter }),
					makeGift({ quantity: 2, gifterId: fourthGifter.id, gifter: fourthGifter }),
					makeGift({ quantity: 2, gifterId: otherGifter.id, gifter: otherGifter }),
				],
			}
		),
	},
	{
		key: 'combo-unavailable-with-image-and-notes',
		label: 'unavailable + image + notes + your existing claim',
		...pair(
			{
				title: 'Discontinued Hario kettle (gooseneck, copper)',
				url: 'https://www.hario.com/buono-kettle-copper',
				price: '110',
				imageUrl: placeholderImages.square,
				notes: 'I know this is out of stock now, but if anyone spots one second-hand please grab it.',
				availability: 'unavailable',
				availabilityChangedAt: new Date('2026-03-30T09:00:00Z'),
			},
			{
				availability: 'unavailable',
				availabilityChangedAt: new Date('2026-03-30T09:00:00Z'),
				gifts: [makeGift({ gifterId: viewerUser.id, gifter: viewerUser, quantity: 1 })],
			}
		),
	},
	{
		key: 'combo-co-gifters-with-notes',
		label: 'co-gifters + notes + image (group gift)',
		...pair(
			{
				title: 'Peloton Bike+ (with 1-year membership)',
				url: 'https://www.onepeloton.com/bike-plus',
				price: '2,495',
				priority: 'very-high',
				imageUrl: placeholderImages.square,
				notes: 'A *huge* ask, totally a "group of friends chips in" gift. Refurbished is great too.',
			},
			{
				gifts: [
					makeGift({
						gifterId: otherGifter.id,
						gifter: otherGifter,
						additionalGifterIds: [thirdGifter.id, fourthGifter.id, viewerUser.id],
					}),
				],
			}
		),
	},
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
		label: 'overload — solo, no claims, 5 comments, very-high priority',
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
		label: 'overload — qty 12, partially claimed by 3, 8-message thread',
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
		label: 'overload — qty 8, fully claimed by 4 gifters, 7-message thread',
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
			<SectionHeader title="Priority" note="Coloured tab on the left edge. Normal renders no tab." />
			<VariationList variations={prioritySection} view={view} />

			<SectionHeader title="Quantity" note="Badge variants for different total quantities. No claims; remaining equals quantity." />
			<VariationList variations={quantitySection} view={view} />

			<SectionHeader
				title="Content"
				note="Title / url / price / notes / comment thread combinations. Image held constant (none) so the focus stays on text content."
			/>
			<VariationList variations={contentSection} view={view} />

			<SectionHeader title="Image" note="Different image sizes plus image + notes side by side." />
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

			<SectionHeader title="Group: pick-one (or)" note="Sizes 2 / 3 / 5, claim states, priority-on-group, unnamed and empty edge cases." />
			<GroupList scenarios={pickOneScenarios} view={view} />

			<SectionHeader
				title="Group: ordered"
				note="Step counts 2-4, sequential claim states, a step with qty>1 partially claimed, and a very-high-priority group-level tab."
			/>
			<GroupList scenarios={orderedScenarios} view={view} />

			<SectionHeader
				title="Realistic combos"
				note="Rows that cross multiple axes at once. Use to sanity-check that real-list density still reads cleanly."
			/>
			<VariationList variations={comboSection} view={view} />

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
