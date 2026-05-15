import type {
	AdminIntelligenceData,
	IntelligencePageData,
	IntelligenceRunSummary,
	ItemRef,
	ListRef,
	Recommendation,
	RunDetailData,
} from './types'

function daysAgo(n: number): Date {
	const d = new Date()
	d.setDate(d.getDate() - n)
	return d
}

function hoursAgo(n: number): Date {
	const d = new Date()
	d.setHours(d.getHours() - n)
	return d
}

const userSubject = { kind: 'user', name: 'Shawn', image: null } as const
const dependentSubject = { kind: 'dependent', name: 'Mochi', image: null } as const

const wishlistChristmas: ListRef = {
	id: 'list-christmas',
	name: 'Christmas 2026',
	type: 'christmas',
	isPrivate: false,
	subject: userSubject,
}
const wishlistGeneric: ListRef = {
	id: 'list-wishlist',
	name: 'My Wishlist',
	type: 'wishlist',
	isPrivate: false,
	subject: userSubject,
}
const birthdayList: ListRef = {
	id: 'list-bday',
	name: 'Birthday',
	type: 'birthday',
	isPrivate: false,
	subject: userSubject,
}
const dependentList: ListRef = {
	id: 'list-mochi',
	name: 'Mochi Wishlist',
	type: 'wishlist',
	isPrivate: false,
	subject: dependentSubject,
}
const tinyList: ListRef = {
	id: 'list-tiny',
	name: 'Random Stuff',
	type: 'wishlist',
	isPrivate: true,
	subject: userSubject,
}

const item = (id: string, title: string, list: ListRef, ageDays: number): ItemRef => ({
	id,
	title,
	listId: list.id,
	listName: list.name,
	updatedAt: daysAgo(ageDays),
	availability: 'available',
})

const staleHeadphones = item('item-headphones', 'Bluetooth headphones (Sony WH-1000XM4)', wishlistGeneric, 380)
const staleKettle = item('item-kettle', 'Electric kettle, 1.7L', wishlistGeneric, 410)
const staleBook = item('item-book', 'The Pragmatic Programmer (1999 edition)', wishlistGeneric, 520)
const dupeHeadphones1 = item('item-dup-1', 'Sony WH-1000XM4 over-ear headphones', wishlistChristmas, 30)
const dupeHeadphones2 = item('item-dup-2', 'Sony noise-cancelling headphones (XM4)', birthdayList, 60)

// ─── Setup ───────────────────────────────────────────────────────────────────

const recPrimaryList: Recommendation = {
	id: 'rec-1',
	analyzerId: 'primary-list',
	kind: 'no-primary',
	severity: 'important',
	status: 'active',
	title: 'Pick a primary list',
	body: 'You have 4 active lists but none are marked primary. Your primary list is the one shoppers see first - choosing one helps gifters know where to focus.',
	createdAt: hoursAgo(2),
	interaction: {
		kind: 'list-picker',
		saveLabel: 'Save as primary',
		eligibleLists: [wishlistGeneric, wishlistChristmas, birthdayList, tinyList],
	},
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

const recStaleItems: Recommendation = {
	id: 'rec-2',
	analyzerId: 'stale-items',
	kind: 'old-items',
	severity: 'suggest',
	status: 'active',
	title: 'Clean up old items in My Wishlist',
	body: "These 3 items haven't been edited in over a year. If you're no longer interested, removing them keeps your list focused on what matters today.",
	createdAt: hoursAgo(2),
	actions: [
		{
			label: 'Open list',
			description: 'Jump to My Wishlist so you can edit or remove these items one at a time.',
			intent: 'do',
			nav: { listId: 'wishlist-generic' },
		},
		{
			label: 'Delete',
			description: 'Delete "Bluetooth headphones (Sony WH-1000XM4)".',
			intent: 'destructive',
			confirmCopy: 'Permanently delete "Bluetooth headphones (Sony WH-1000XM4)" from My Wishlist? This cannot be undone.',
			apply: { kind: 'delete-items', listId: 'wishlist-generic', itemIds: ['item-headphones'] },
		},
		{
			label: 'Delete',
			description: 'Delete "Electric kettle, 1.7L".',
			intent: 'destructive',
			confirmCopy: 'Permanently delete "Electric kettle, 1.7L" from My Wishlist? This cannot be undone.',
			apply: { kind: 'delete-items', listId: 'wishlist-generic', itemIds: ['item-kettle'] },
		},
		{
			label: 'Delete',
			description: 'Delete "The Pragmatic Programmer (1999 edition)".',
			intent: 'destructive',
			confirmCopy: 'Permanently delete "The Pragmatic Programmer (1999 edition)" from My Wishlist? This cannot be undone.',
			apply: { kind: 'delete-items', listId: 'wishlist-generic', itemIds: ['item-book'] },
		},
	],
	dismissDescription: "Hide this recommendation. We won't suggest it again unless these items change.",
	affected: {
		noun: 'items',
		count: 3,
		lines: [
			'Bluetooth headphones (Sony WH-1000XM4) · last edited 380 days ago',
			'Electric kettle, 1.7L · last edited 410 days ago',
			'The Pragmatic Programmer (1999 edition) · last edited 520 days ago',
		],
		listChips: [wishlistGeneric],
	},
	relatedItems: [staleHeadphones, staleKettle, staleBook],
}

const recStaleSingle: Recommendation = {
	id: 'rec-3',
	analyzerId: 'stale-items',
	kind: 'old-item',
	severity: 'info',
	status: 'active',
	title: 'One old item on Mochi Wishlist',
	body: '"Salmon treats" was added over a year ago and hasn\'t been edited since. If Mochi is still into them, no action needed - this is just a heads-up.',
	createdAt: hoursAgo(2),
	actions: [
		{
			label: 'Open item',
			description: 'Jump to the item editor on Mochi Wishlist.',
			intent: 'do',
			nav: { listId: 'dependent-list', itemId: 'item-treats' },
		},
		{
			label: 'Delete item',
			description: 'Permanently delete this item. It has no claims, so no gifters are affected.',
			intent: 'destructive',
			confirmCopy: 'Permanently delete "Salmon treats" from Mochi Wishlist?',
		},
	],
	affected: {
		noun: 'item',
		count: 1,
		lines: ['Salmon treats · last edited 400 days ago'],
		listChips: [dependentList],
	},
	relatedItems: [item('item-treats', 'Salmon treats', dependentList, 400)],
}

// ─── Organize ────────────────────────────────────────────────────────────────

const recDuplicates: Recommendation = {
	id: 'rec-4',
	analyzerId: 'duplicates',
	kind: 'cross-list-duplicate',
	severity: 'suggest',
	status: 'active',
	title: 'Same item on two lists',
	body: "The Sony XM4 headphones appear on both Christmas 2026 and Birthday. If a gifter claims one, the other may still get bought, so it's safer to pick one home.",
	createdAt: hoursAgo(2),
	actions: [
		{
			label: 'Open Christmas 2026',
			description: 'Jump to Christmas 2026 so you can review or delete this copy.',
			intent: 'do',
			nav: { listId: 'wishlist-christmas', itemId: 'item-dupe1' },
		},
		{
			label: 'Open Birthday',
			description: 'Jump to Birthday so you can review or delete this copy.',
			intent: 'do',
			nav: { listId: 'birthday-list', itemId: 'item-dupe2' },
		},
		{
			label: 'Keep both',
			description: "These are actually different items. We won't flag this pair again.",
			intent: 'noop',
		},
	],
	affected: {
		noun: 'items',
		count: 2,
		lines: ['Sony WH-1000XM4 over-ear headphones · on Christmas 2026', 'Sony noise-cancelling headphones (XM4) · on Birthday'],
		listChips: [wishlistChristmas, birthdayList],
	},
	relatedItems: [dupeHeadphones1, dupeHeadphones2],
}

const recGroupingDestructive: Recommendation = {
	id: 'rec-5',
	analyzerId: 'grouping',
	kind: 'merge-tiny',
	severity: 'suggest',
	status: 'active',
	title: 'Merge Random Stuff into My Wishlist?',
	body: '"Random Stuff" only has 2 items and they overlap in theme with My Wishlist. Combining them gives shoppers one place to look instead of hunting across lists.',
	createdAt: hoursAgo(2),
	actions: [
		{
			label: 'Merge lists',
			description:
				'Move both items from Random Stuff to My Wishlist and delete Random Stuff. Both are wishlists, so any claims are preserved.',
			intent: 'destructive',
			confirmCopy:
				'Move both items from "Random Stuff" into "My Wishlist" and delete "Random Stuff"? Both lists are wishlists, so claims are preserved.',
		},
		{
			label: 'Keep separate',
			description: "Leave both lists as they are. We won't suggest merging this pair again.",
			intent: 'noop',
		},
	],
	affected: {
		noun: 'lists',
		count: 2,
		lines: ['Random Stuff (2 items) → merge into', 'My Wishlist (38 items, kept)'],
		listChips: [tinyList, wishlistGeneric],
	},
	relatedLists: [tinyList, wishlistGeneric],
}

const recGroupingTypeCrossing: Recommendation = {
	id: 'rec-6',
	analyzerId: 'grouping',
	kind: 'split-suggest',
	severity: 'suggest',
	status: 'active',
	title: 'My Wishlist is getting long',
	body: '"My Wishlist" has 38 items, which makes it harder for shoppers to scan. We noticed clusters around "Kitchen" and "Books" that could each become their own list.',
	createdAt: hoursAgo(2),
	actions: [
		{
			label: 'Propose a split',
			description: "Ask AI to draft list names and which items go where. You'll see the proposal and approve it before anything moves.",
			intent: 'ai',
		},
		{
			label: 'Leave as is',
			description: "Keep My Wishlist as one list. We won't suggest splitting it again until it changes.",
			intent: 'noop',
		},
	],
	affected: {
		noun: 'list',
		count: 1,
		lines: ['My Wishlist · 38 items', 'Detected clusters: Kitchen (~8 items), Books (~6 items)'],
		listChips: [wishlistGeneric],
	},
	relatedLists: [wishlistGeneric],
}

const recGroupingDependent: Recommendation = {
	id: 'rec-7',
	analyzerId: 'grouping',
	kind: 'orphan-list',
	severity: 'info',
	status: 'active',
	title: 'Mochi Wishlist is sparse',
	body: 'Mochi Wishlist only has 1 active item. Gifters tend to skip lists with very few options - adding a few more ideas gives them something to choose from.',
	createdAt: hoursAgo(2),
	actions: [
		{
			label: 'Open list',
			description: "Jump to Mochi Wishlist's editor so you can add items yourself.",
			intent: 'do',
			nav: { listId: 'dependent-list' },
		},
		{
			label: 'Suggest items',
			description: "Ask AI to draft a few ideas based on the existing item and Mochi's name. You'll review before adding.",
			intent: 'ai',
		},
	],
	affected: {
		noun: 'list',
		count: 1,
		lines: ['Mochi Wishlist · 1 active item'],
		listChips: [dependentList],
	},
	relatedLists: [dependentList],
}

// Bundled per-list rec: one card listing every item missing a price on
// `My Wishlist`. Each sub-row has its own Edit nav + Skip action; the
// bundle has an "Open list" link + a bundle-level Dismiss.
const recMissingPriceBundle: Recommendation = {
	id: 'rec-bundle-1',
	analyzerId: 'missing-price',
	kind: 'missing-price',
	severity: 'info',
	status: 'active',
	title: 'Add prices to items on My Wishlist',
	body: 'These items have links but no price set. Filling them in helps gifters budget and surfaces them on price-filtered views. Open the list to fix several at once, or use Edit / Skip on each item below.',
	createdAt: hoursAgo(1),
	subItems: [
		{
			id: 'item-price-1',
			title: 'Anker 737 Power Bank',
			nav: { listId: wishlistGeneric.id, itemId: 'item-price-1', openEdit: true },
		},
		{
			id: 'item-price-2',
			title: 'Logitech MX Keys',
			nav: { listId: wishlistGeneric.id, itemId: 'item-price-2', openEdit: true },
		},
		{
			id: 'item-price-3',
			title: 'Bose QuietComfort Earbuds II',
			nav: { listId: wishlistGeneric.id, itemId: 'item-price-3', openEdit: true },
		},
	],
	bundleNav: { listId: wishlistGeneric.id },
	dismissDescription: "Hide this suggestion for this list. We won't surface it again unless something changes about these items.",
	affected: {
		noun: 'items',
		count: 3,
		lines: ['My Wishlist · 3 items missing a price'],
		listChips: [wishlistGeneric],
	},
	relatedLists: [wishlistGeneric],
}

// Bundle with one sub-item already dismissed by the user. The middle item
// is skipped, so only the first and third render. The dismiss-set
// preserves the order of the remaining items.
const recClothingBundleWithSkipped: Recommendation = {
	id: 'rec-bundle-2',
	analyzerId: 'clothing-prefs',
	kind: 'clothing-missing-prefs',
	severity: 'suggest',
	status: 'active',
	title: 'Pin down sizing on items on Christmas 2026',
	body: "These clothing items don't have a size or color pinned down. Gifters can guess wrong without one - the model's per-item notes are below.",
	createdAt: hoursAgo(2),
	subItems: [
		{
			id: 'item-cloth-1',
			title: 'Patagonia Nano Puff jacket',
			detail: "No size is set and 'jacket' covers a 6-size range; pin one down before a gifter shops.",
			nav: { listId: wishlistChristmas.id, itemId: 'item-cloth-1', openEdit: true },
		},
		{
			id: 'item-cloth-2',
			title: 'Smartwool merino crew socks',
			detail: 'Sock size and color are both missing.',
			nav: { listId: wishlistChristmas.id, itemId: 'item-cloth-2', openEdit: true },
		},
		{
			id: 'item-cloth-3',
			title: 'Nike Pegasus 41',
			detail: 'Pegasus is sized like a regular shoe but a half-size note keeps gifters from guessing.',
			nav: { listId: wishlistChristmas.id, itemId: 'item-cloth-3', openEdit: true },
		},
	],
	dismissedSubItemIds: ['item-cloth-2'],
	bundleNav: { listId: wishlistChristmas.id },
	dismissDescription: "Hide this suggestion for this list. We won't surface it again unless something changes about these items.",
	affected: {
		noun: 'items',
		count: 3,
		lines: ['Christmas 2026 · 3 clothing items missing sizing or color'],
		listChips: [wishlistChristmas],
	},
	relatedLists: [wishlistChristmas],
}

// Bundle that overflows the 25-row cap so the "Show all" expander renders.
const recMissingImageOverflowBundle: Recommendation = {
	id: 'rec-bundle-3',
	analyzerId: 'missing-image',
	kind: 'missing-image-selection',
	severity: 'info',
	status: 'active',
	title: 'Pick images for items on My Wishlist',
	body: 'These items have candidate images we scraped from their linked pages, but none of those have been picked yet. Open the list to choose images for several at once, or use Edit / Skip on each item below.',
	createdAt: hoursAgo(2),
	subItems: Array.from({ length: 30 }, (_, i) => ({
		id: `item-img-${i + 1}`,
		title: `Item ${i + 1} on the wishlist`,
		detail: `${(i % 6) + 1} candidate image${i % 6 === 0 ? '' : 's'} available`,
		nav: { listId: wishlistGeneric.id, itemId: `item-img-${i + 1}`, openEdit: true } as const,
	})),
	bundleNav: { listId: wishlistGeneric.id },
	dismissDescription: "Hide this suggestion for this list. We won't surface it again unless something changes about these items.",
	affected: {
		noun: 'items',
		count: 30,
		lines: ['My Wishlist · 30 items with unselected images'],
		listChips: [wishlistGeneric],
	},
	relatedLists: [wishlistGeneric],
}

// Relation-labels rec uses the path-shaped nav variant to point at /settings/
// (no list scope at all). Kept in fixtures so the story for the path-nav
// variant has a representative payload.
const recRelationLabels: Recommendation = {
	id: 'rec-8',
	analyzerId: 'primary-list',
	kind: 'set-relation-labels',
	severity: 'suggest',
	status: 'active',
	title: 'Tell us who you shop for',
	body: "Mothers won't see this list, but tagging the mothers you shop for lets us send you a reminder before the holiday and surface their lists in Suggestions. Head to your profile to add them.",
	createdAt: hoursAgo(2),
	actions: [
		{
			label: 'Open settings',
			description: 'Add the people you shop for in your profile.',
			intent: 'do',
			nav: { path: '/settings/' },
		},
	],
	dismissDescription: 'Hide this reminder until next year.',
}

const lastRun: IntelligenceRunSummary = {
	id: 'run-current',
	startedAt: hoursAgo(2),
	finishedAt: hoursAgo(2),
	status: 'success',
	trigger: 'cron',
	tokensIn: 4200,
	tokensOut: 850,
	estimatedCostUsd: 0.014,
}

// ─── List hygiene (calendar-aware) ───────────────────────────────────────────

const oldChristmasList: ListRef = {
	id: 'list-old-xmas',
	name: 'Christmas 2025',
	type: 'christmas',
	isPrivate: false,
	subject: userSubject,
}

const privateBirthdayList: ListRef = {
	id: 'list-priv-bday',
	name: 'Birthday 2026',
	type: 'birthday',
	isPrivate: true,
	subject: userSubject,
}

const holidayEasterList: ListRef = {
	id: 'list-easter',
	name: 'Easter Plans',
	type: 'holiday',
	isPrivate: false,
	subject: userSubject,
}

const wishlistPrimary: ListRef = {
	id: 'list-primary',
	name: 'My Wishlist',
	type: 'wishlist',
	isPrivate: false,
	subject: userSubject,
}

const targetBirthdayList: ListRef = {
	id: 'list-target-bday',
	name: 'Birthday 2026',
	type: 'birthday',
	isPrivate: false,
	subject: userSubject,
}

const dependentPrivateBirthday: ListRef = {
	id: 'list-mochi-bday',
	name: 'Birthday 2026',
	type: 'birthday',
	isPrivate: true,
	subject: dependentSubject,
}

// Convert public non-matching list (important). User has a public
// christmas list and birthday is approaching.
const recConvertPublicForBirthday: Recommendation = {
	id: 'rec-hygiene-convert-bday',
	analyzerId: 'list-hygiene' as Recommendation['analyzerId'],
	kind: 'convert-public-list',
	severity: 'important',
	status: 'active',
	title: 'Reshape "Christmas 2025" for Birthday',
	body: 'Your Birthday is in 14 days and the most-attention-getting list "Christmas 2025" isn\'t shaped for it. Convert it to a birthday list and rename it to "Birthday 2026" so gifts auto-reveal on the right day.',
	createdAt: hoursAgo(3),
	actions: [
		{
			label: 'Convert to birthday',
			description: "Change the list's type and rename it. Items and existing claims stay put.",
			intent: 'do',
			apply: {
				kind: 'convert-list',
				listId: oldChristmasList.id,
				newType: 'birthday',
				newName: 'Birthday 2026',
			},
		},
	],
	affected: { noun: 'list', count: 1, lines: [oldChristmasList.name], listChips: [oldChristmasList] },
	relatedLists: [oldChristmasList],
}

// Convert public non-matching list — christmas variant (user has wishlist
// only, christmas approaching).
const recConvertPublicForChristmas: Recommendation = {
	id: 'rec-hygiene-convert-xmas',
	analyzerId: 'list-hygiene' as Recommendation['analyzerId'],
	kind: 'convert-public-list',
	severity: 'important',
	status: 'active',
	title: 'Reshape "My Wishlist" for Christmas',
	body: 'Your Christmas is in 24 days and the most-attention-getting list "My Wishlist" isn\'t shaped for it. Convert it to a Christmas list and rename it to "Christmas 2026" so gifts auto-reveal on the right day.',
	createdAt: hoursAgo(3),
	actions: [
		{
			label: 'Convert to Christmas',
			description: "Change the list's type and rename it. Items and existing claims stay put.",
			intent: 'do',
			apply: {
				kind: 'convert-list',
				listId: wishlistGeneric.id,
				newType: 'christmas',
				newName: 'Christmas 2026',
			},
		},
	],
	affected: { noun: 'list', count: 1, lines: [wishlistGeneric.name], listChips: [wishlistGeneric] },
	relatedLists: [wishlistGeneric],
}

// Custom-holiday rebind variant (holiday list bound to a past event, the
// next one's a different customHoliday).
const recConvertHolidayRebind: Recommendation = {
	id: 'rec-hygiene-rebind',
	analyzerId: 'list-hygiene' as Recommendation['analyzerId'],
	kind: 'convert-public-list',
	severity: 'important',
	status: 'active',
	title: 'Reshape "Easter Plans" for Halloween',
	body: 'Your Halloween is in 30 days and the most-attention-getting list "Easter Plans" is bound to last year\'s Easter. Re-bind it to Halloween and rename it to "Halloween 2026" so gifts auto-reveal on the right day.',
	createdAt: hoursAgo(4),
	actions: [
		{
			label: 'Re-bind to Halloween',
			description: 'Change the holiday this list is bound to and rename it. Items and existing claims stay put.',
			intent: 'do',
			apply: {
				kind: 'convert-list',
				listId: holidayEasterList.id,
				newType: 'holiday',
				newName: 'Halloween 2026',
				newCustomHolidayId: 'halloween-id',
			},
		},
	],
	affected: { noun: 'list', count: 1, lines: [holidayEasterList.name], listChips: [holidayEasterList] },
	relatedLists: [holidayEasterList],
}

// Make-private-list-public (suggest). User has a private birthday list
// that's ready to publicize.
const recMakePrivateListPublic: Recommendation = {
	id: 'rec-hygiene-go-public',
	analyzerId: 'list-hygiene' as Recommendation['analyzerId'],
	kind: 'make-private-list-public',
	severity: 'suggest',
	status: 'active',
	title: 'Make "Birthday 2026" public for Birthday',
	body: 'Your Birthday is in 14 days. "Birthday 2026" is set up for the event but it\'s private — gifters can\'t see it. Making it public lets people shop from it.',
	createdAt: hoursAgo(2),
	actions: [
		{
			label: 'Make public',
			description: 'Flip the list to public so gifters can find it.',
			intent: 'do',
			apply: { kind: 'change-list-privacy', listId: privateBirthdayList.id, isPrivate: false },
		},
	],
	affected: { noun: 'list', count: 1, lines: [privateBirthdayList.name], listChips: [privateBirthdayList] },
	relatedLists: [privateBirthdayList],
}

// Create-event-list (suggest). User has no list for the upcoming event.
const recCreateEventList: Recommendation = {
	id: 'rec-hygiene-create-bday',
	analyzerId: 'list-hygiene' as Recommendation['analyzerId'],
	kind: 'create-event-list',
	severity: 'suggest',
	status: 'active',
	title: 'Create a birthday list for Birthday',
	body: "Your Birthday is in 14 days, and there's no list set up to auto-reveal gifts on that day. Want to scaffold one?",
	createdAt: hoursAgo(1),
	actions: [
		{
			label: 'Create "Birthday 2026"',
			description: 'Creates a private list pre-named for the event. You can flip it to public once you add some items.',
			intent: 'do',
			apply: {
				kind: 'create-list',
				type: 'birthday',
				name: 'Birthday 2026',
				isPrivate: true,
				setAsPrimary: true,
			},
		},
	],
}

// Dependent-subject create-event-list variant.
const recCreateEventListDependent: Recommendation = {
	id: 'rec-hygiene-create-bday-dep',
	analyzerId: 'list-hygiene' as Recommendation['analyzerId'],
	kind: 'create-event-list',
	severity: 'suggest',
	status: 'active',
	title: 'Create a birthday list for Birthday',
	body: "Mochi's Birthday is in 7 days, and there's no list set up to auto-reveal gifts on that day. Want to scaffold one?",
	createdAt: hoursAgo(1),
	actions: [
		{
			label: 'Create "Birthday 2026"',
			description: 'Creates a private list pre-named for the event. You can flip it to public once you add some items.',
			intent: 'do',
			apply: {
				kind: 'create-list',
				type: 'birthday',
				name: 'Birthday 2026',
				isPrivate: true,
				setAsPrimary: false,
				subjectDependentId: 'mochi-id',
			},
		},
	],
	relatedLists: [dependentPrivateBirthday],
}

// Wrong-primary-for-event (suggest). User-subject only.
const recWrongPrimaryForEvent: Recommendation = {
	id: 'rec-hygiene-set-primary',
	analyzerId: 'list-hygiene' as Recommendation['analyzerId'],
	kind: 'wrong-primary-for-event',
	severity: 'suggest',
	status: 'active',
	title: 'Set "Birthday 2026" as your primary for Birthday',
	body: 'Your Birthday is in 14 days but "Birthday 2026" isn\'t your primary list. Making it primary means new items default into it.',
	createdAt: hoursAgo(1),
	actions: [
		{
			label: 'Set as primary',
			description: 'Promotes this list to primary; the current primary is demoted.',
			intent: 'do',
			apply: { kind: 'set-primary-list', listId: targetBirthdayList.id },
		},
	],
	affected: { noun: 'list', count: 1, lines: [targetBirthdayList.name], listChips: [targetBirthdayList] },
	relatedLists: [targetBirthdayList],
}

// === Duplicate-event-lists merge recs (phase 2) ===
// Two-list wishlist cluster: older list forgotten (last touched > 1y),
// newer one created last week.
const mergeSurvivorWishlist: ListRef = {
	id: 'list-wish-keep',
	name: 'New Wishlist',
	type: 'wishlist',
	isPrivate: false,
	subject: userSubject,
}
const mergeSourceWishlist: ListRef = {
	id: 'list-wish-old',
	name: 'Old Wishlist',
	type: 'wishlist',
	isPrivate: false,
	subject: userSubject,
}
const mergeExtraSourceWishlist: ListRef = {
	id: 'list-wish-old-2',
	name: 'Wishlist 2024',
	type: 'wishlist',
	isPrivate: false,
	subject: userSubject,
}

const recMergeTwoWishlists: Recommendation = {
	id: 'rec-hygiene-merge-2',
	analyzerId: 'list-hygiene' as Recommendation['analyzerId'],
	kind: 'duplicate-event-lists',
	severity: 'suggest',
	status: 'active',
	title: 'Merge 1 older list into "New Wishlist"',
	body: 'You have 2 active wishlists. "New Wishlist" was created most recently; the older one hasn\'t been touched in over a year. Merging moves items into the newer list and archives the older one.',
	createdAt: hoursAgo(1),
	actions: [
		{
			label: 'Merge into newest',
			description:
				'Moves items, item groups, and list addons onto the newer list. Older lists are archived (reversible), not deleted; existing claims follow the items.',
			intent: 'do',
			apply: {
				kind: 'merge-lists',
				survivorListId: mergeSurvivorWishlist.id,
				sourceListIds: [mergeSourceWishlist.id],
			},
		},
	],
	affected: {
		noun: 'list',
		count: 2,
		lines: [mergeSurvivorWishlist.name, mergeSourceWishlist.name],
		listChips: [mergeSurvivorWishlist, mergeSourceWishlist],
	},
	relatedLists: [mergeSurvivorWishlist],
}

const recMergeThreeWishlists: Recommendation = {
	id: 'rec-hygiene-merge-3',
	analyzerId: 'list-hygiene' as Recommendation['analyzerId'],
	kind: 'duplicate-event-lists',
	severity: 'suggest',
	status: 'active',
	title: 'Merge 2 older lists into "New Wishlist"',
	body: 'You have 3 active wishlists. "New Wishlist" was created most recently; the older ones haven\'t been touched in over a year. Merging moves items into the newer list and archives the older ones.',
	createdAt: hoursAgo(1),
	actions: [
		{
			label: 'Merge into newest',
			description:
				'Moves items, item groups, and list addons onto the newer list. Older lists are archived (reversible), not deleted; existing claims follow the items.',
			intent: 'do',
			apply: {
				kind: 'merge-lists',
				survivorListId: mergeSurvivorWishlist.id,
				sourceListIds: [mergeSourceWishlist.id, mergeExtraSourceWishlist.id],
			},
		},
	],
	affected: {
		noun: 'list',
		count: 3,
		lines: [mergeSurvivorWishlist.name, mergeSourceWishlist.name, mergeExtraSourceWishlist.name],
		listChips: [mergeSurvivorWishlist, mergeSourceWishlist, mergeExtraSourceWishlist],
	},
	relatedLists: [mergeSurvivorWishlist],
}

const mergeSurvivorEaster: ListRef = {
	id: 'list-easter-new',
	name: 'Easter 2026',
	type: 'holiday',
	isPrivate: false,
	subject: userSubject,
}
const mergeSourceEaster: ListRef = {
	id: 'list-easter-old',
	name: 'Easter 2025',
	type: 'holiday',
	isPrivate: false,
	subject: userSubject,
}

const recMergeHolidayCluster: Recommendation = {
	id: 'rec-hygiene-merge-holiday',
	analyzerId: 'list-hygiene' as Recommendation['analyzerId'],
	kind: 'duplicate-event-lists',
	severity: 'suggest',
	status: 'active',
	title: 'Merge 1 older list into "Easter 2026"',
	body: 'You have 2 active holiday lists. "Easter 2026" was created most recently; the older one hasn\'t been touched in over a year. Merging moves items into the newer list and archives the older one.',
	createdAt: hoursAgo(1),
	actions: [
		{
			label: 'Merge into newest',
			description:
				'Moves items, item groups, and list addons onto the newer list. Older lists are archived (reversible), not deleted; existing claims follow the items.',
			intent: 'do',
			apply: {
				kind: 'merge-lists',
				survivorListId: mergeSurvivorEaster.id,
				sourceListIds: [mergeSourceEaster.id],
			},
		},
	],
	affected: {
		noun: 'list',
		count: 2,
		lines: [mergeSurvivorEaster.name, mergeSourceEaster.name],
		listChips: [mergeSurvivorEaster, mergeSourceEaster],
	},
	relatedLists: [mergeSurvivorEaster],
}

// Map kept around for stories that want to look up by kind.
export const listHygieneRecsByKind = {
	convertBirthday: recConvertPublicForBirthday,
	convertChristmas: recConvertPublicForChristmas,
	convertHolidayRebind: recConvertHolidayRebind,
	makePublic: recMakePrivateListPublic,
	createEventList: recCreateEventList,
	createEventListDependent: recCreateEventListDependent,
	wrongPrimary: recWrongPrimaryForEvent,
	mergeTwoWishlists: recMergeTwoWishlists,
	mergeThreeWishlists: recMergeThreeWishlists,
	mergeHolidayCluster: recMergeHolidayCluster,
}

void wishlistPrimary // referenced by storybook decorators that pull from this module

export const populatedData: IntelligencePageData = {
	enabled: true,
	providerConfigured: true,
	recs: [
		recPrimaryList,
		recStaleItems,
		recStaleSingle,
		recDuplicates,
		recGroupingDestructive,
		recGroupingTypeCrossing,
		recGroupingDependent,
		recRelationLabels,
		recMissingPriceBundle,
		recClothingBundleWithSkipped,
		recMissingImageOverflowBundle,
	],
	lastRun,
	nextEligibleRefreshAt: hoursAgo(-1),
}

export const allDismissedData: IntelligencePageData = {
	enabled: true,
	providerConfigured: true,
	recs: [
		{ ...recPrimaryList, status: 'dismissed', dismissedAt: hoursAgo(1) },
		{ ...recStaleItems, status: 'dismissed', dismissedAt: hoursAgo(1) },
	],
	lastRun,
	nextEligibleRefreshAt: hoursAgo(-1),
}

export const partialProgressData: IntelligencePageData = {
	enabled: true,
	providerConfigured: true,
	recs: [
		{ ...recPrimaryList, status: 'applied' },
		{ ...recStaleItems, status: 'dismissed', dismissedAt: hoursAgo(1) },
		recStaleSingle,
		recDuplicates,
		recGroupingDestructive,
		recGroupingTypeCrossing,
		recGroupingDependent,
	],
	lastRun,
	nextEligibleRefreshAt: hoursAgo(-1),
}

export const emptyData: IntelligencePageData = {
	enabled: true,
	providerConfigured: true,
	recs: [],
	lastRun: { ...lastRun, finishedAt: hoursAgo(48) },
	nextEligibleRefreshAt: hoursAgo(-1),
}

export const cooldownData: IntelligencePageData = {
	...populatedData,
	nextEligibleRefreshAt: hoursAgo(-1),
}

export const errorData: IntelligencePageData = {
	enabled: true,
	providerConfigured: true,
	recs: [recStaleItems],
	lastRun: { ...lastRun, status: 'error', error: 'Provider returned 503 (rate limited)' },
}

export const generatingData: IntelligencePageData = {
	enabled: true,
	providerConfigured: true,
	recs: [recPrimaryList, recStaleItems],
	lastRun: { ...lastRun, status: 'running', finishedAt: null },
}

function isoDate(d: Date): string {
	return d.toISOString().slice(0, 10)
}

const dailySeries = (() => {
	const out = []
	const today = new Date()
	for (let i = 13; i >= 0; i--) {
		const d = new Date(today)
		d.setDate(d.getDate() - i)
		// fake-ish numbers that look reasonable
		const base = 14 + Math.round(Math.sin(i / 2) * 4)
		const success = Math.max(8, base + Math.round(Math.cos(i) * 3))
		const skipped = 6 + (i % 4)
		const error = i === 4 ? 3 : i % 6 === 0 ? 1 : 0
		const tokensIn = 60_000 + Math.round(Math.sin(i / 3) * 18_000) + (i % 3) * 4_000
		const tokensOut = Math.round(tokensIn * 0.18) + (i % 2) * 1_500
		const costUsd = Number(((tokensIn / 1_000_000) * 3 + (tokensOut / 1_000_000) * 15).toFixed(3))
		out.push({
			date: isoDate(d),
			runsSuccess: success,
			runsSkipped: skipped,
			runsError: error,
			tokensIn,
			tokensOut,
			costUsd,
			activeRecs: 100 + Math.round(Math.sin(i / 2.5) * 20) + i * 2,
			dismissedRecs: 4 + (i % 3),
			appliedRecs: 6 + Math.round(Math.cos(i / 2) * 2),
		})
	}
	return out
})()

export const adminData: AdminIntelligenceData = {
	settings: {
		enabled: true,
		refreshIntervalDays: 7,
		manualRefreshCooldownMinutes: 60,
		candidateCap: 50,
		concurrency: 3,
		usersPerInvocation: 25,
		staleRecRetentionDays: 30,
		runStepsRetentionDays: 30,
		upcomingWindowDays: 45,
		minDaysBeforeEventForRecs: 1,
		dryRun: false,
		modelOverride: null,
		email: { enabled: false, weeklyDigestEnabled: false, testRecipient: null },
		perAnalyzerEnabled: {
			'primary-list': true,
			'list-hygiene': true,
			'relation-labels': true,
			'stale-items': true,
			duplicates: true,
			grouping: true,
			'missing-price': true,
			'missing-image': true,
			'stale-scrape': true,
			'clothing-prefs': true,
		},
	},
	health: {
		totalActiveRecs: 142,
		analyzers: [
			{ id: 'primary-list', label: 'Primary list', enabled: true, avgDurationMs: 12, avgTokensIn: 0, avgTokensOut: 0, activeRecs: 8 },
			{ id: 'stale-items', label: 'Stale items', enabled: true, avgDurationMs: 1850, avgTokensIn: 1400, avgTokensOut: 320, activeRecs: 64 },
			{ id: 'duplicates', label: 'Duplicates', enabled: true, avgDurationMs: 2100, avgTokensIn: 1700, avgTokensOut: 280, activeRecs: 41 },
			{ id: 'grouping', label: 'Grouping', enabled: true, avgDurationMs: 1620, avgTokensIn: 1100, avgTokensOut: 250, activeRecs: 29 },
		],
		last24h: { success: 18, skipped: { 'unchanged-input': 9, 'unread-recs-exist': 3 }, error: 1 },
		last7d: { success: 124, skipped: { 'unchanged-input': 71, 'unread-recs-exist': 22, 'lock-held': 2 }, error: 4 },
		dailyTokensIn: 78500,
		dailyTokensOut: 14200,
		dailyEstimatedCostUsd: 0.42,
		queue: { overdue: 6, gatedByUnreadRecs: 11, lockHeld: 0 },
		provider: { source: 'db', provider: 'anthropic', model: 'claude-sonnet-4-6' },
	},
	runs: [
		{
			id: 'run-1001',
			userId: 'u-1',
			userName: 'Shawn',
			userImage: null,
			startedAt: hoursAgo(2),
			finishedAt: hoursAgo(2),
			status: 'success',
			trigger: 'cron',
			durationMs: 4720,
			inputHashShort: 'a3f2',
			recCounts: { 'primary-list': 1, 'stale-items': 3, duplicates: 1, grouping: 2 },
			tokensIn: 4200,
			tokensOut: 850,
			estimatedCostUsd: 0.014,
		},
		{
			id: 'run-1002',
			userId: 'u-2',
			userName: 'Diana',
			userImage: null,
			startedAt: hoursAgo(3),
			finishedAt: hoursAgo(3),
			status: 'skipped',
			trigger: 'cron',
			skipReason: 'unchanged-input',
			durationMs: 38,
			inputHashShort: 'b81e',
			recCounts: {},
		},
		{
			id: 'run-1003',
			userId: 'u-3',
			userName: 'Sam',
			userImage: null,
			startedAt: hoursAgo(4),
			finishedAt: hoursAgo(4),
			status: 'skipped',
			trigger: 'cron',
			skipReason: 'unread-recs-exist',
			durationMs: 12,
			recCounts: {},
		},
		{
			id: 'run-1004',
			userId: 'u-4',
			userName: 'Morgan',
			userImage: null,
			startedAt: hoursAgo(6),
			finishedAt: hoursAgo(6),
			status: 'error',
			trigger: 'cron',
			error: 'Provider returned 503 (rate limited)',
			durationMs: 1140,
			recCounts: {},
		},
		{
			id: 'run-1005',
			userId: 'u-1',
			userName: 'Shawn',
			userImage: null,
			startedAt: hoursAgo(20),
			finishedAt: hoursAgo(20),
			status: 'success',
			trigger: 'manual',
			durationMs: 5210,
			inputHashShort: '7c0a',
			recCounts: { 'stale-items': 4, duplicates: 2 },
			tokensIn: 4900,
			tokensOut: 920,
			estimatedCostUsd: 0.016,
		},
	],
	dailySeries,
}

export const runDetailData: RunDetailData = {
	run: adminData.runs[0],
	candidateInputs: [
		{
			analyzerId: 'primary-list',
			analyzerLabel: 'Primary list',
			items: [],
			lists: [wishlistGeneric, wishlistChristmas, birthdayList, tinyList],
		},
		{
			analyzerId: 'stale-items',
			analyzerLabel: 'Stale items',
			items: [staleHeadphones, staleKettle, staleBook],
			lists: [wishlistGeneric],
		},
		{
			analyzerId: 'duplicates',
			analyzerLabel: 'Duplicates',
			items: [dupeHeadphones1, dupeHeadphones2],
			lists: [wishlistChristmas, birthdayList],
		},
	],
	steps: [
		{
			analyzerId: 'primary-list',
			analyzerLabel: 'Primary list',
			latencyMs: 8,
		},
		{
			analyzerId: 'stale-items',
			analyzerLabel: 'Stale items',
			prompt:
				'You are a helpful list-hygiene assistant...\n\nCandidate items:\n- Bluetooth headphones (380d)\n- Electric kettle (410d)\n- Pragmatic Programmer (520d)',
			responseRaw: '{"recs":[{"kind":"old-items","severity":"suggest","title":"Clean up old items in My Wishlist",...}]}',
			parsed: { recs: [{ kind: 'old-items', severity: 'suggest' }] },
			tokensIn: 1380,
			tokensOut: 312,
			latencyMs: 1820,
		},
		{
			analyzerId: 'duplicates',
			analyzerLabel: 'Duplicates',
			prompt:
				'Confirm if these items are semantic duplicates...\n\n- Sony WH-1000XM4 over-ear headphones (Christmas 2026)\n- Sony noise-cancelling headphones (XM4) (Birthday)',
			responseRaw: '{"recs":[{"kind":"cross-list-duplicate","severity":"suggest"}]}',
			parsed: { recs: [{ kind: 'cross-list-duplicate' }] },
			tokensIn: 1620,
			tokensOut: 270,
			latencyMs: 2090,
		},
	],
	resultingRecs: [recPrimaryList, recStaleItems, recDuplicates, recGroupingDestructive],
	diff: [
		{ fingerprint: 'fp-1', title: 'Pick a primary list', change: 'unchanged' },
		{ fingerprint: 'fp-2', title: 'Clean up old items in My Wishlist', change: 'unchanged' },
		{ fingerprint: 'fp-4', title: 'Same item on two lists', change: 'added' },
		{ fingerprint: 'fp-old', title: 'Old: stale item suggestion now fixed', change: 'removed' },
	],
}

export const disabledByFeature: AdminIntelligenceData = {
	...adminData,
	settings: { ...adminData.settings, enabled: false },
}
