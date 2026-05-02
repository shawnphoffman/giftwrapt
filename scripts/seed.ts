/**
 * Local development seed script.
 *
 * Creates a deterministic cast of users + lists + items + claims + addons +
 * editors + comments so local dev can pop into any account and verify
 * functionality quickly.
 *
 * !!!  DEV ONLY  !!!
 *
 * The seeded passwords (`SeedPass123!`) are committed to this repo, baked
 * into stories, and documented in docs/local-dev-admin.md - they are
 * effectively public. Anyone who can reach a server with this seed loaded
 * has admin access. Never run against a database that anything outside
 * your laptop can connect to. See sec-review L3.
 *
 * Safety guards (the script enforces these but they are not a substitute
 * for never running it on a non-local DB in the first place):
 *  - Refuses to run unless SEED_SAFE=1 is set in the environment.
 *  - Refuses to run if DATABASE_URL points at anything that looks remote -
 *    only localhost / 127.0.0.1 / docker hostnames are allowed.
 *  - Hard-deletes all rows in the seeded tables before inserting. Do NOT
 *    run this against a DB whose contents you care about.
 *
 * Usage:
 *   SEED_SAFE=1 pnpm db:seed
 *
 * The cast (all passwords: SeedPass123!):
 *   admin@example.test  - admin, owns the kitchen-sink showcase list
 *   alice@example.test  - partnered w/ bob, guardian of kid + teen
 *   bob@example.test    - partnered w/ alice, guardian of kid + teen
 *   carol@example.test  - solo, mutual view w/ alice + eve
 *   dave@example.test   - partnered w/ eve
 *   eve@example.test    - partnered w/ dave, owns a gifter-perspective showcase
 *   frank@example.test  - isolated, no relationships (verifies private case)
 *   grace@example.test  - only sees admin's showcase
 *   kid@example.test    - child, guardians alice + bob
 *   teen@example.test   - child, guardians alice + bob
 */

import { sql } from 'drizzle-orm'

import { db } from '@/db'
import {
	dependentGuardianships,
	dependents,
	giftedItems,
	guardianships,
	itemComments,
	itemGroups,
	items,
	listAddons,
	listEditors,
	lists,
	type NewItem,
	userRelationships,
	users,
} from '@/db/schema'
import { auth } from '@/lib/auth'

// ------------------------------------------------------------------
// Safety guards
// ------------------------------------------------------------------
function assertSafe() {
	if (process.env.SEED_SAFE !== '1') {
		throw new Error('Refusing to seed: SEED_SAFE=1 is not set. Run as `SEED_SAFE=1 pnpm db:seed`.')
	}

	const url = process.env.DATABASE_URL
	if (!url) throw new Error('DATABASE_URL is not set.')

	let host: string
	try {
		host = new URL(url).hostname
	} catch {
		throw new Error(`DATABASE_URL is not a valid URL: ${url}`)
	}

	const safeHosts = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal', 'postgres', 'db'])
	if (!safeHosts.has(host)) {
		throw new Error(
			`Refusing to seed: DATABASE_URL host "${host}" is not in the local/docker allowlist. ` +
				`If you really mean it, add it to the allowlist in scripts/seed.ts.`
		)
	}
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
const PASSWORD = 'SeedPass123!'

async function signUp(input: {
	email: string
	name: string
	role: 'user' | 'admin' | 'child'
	birthMonth?: string
	birthDay?: number
}): Promise<string> {
	// better-auth's signUpEmail handles password hashing + account row creation.
	// The admin plugin refuses `role` at signUp (only an admin can grant
	// roles), so we sign up as the default role and patch role + birthday
	// fields in with a direct drizzle update afterward.
	const result = await auth.api.signUpEmail({
		body: {
			email: input.email,
			password: PASSWORD,
			name: input.name,
		} as any,
	})
	if (!result.user.id) throw new Error(`signUp failed for ${input.email}`)

	const userId = result.user.id
	await db
		.update(users)
		.set({
			role: input.role,
			birthMonth: (input.birthMonth ?? null) as never,
			birthDay: input.birthDay ?? null,
		})
		.where(sql`id = ${userId}`)

	return userId
}

// Placeholder image URLs - placehold.co produces clearly-fake images that are
// useful for verifying image rendering without needing real product photos.
const ph = {
	square: (label: string, hex = '4f46e5') => `https://placehold.co/600x600/${hex}/fff?text=${encodeURIComponent(label)}`,
	wide: (label: string, hex = '14b8a6') => `https://placehold.co/800x500/${hex}/fff?text=${encodeURIComponent(label)}`,
	tall: (label: string, hex = 'ec4899') => `https://placehold.co/500x800/${hex}/fff?text=${encodeURIComponent(label)}`,
}

async function insertItems(values: Array<NewItem>): Promise<Map<string, number>> {
	const rows = await db.insert(items).values(values).returning({ id: items.id, title: items.title })
	return new Map(rows.map(r => [r.title, r.id]))
}

function need(map: Map<string, number>, title: string): number {
	const id = map.get(title)
	if (id == null) throw new Error(`Seed: missing item "${title}"`)
	return id
}

async function createList(input: {
	name: string
	type?: 'wishlist' | 'christmas' | 'birthday' | 'giftideas' | 'todos' | 'test'
	ownerId: string
	isPrimary?: boolean
	isPrivate?: boolean
	description?: string
	giftIdeasTargetUserId?: string
	subjectDependentId?: string
}): Promise<number> {
	const [row] = await db
		.insert(lists)
		.values({
			name: input.name,
			type: input.type ?? 'wishlist',
			ownerId: input.ownerId,
			isPrimary: input.isPrimary ?? false,
			isPrivate: input.type === 'giftideas' ? true : (input.isPrivate ?? false),
			description: input.description,
			giftIdeasTargetUserId: input.giftIdeasTargetUserId,
			subjectDependentId: input.subjectDependentId,
		})
		.returning({ id: lists.id })
	return row.id
}

async function createGroup(input: {
	listId: number
	name?: string
	type?: 'or' | 'order'
	priority?: 'low' | 'normal' | 'high' | 'very-high'
}): Promise<number> {
	const [row] = await db
		.insert(itemGroups)
		.values({
			listId: input.listId,
			name: input.name,
			type: input.type ?? 'or',
			priority: input.priority ?? 'normal',
		})
		.returning({ id: itemGroups.id })
	return row.id
}

// ------------------------------------------------------------------
// Reset - hard-delete everything we're about to seed (plus auth rows).
// ------------------------------------------------------------------
async function reset() {
	await db.execute(
		sql`TRUNCATE TABLE
			"gifted_items",
			"list_addons",
			"list_editors",
			"item_comments",
			"item_scrapes",
			"items",
			"item_groups",
			"lists",
			"user_relationships",
			"guardianships",
			"dependent_guardianships",
			"dependents",
			"session",
			"account",
			"verification",
			"users"
			RESTART IDENTITY CASCADE`
	)
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
async function main() {
	assertSafe()

	console.log('🔥 Resetting tables...')
	await reset()

	// ----------------------------------------------------------------
	// USERS
	// ----------------------------------------------------------------
	console.log('👤 Creating users...')
	const adminId = await signUp({ email: 'admin@example.test', name: 'Admin', role: 'admin' })
	const aliceId = await signUp({
		email: 'alice@example.test',
		name: 'Alice',
		role: 'user',
		birthMonth: 'march',
		birthDay: 14,
	})
	const bobId = await signUp({
		email: 'bob@example.test',
		name: 'Bob',
		role: 'user',
		birthMonth: 'july',
		birthDay: 22,
	})
	const carolId = await signUp({
		email: 'carol@example.test',
		name: 'Carol',
		role: 'user',
		birthMonth: 'november',
		birthDay: 3,
	})
	const daveId = await signUp({
		email: 'dave@example.test',
		name: 'Dave',
		role: 'user',
		birthMonth: 'january',
		birthDay: 9,
	})
	const eveId = await signUp({
		email: 'eve@example.test',
		name: 'Eve',
		role: 'user',
		birthMonth: 'september',
		birthDay: 27,
	})
	const frankId = await signUp({ email: 'frank@example.test', name: 'Frank', role: 'user' })
	const graceId = await signUp({ email: 'grace@example.test', name: 'Grace', role: 'user' })
	const kidId = await signUp({
		email: 'kid@example.test',
		name: 'Kid',
		role: 'child',
		birthMonth: 'may',
		birthDay: 5,
	})
	const teenId = await signUp({
		email: 'teen@example.test',
		name: 'Teen',
		role: 'child',
		birthMonth: 'october',
		birthDay: 18,
	})

	// ----------------------------------------------------------------
	// PARTNERSHIPS + GUARDIANSHIPS
	// ----------------------------------------------------------------
	console.log('💞 Wiring up partnerships + guardianships...')
	await db
		.update(users)
		.set({ partnerId: bobId })
		.where(sql`id = ${aliceId}`)
	await db
		.update(users)
		.set({ partnerId: aliceId })
		.where(sql`id = ${bobId}`)
	await db
		.update(users)
		.set({ partnerId: eveId })
		.where(sql`id = ${daveId}`)
	await db
		.update(users)
		.set({ partnerId: daveId })
		.where(sql`id = ${eveId}`)

	await db.insert(guardianships).values([
		{ parentUserId: aliceId, childUserId: kidId },
		{ parentUserId: bobId, childUserId: kidId },
		{ parentUserId: aliceId, childUserId: teenId },
		{ parentUserId: bobId, childUserId: teenId },
	])

	// ----------------------------------------------------------------
	// DEPENDENTS
	// ----------------------------------------------------------------
	// Two dependents: a pet co-managed by Alice + Bob, and a baby co-managed
	// by Dave + Eve. They exercise the dependent-subject list path on /me,
	// /received, the create-list dialog picker, the public-feed Sprout
	// avatar, and the permissions matrix dependent columns.
	console.log('🌱 Creating dependents...')
	const mochiId = crypto.randomUUID()
	const peanutId = crypto.randomUUID()
	await db.insert(dependents).values([
		{
			id: mochiId,
			name: 'Mochi',
			image: null,
			birthMonth: 'march',
			birthDay: 12,
			birthYear: 2022,
			createdByUserId: aliceId,
		},
		{
			id: peanutId,
			name: 'Peanut',
			image: null,
			birthMonth: 'september',
			birthDay: 1,
			birthYear: 2025,
			createdByUserId: daveId,
		},
	])
	await db.insert(dependentGuardianships).values([
		{ guardianUserId: aliceId, dependentId: mochiId },
		{ guardianUserId: bobId, dependentId: mochiId },
		{ guardianUserId: daveId, dependentId: peanutId },
		{ guardianUserId: eveId, dependentId: peanutId },
	])

	// ----------------------------------------------------------------
	// USER RELATIONSHIPS
	// ----------------------------------------------------------------
	// Frank intentionally has zero relationships - others can't view his lists,
	// and he can't view theirs. Grace only sees the admin showcase.
	console.log('👥 Wiring up user relationships (view/edit grants)...')
	await db.insert(userRelationships).values([
		// Partners - full mutual access.
		{ ownerUserId: aliceId, viewerUserId: bobId, accessLevel: 'view', canEdit: true },
		{ ownerUserId: bobId, viewerUserId: aliceId, accessLevel: 'view', canEdit: true },
		{ ownerUserId: daveId, viewerUserId: eveId, accessLevel: 'view', canEdit: true },
		{ ownerUserId: eveId, viewerUserId: daveId, accessLevel: 'view', canEdit: true },

		// Friend circle around alice - mutual view, no edit.
		{ ownerUserId: aliceId, viewerUserId: carolId, accessLevel: 'view', canEdit: false },
		{ ownerUserId: carolId, viewerUserId: aliceId, accessLevel: 'view', canEdit: false },
		{ ownerUserId: aliceId, viewerUserId: daveId, accessLevel: 'view', canEdit: false },
		{ ownerUserId: daveId, viewerUserId: aliceId, accessLevel: 'view', canEdit: false },

		// Eve's gifter-perspective list is public to alice / bob / carol so they
		// can pop in and view it as gifters.
		{ ownerUserId: eveId, viewerUserId: aliceId, accessLevel: 'view', canEdit: false },
		{ ownerUserId: aliceId, viewerUserId: eveId, accessLevel: 'view', canEdit: false },
		{ ownerUserId: eveId, viewerUserId: bobId, accessLevel: 'view', canEdit: false },
		{ ownerUserId: bobId, viewerUserId: eveId, accessLevel: 'view', canEdit: false },
		{ ownerUserId: eveId, viewerUserId: carolId, accessLevel: 'view', canEdit: false },
		{ ownerUserId: carolId, viewerUserId: eveId, accessLevel: 'view', canEdit: false },

		// Admin showcase - one-way view grants for the people who'll browse it.
		{ ownerUserId: adminId, viewerUserId: bobId, accessLevel: 'view', canEdit: false },
		{ ownerUserId: adminId, viewerUserId: carolId, accessLevel: 'view', canEdit: false },
		{ ownerUserId: adminId, viewerUserId: eveId, accessLevel: 'view', canEdit: false },
		{ ownerUserId: adminId, viewerUserId: daveId, accessLevel: 'view', canEdit: false },
		{ ownerUserId: adminId, viewerUserId: graceId, accessLevel: 'view', canEdit: false },
	])

	// ----------------------------------------------------------------
	// LISTS
	// ----------------------------------------------------------------
	console.log('📝 Creating lists...')
	const adminShowcase = await createList({
		name: "Admin's Showcase Wishlist",
		ownerId: adminId,
		isPrimary: true,
		description: 'Kitchen-sink list demonstrating priorities, groups, quantities, prices, and images.',
	})
	const adminBirthday = await createList({
		name: "Admin's Birthday",
		type: 'birthday',
		ownerId: adminId,
	})

	const aliceWishlist = await createList({
		name: "Alice's Wishlist",
		ownerId: aliceId,
		isPrimary: true,
		description: 'Things I want.',
	})
	const aliceTodo = await createList({ name: 'House ToDos', type: 'todos', ownerId: aliceId })
	const aliceTripPlanning = await createList({
		name: 'Trip to Italy planning',
		type: 'todos',
		ownerId: aliceId,
		description: 'Pre-trip checklist - some done, plenty still to go.',
	})
	const aliceChristmas = await createList({
		name: "Alice's Christmas List",
		type: 'christmas',
		ownerId: aliceId,
	})
	const aliceIdeasForBob = await createList({
		name: 'Ideas for Bob',
		type: 'giftideas',
		ownerId: aliceId,
		giftIdeasTargetUserId: bobId,
		description: "Stuff I've overheard Bob mention.",
	})
	// Personal/private wishlist - even bob (her partner) can't see this.
	const alicePrivate = await createList({
		name: "Alice's Private Wishlist",
		ownerId: aliceId,
		isPrivate: true,
		description: 'For my eyes only.',
	})

	const bobWishlist = await createList({ name: "Bob's Wishlist", ownerId: bobId, isPrimary: true })
	const bobBirthday = await createList({
		name: "Bob's Birthday Wishlist",
		type: 'birthday',
		ownerId: bobId,
	})
	const bobGarage = await createList({
		name: 'Garage projects',
		type: 'todos',
		ownerId: bobId,
		description: 'Weekend projects - mostly stalled.',
	})
	const bobPrivate = await createList({
		name: "Bob's Private List",
		ownerId: bobId,
		isPrivate: true,
	})

	const carolWishlist = await createList({ name: "Carol's Wishlist", ownerId: carolId, isPrimary: true })
	const carolIdeasForAlice = await createList({
		name: 'Ideas for Alice',
		type: 'giftideas',
		ownerId: carolId,
		giftIdeasTargetUserId: aliceId,
	})

	const daveWishlist = await createList({ name: "Dave's Wishlist", ownerId: daveId, isPrimary: true })

	// Eve's primary mirrors the admin showcase so non-admins can pop in as
	// gifters and see every item-card variation from the buyer side.
	const eveWishlist = await createList({
		name: "Eve's Wishlist",
		ownerId: eveId,
		isPrimary: true,
		description: 'A second showcase list - browse this one as a gifter.',
	})
	const eveBirthday = await createList({
		name: "Eve's Birthday",
		type: 'birthday',
		ownerId: eveId,
	})
	const eveTodo = await createList({
		name: 'Garden plans',
		type: 'todos',
		ownerId: eveId,
		description: 'Mix of seasonal chores and bigger weekend projects.',
	})

	// Frank's list is private + he has no relationships - nobody else can see it.
	const frankPrivate = await createList({
		name: "Frank's Private Wishlist",
		ownerId: frankId,
		isPrimary: true,
		isPrivate: true,
		description: 'Nobody else should be able to see this list.',
	})

	const graceWishlist = await createList({ name: "Grace's Wishlist", ownerId: graceId, isPrimary: true })

	const kidWishlist = await createList({ name: "Kid's Wishlist", ownerId: kidId, isPrimary: true })
	const kidChristmas = await createList({
		name: "Kid's Christmas List",
		type: 'christmas',
		ownerId: kidId,
	})

	const teenWishlist = await createList({ name: "Teen's Wishlist", ownerId: teenId, isPrimary: true })

	// Dependent-subject lists. Owner is the creating guardian; the
	// `subjectDependentId` flips the list into the dependent's identity
	// across /me, /received, the public feed, and the recent surfaces.
	const mochiWishlist = await createList({
		name: "Mochi's Wishlist",
		ownerId: aliceId,
		isPrimary: true,
		subjectDependentId: mochiId,
		description: 'Treats, toys, the occasional sweater.',
	})
	const peanutWishlist = await createList({
		name: "Peanut's Registry",
		ownerId: daveId,
		isPrimary: true,
		subjectDependentId: peanutId,
		description: 'Baby gear and outgrown-things-go-fast staples.',
	})

	// ----------------------------------------------------------------
	// ITEMS - alice
	// ----------------------------------------------------------------
	console.log('🎁 Adding alice items...')
	const aliceItems = await insertItems([
		{
			listId: aliceWishlist,
			title: 'Noise-cancelling headphones',
			priority: 'high',
			url: 'https://example.com/headphones',
			notes: 'Over-ear, not in-ear.',
			imageUrl: ph.square('Headphones'),
			price: '299.99',
			currency: 'USD',
		},
		{
			listId: aliceWishlist,
			title: 'A really good cookbook',
			priority: 'normal',
			imageUrl: ph.tall('Cookbook'),
			price: '34.50',
			currency: 'USD',
		},
		{
			listId: aliceWishlist,
			title: 'Climbing shoes',
			priority: 'low',
			availability: 'unavailable',
			notes: 'Discontinued, but still want them.',
		},
		{
			listId: aliceWishlist,
			title: 'Box of very nice chocolates',
			priority: 'normal',
			quantity: 3,
			imageUrl: ph.square('Chocolates', 'a16207'),
			price: '18.00',
			currency: 'USD',
		},
		{
			listId: aliceWishlist,
			title: 'Pour-over kettle',
			priority: 'high',
			price: '95.00',
			currency: 'USD',
			imageUrl: ph.square('Kettle', '0f766e'),
			isArchived: true, // archived + claim below = received gift
		},
		{
			listId: aliceWishlist,
			title: 'An old, forgotten thing',
			priority: 'low',
			isArchived: true,
		},
	])

	const aliceDining = await createGroup({ listId: aliceWishlist, name: 'Dinnerware set', priority: 'normal' })
	await insertItems([
		{
			listId: aliceWishlist,
			groupId: aliceDining,
			title: 'Nice dinner plates',
			priority: 'normal',
			quantity: 4,
			price: '12.00',
			currency: 'USD',
		},
		{
			listId: aliceWishlist,
			groupId: aliceDining,
			title: 'Matching bowls',
			priority: 'normal',
			quantity: 4,
			price: '10.00',
			currency: 'USD',
		},
	])

	// Alice's todos - mix of complete + incomplete across every priority.
	await insertItems([
		{ listId: aliceTodo, title: 'Fix the squeaky door', priority: 'high', status: 'incomplete' },
		{ listId: aliceTodo, title: 'Clean the gutters', priority: 'normal', status: 'complete' },
		{ listId: aliceTodo, title: 'Replace smoke alarm batteries', priority: 'very-high', status: 'incomplete' },
		{ listId: aliceTodo, title: 'Touch up paint in hallway', priority: 'low', status: 'incomplete' },
		{ listId: aliceTodo, title: 'Schedule HVAC tune-up', priority: 'normal', status: 'complete' },
		{ listId: aliceTodo, title: 'Re-caulk bathtub', priority: 'normal', status: 'incomplete' },
		{
			listId: aliceTodo,
			title: 'Order replacement filter (out of stock)',
			priority: 'low',
			status: 'incomplete',
			availability: 'unavailable',
		},
		{ listId: aliceTodo, title: 'Move pile of mail off counter', priority: 'low', status: 'complete', isArchived: true },
	])

	// Trip-planning todos - shows a different todos use case (sequenced prep).
	await insertItems([
		{ listId: aliceTripPlanning, title: 'Renew passport', priority: 'very-high', status: 'complete' },
		{ listId: aliceTripPlanning, title: 'Book flights', priority: 'very-high', status: 'complete' },
		{ listId: aliceTripPlanning, title: 'Reserve hotels (Rome + Florence)', priority: 'high', status: 'incomplete' },
		{ listId: aliceTripPlanning, title: 'Train tickets between cities', priority: 'high', status: 'incomplete' },
		{ listId: aliceTripPlanning, title: 'Pick up Euros from the bank', priority: 'normal', status: 'incomplete' },
		{ listId: aliceTripPlanning, title: 'Pet sitter for the cats', priority: 'high', status: 'complete' },
		{ listId: aliceTripPlanning, title: 'Try learning some Italian phrases', priority: 'low', status: 'incomplete' },
	])

	// Alice's Christmas list - small + festive.
	await insertItems([
		{
			listId: aliceChristmas,
			title: 'Cozy wool blanket',
			priority: 'high',
			imageUrl: ph.wide('Blanket', 'b91c1c'),
			price: '79.00',
			currency: 'USD',
		},
		{ listId: aliceChristmas, title: 'Fancy candles', priority: 'normal', quantity: 2 },
		{ listId: aliceChristmas, title: 'New mittens', priority: 'low' },
	])

	// Alice's "Ideas for Bob" giftideas list (target=bob; bob never sees this).
	await insertItems([
		{ listId: aliceIdeasForBob, title: 'New leather wallet (his is falling apart)', priority: 'high' },
		{ listId: aliceIdeasForBob, title: 'Subscription to that magazine he keeps reading at the dentist', priority: 'normal' },
		{ listId: aliceIdeasForBob, title: 'Replacement for the ugly mug', priority: 'low' },
	])

	// Alice's private list - nobody else can see this, even bob.
	await insertItems([
		{
			listId: alicePrivate,
			title: 'Tattoo idea reference book',
			priority: 'normal',
			imageUrl: ph.tall('Tattoo Book', '4c1d95'),
		},
		{ listId: alicePrivate, title: 'Therapy journal', priority: 'high' },
		{ listId: alicePrivate, title: 'That expensive perfume', priority: 'low', price: '220.00', currency: 'USD' },
	])

	// ----------------------------------------------------------------
	// ITEMS - bob
	// ----------------------------------------------------------------
	console.log('🎁 Adding bob items...')
	const bobItems = await insertItems([
		{
			listId: bobWishlist,
			title: 'A new cast iron pan',
			priority: 'very-high',
			imageUrl: ph.square('Cast Iron', '1f2937'),
			price: '89.00',
			currency: 'USD',
		},
		{
			listId: bobWishlist,
			title: 'Running shoes, size 11',
			priority: 'high',
			imageUrl: ph.wide('Running Shoes', '0ea5e9'),
			price: '140.00',
			currency: 'USD',
		},
		{
			listId: bobWishlist,
			title: 'New chef knife',
			priority: 'normal',
			price: '120.00',
			currency: 'USD',
		},
		{
			listId: bobWishlist,
			title: 'Limited-run hot sauce sampler',
			priority: 'normal',
			availability: 'unavailable',
			notes: 'Sold out, waiting for restock.',
		},
		{
			listId: bobWishlist,
			title: 'Coffee subscription (one year)',
			priority: 'high',
			price: '180.00',
			currency: 'USD',
			imageUrl: ph.square('Coffee Sub', '7c2d12'),
			isArchived: true, // received gift below
		},
	])

	await insertItems([
		{
			listId: bobBirthday,
			title: 'Whiskey decanter',
			priority: 'high',
			imageUrl: ph.tall('Decanter', '78350f'),
			price: '60.00',
			currency: 'USD',
		},
		{ listId: bobBirthday, title: 'Hammock for the backyard', priority: 'normal' },
		{ listId: bobBirthday, title: 'Replacement headlamp', priority: 'low' },
		{
			listId: bobBirthday,
			title: 'Out-of-print woodworking book',
			priority: 'normal',
			availability: 'unavailable',
			notes: 'Used copies maybe?',
		},
	])

	// Bob's garage projects - todos with more "stalled" energy.
	await insertItems([
		{ listId: bobGarage, title: 'Build new workbench', priority: 'high', status: 'incomplete' },
		{ listId: bobGarage, title: 'Hang pegboard', priority: 'normal', status: 'complete' },
		{ listId: bobGarage, title: 'Organize bolts + screws into bins', priority: 'normal', status: 'incomplete' },
		{ listId: bobGarage, title: 'Replace garage door spring', priority: 'very-high', status: 'incomplete', notes: 'Dangerous - hire pro.' },
		{ listId: bobGarage, title: 'Paint the floor', priority: 'low', status: 'incomplete' },
		{ listId: bobGarage, title: 'Donate broken lawnmower', priority: 'low', status: 'complete' },
	])

	// Bob's private list.
	await insertItems([
		{ listId: bobPrivate, title: 'Surprise anniversary trip ideas', priority: 'high' },
		{ listId: bobPrivate, title: 'Watch (waiting for a sale)', priority: 'normal', price: '450.00', currency: 'USD' },
	])

	// ----------------------------------------------------------------
	// ITEMS - carol
	// ----------------------------------------------------------------
	console.log('🎁 Adding carol items...')
	await insertItems([
		{
			listId: carolWishlist,
			title: 'Good tea',
			priority: 'normal',
			quantity: 2,
			imageUrl: ph.square('Tea', '047857'),
			price: '24.00',
			currency: 'USD',
		},
		{ listId: carolWishlist, title: 'A houseplant', priority: 'low' },
		{
			listId: carolWishlist,
			title: 'Vintage record from that one shop',
			priority: 'low',
			availability: 'unavailable',
			notes: "It's gone. RIP.",
		},
		{
			listId: carolWishlist,
			title: 'Indoor herb garden kit',
			priority: 'high',
			imageUrl: ph.wide('Herb Garden', '15803d'),
			price: '65.00',
			currency: 'USD',
		},
	])

	await insertItems([
		{ listId: carolIdeasForAlice, title: 'Bike helmet (overheard her talking about it)', priority: 'normal' },
		{ listId: carolIdeasForAlice, title: 'That one specific plant she mentioned', priority: 'low' },
		{ listId: carolIdeasForAlice, title: 'Ceramic mug from the place downtown', priority: 'normal' },
	])

	// ----------------------------------------------------------------
	// ITEMS - dave
	// ----------------------------------------------------------------
	console.log('🎁 Adding dave items...')
	await insertItems([
		{
			listId: daveWishlist,
			title: 'Mountain bike helmet',
			priority: 'high',
			imageUrl: ph.square('Helmet', '1d4ed8'),
			price: '110.00',
			currency: 'USD',
		},
		{ listId: daveWishlist, title: 'Cycling jersey, large', priority: 'normal' },
		{
			listId: daveWishlist,
			title: 'Trail running shoes',
			priority: 'normal',
			availability: 'unavailable',
			notes: 'Out of stock everywhere right now.',
		},
		{ listId: daveWishlist, title: 'Garage shelving', priority: 'low' },
	])

	// ----------------------------------------------------------------
	// ITEMS - eve (gifter-perspective showcase, mirrors admin)
	// ----------------------------------------------------------------
	console.log('🎁 Adding eve showcase items...')
	const eveItems = await insertItems([
		{
			listId: eveWishlist,
			title: 'Stand mixer',
			priority: 'very-high',
			url: 'https://example.com/mixer',
			imageUrl: ph.square('Stand Mixer', 'be185d'),
			price: '449.00',
			currency: 'USD',
			notes: 'Any color but red.',
		},
		{
			listId: eveWishlist,
			title: 'Leather journal',
			priority: 'high',
			imageUrl: ph.tall('Journal', '78350f'),
			price: '42.00',
			currency: 'USD',
		},
		{
			listId: eveWishlist,
			title: 'Set of nice pens',
			priority: 'normal',
			quantity: 4,
			price: '12.00',
			currency: 'USD',
		},
		{
			listId: eveWishlist,
			title: 'Bath salts (any scent)',
			priority: 'normal',
			quantity: 6,
			imageUrl: ph.square('Bath Salts', '8b5cf6'),
			price: '14.00',
			currency: 'USD',
		},
		{
			listId: eveWishlist,
			title: 'Replacement for that broken vase',
			priority: 'low',
			availability: 'unavailable',
		},
		{
			listId: eveWishlist,
			title: 'Linen pillowcases',
			priority: 'low',
			quantity: 2,
			price: '38.00',
			currency: 'USD',
		},
		// Archived w/ claim - shows up in eve's "received gifts".
		{
			listId: eveWishlist,
			title: 'Silk scarf',
			priority: 'high',
			imageUrl: ph.wide('Scarf', 'db2777'),
			price: '85.00',
			currency: 'USD',
			isArchived: true,
		},
	])

	const eveCookware = await createGroup({
		listId: eveWishlist,
		name: 'Cookware bundle',
		type: 'order',
		priority: 'high',
	})
	await insertItems([
		{
			listId: eveWishlist,
			groupId: eveCookware,
			title: 'Dutch oven',
			priority: 'high',
			quantity: 1,
			price: '359.00',
			currency: 'USD',
			imageUrl: ph.square('Dutch Oven', 'b45309'),
			groupSortOrder: 1,
		},
		{
			listId: eveWishlist,
			groupId: eveCookware,
			title: 'Matching skillet',
			priority: 'high',
			quantity: 1,
			price: '199.00',
			currency: 'USD',
			groupSortOrder: 2,
		},
	])

	const eveCandles = await createGroup({
		listId: eveWishlist,
		name: 'Pick one candle scent',
		type: 'or',
		priority: 'normal',
	})
	await insertItems([
		{ listId: eveWishlist, groupId: eveCandles, title: 'Fig + cedar candle', priority: 'normal', price: '38.00', currency: 'USD' },
		{ listId: eveWishlist, groupId: eveCandles, title: 'Saltwater candle', priority: 'normal', price: '38.00', currency: 'USD' },
		{
			listId: eveWishlist,
			groupId: eveCandles,
			title: 'Smoke + leather candle',
			priority: 'normal',
			price: '38.00',
			currency: 'USD',
		},
	])

	await insertItems([
		{
			listId: eveBirthday,
			title: 'Spa day gift card',
			priority: 'high',
			price: '150.00',
			currency: 'USD',
		},
		{ listId: eveBirthday, title: 'Bottle of natural wine', priority: 'normal', quantity: 2 },
		{
			listId: eveBirthday,
			title: 'That sold-out concert ticket',
			priority: 'high',
			availability: 'unavailable',
			notes: 'Resale only - long shot.',
		},
	])

	// Eve's garden todos - mostly seasonal, some carried over from last year.
	await insertItems([
		{ listId: eveTodo, title: 'Prune the rose bushes', priority: 'high', status: 'complete' },
		{ listId: eveTodo, title: 'Plant tomato starts', priority: 'high', status: 'incomplete' },
		{ listId: eveTodo, title: 'Mulch the front beds', priority: 'normal', status: 'incomplete' },
		{ listId: eveTodo, title: 'Sharpen pruners', priority: 'low', status: 'complete' },
		{ listId: eveTodo, title: 'Build raised bed for herbs', priority: 'normal', status: 'incomplete' },
		{ listId: eveTodo, title: 'Repair drip irrigation timer', priority: 'high', status: 'incomplete' },
	])

	// ----------------------------------------------------------------
	// ITEMS - frank (isolated)
	// ----------------------------------------------------------------
	console.log('🎁 Adding frank items...')
	await insertItems([
		{ listId: frankPrivate, title: 'Something nobody else can see', priority: 'normal' },
		{ listId: frankPrivate, title: 'Another secret item', priority: 'low' },
	])

	// ----------------------------------------------------------------
	// ITEMS - grace
	// ----------------------------------------------------------------
	console.log('🎁 Adding grace items...')
	await insertItems([
		{ listId: graceWishlist, title: 'Watercolor paint set', priority: 'high', imageUrl: ph.square('Watercolors', '6d28d9') },
		{ listId: graceWishlist, title: 'Sketchbook', priority: 'normal', quantity: 2 },
	])

	// ----------------------------------------------------------------
	// ITEMS - kid + teen
	// ----------------------------------------------------------------
	console.log('🎁 Adding kid + teen items...')
	const kidItems = await insertItems([
		{
			listId: kidWishlist,
			title: 'LEGO set',
			priority: 'very-high',
			imageUrl: ph.square('LEGO', 'eab308'),
			price: '79.99',
			currency: 'USD',
		},
		{
			listId: kidWishlist,
			title: 'Art supplies',
			priority: 'normal',
			quantity: 2,
			imageUrl: ph.wide('Art Supplies', 'db2777'),
			price: '32.00',
			currency: 'USD',
		},
		{ listId: kidWishlist, title: 'New scooter', priority: 'high' },
	])

	await insertItems([
		{ listId: kidChristmas, title: 'Bike bell', priority: 'normal' },
		{ listId: kidChristmas, title: 'Stuffed dragon', priority: 'high', imageUrl: ph.tall('Dragon', '7c3aed') },
		{ listId: kidChristmas, title: 'Sticker book', priority: 'low', quantity: 3 },
	])

	const teenItems = await insertItems([
		{
			listId: teenWishlist,
			title: 'Wireless earbuds',
			priority: 'very-high',
			imageUrl: ph.square('Earbuds', '0f172a'),
			price: '199.00',
			currency: 'USD',
		},
		{ listId: teenWishlist, title: 'Hoodie, size M', priority: 'high', quantity: 2 },
		{
			listId: teenWishlist,
			title: 'Polaroid film, 3 packs',
			priority: 'normal',
			quantity: 3,
			price: '21.00',
			currency: 'USD',
		},
		{ listId: teenWishlist, title: 'Skateboard wheels', priority: 'low', quantity: 4 },
	])

	// ----------------------------------------------------------------
	// ITEMS - dependents
	// ----------------------------------------------------------------
	console.log('🎁 Adding dependent items...')
	await insertItems([
		{ listId: mochiWishlist, title: 'Salmon-flavor training treats', priority: 'high', quantity: 2 },
		{ listId: mochiWishlist, title: 'New collar, medium', priority: 'normal', price: '24.00', currency: 'USD' },
		{ listId: mochiWishlist, title: 'Dental chew variety pack', priority: 'normal' },
		{ listId: mochiWishlist, title: 'Heated bed (when she finally outgrows the fleece)', priority: 'low' },
	])
	await insertItems([
		{
			listId: peanutWishlist,
			title: 'Crib sheets, 3-pack',
			priority: 'very-high',
			quantity: 3,
			price: '36.00',
			currency: 'USD',
		},
		{ listId: peanutWishlist, title: 'Sleep sack, 6mo', priority: 'high', quantity: 2 },
		{ listId: peanutWishlist, title: 'Books for the next size up', priority: 'normal' },
	])

	// ----------------------------------------------------------------
	// ITEMS - admin showcase (kitchen sink: every priority, every group type)
	// ----------------------------------------------------------------
	console.log('🧪 Seeding admin showcase list...')
	const adminItems = await insertItems([
		{
			listId: adminShowcase,
			title: 'Espresso machine',
			priority: 'very-high',
			url: 'https://example.com/espresso',
			notes: 'Dual boiler, PID controlled.',
			imageUrl: ph.square('Espresso', '1f2937'),
			price: '1299.00',
			currency: 'USD',
		},
		{
			listId: adminShowcase,
			title: 'Mechanical keyboard',
			priority: 'high',
			imageUrl: ph.wide('Keyboard', '0f172a'),
			price: '189.99',
			currency: 'USD',
		},
		{
			listId: adminShowcase,
			title: 'Specialty coffee beans',
			priority: 'normal',
			quantity: 6,
			imageUrl: ph.square('Coffee Beans', '7c2d12'),
			price: '22.50',
			currency: 'USD',
			notes: 'Light roast, single origin.',
		},
		{
			listId: adminShowcase,
			title: 'Wool socks',
			priority: 'low',
			quantity: 12,
			price: '14.00',
			currency: 'USD',
		},
		{
			listId: adminShowcase,
			title: 'Limited edition vinyl',
			priority: 'normal',
			availability: 'unavailable',
			imageUrl: ph.square('Vinyl', '171717'),
			price: '45.00',
			currency: 'USD',
		},
		{
			listId: adminShowcase,
			title: 'Nice pen',
			priority: 'low',
			quantity: 2,
			price: '8.99',
			currency: 'USD',
		},
		{
			listId: adminShowcase,
			title: 'An old, forgotten admin idea',
			priority: 'low',
			isArchived: true,
		},
	])

	// very-high "order" group - gaming console before accessories.
	const consoleSetup = await createGroup({
		listId: adminShowcase,
		name: 'Console setup',
		type: 'order',
		priority: 'very-high',
	})
	await insertItems([
		{
			listId: adminShowcase,
			groupId: consoleSetup,
			title: 'Gaming console',
			priority: 'very-high',
			quantity: 1,
			price: '499.99',
			currency: 'USD',
			imageUrl: ph.wide('Console', '111827'),
			groupSortOrder: 1,
		},
		{
			listId: adminShowcase,
			groupId: consoleSetup,
			title: 'Extra controller',
			priority: 'very-high',
			quantity: 2,
			price: '69.99',
			currency: 'USD',
			groupSortOrder: 2,
		},
		{
			listId: adminShowcase,
			groupId: consoleSetup,
			title: 'Launch title game',
			priority: 'high',
			quantity: 1,
			price: '59.99',
			currency: 'USD',
			groupSortOrder: 3,
		},
	])

	// high "or" group - pick one camera body.
	const cameraPick = await createGroup({
		listId: adminShowcase,
		name: 'Pick one camera',
		type: 'or',
		priority: 'high',
	})
	await insertItems([
		{
			listId: adminShowcase,
			groupId: cameraPick,
			title: 'Mirrorless camera body A',
			priority: 'high',
			quantity: 1,
			price: '1499.00',
			currency: 'USD',
			imageUrl: ph.square('Camera A', '262626'),
		},
		{
			listId: adminShowcase,
			groupId: cameraPick,
			title: 'Mirrorless camera body B',
			priority: 'high',
			quantity: 1,
			price: '1699.00',
			currency: 'USD',
			imageUrl: ph.square('Camera B', '404040'),
		},
		{
			listId: adminShowcase,
			groupId: cameraPick,
			title: 'Mirrorless camera body C (refurb)',
			priority: 'normal',
			quantity: 1,
			price: '899.00',
			currency: 'USD',
		},
	])

	// normal "or" group - pick a book.
	const bookPick = await createGroup({
		listId: adminShowcase,
		name: 'Any of these books',
		type: 'or',
		priority: 'normal',
	})
	await insertItems([
		{
			listId: adminShowcase,
			groupId: bookPick,
			title: 'The Pragmatic Programmer',
			priority: 'normal',
			price: '34.99',
			currency: 'USD',
			imageUrl: ph.tall('Pragmatic'),
		},
		{
			listId: adminShowcase,
			groupId: bookPick,
			title: 'Designing Data-Intensive Applications',
			priority: 'normal',
			price: '59.99',
			currency: 'USD',
		},
		{
			listId: adminShowcase,
			groupId: bookPick,
			title: 'Crafting Interpreters',
			priority: 'normal',
			price: '39.99',
			currency: 'USD',
		},
		{
			listId: adminShowcase,
			groupId: bookPick,
			title: 'The Mythical Man-Month',
			priority: 'low',
			price: '24.99',
			currency: 'USD',
		},
		{
			listId: adminShowcase,
			groupId: bookPick,
			title: 'Code Complete',
			priority: 'low',
			price: '44.99',
			currency: 'USD',
		},
	])

	// low "order" group - home gym bundle.
	const homeGym = await createGroup({
		listId: adminShowcase,
		name: 'Home gym starter',
		type: 'order',
		priority: 'low',
	})
	await insertItems([
		{
			listId: adminShowcase,
			groupId: homeGym,
			title: 'Yoga mat',
			priority: 'low',
			quantity: 1,
			price: '39.00',
			currency: 'USD',
			groupSortOrder: 1,
		},
		{
			listId: adminShowcase,
			groupId: homeGym,
			title: 'Adjustable dumbbells',
			priority: 'normal',
			quantity: 2,
			price: '299.00',
			currency: 'USD',
			groupSortOrder: 2,
		},
	])

	// Empty group - exists to demonstrate zero-child rendering.
	await createGroup({ listId: adminShowcase, name: 'Future ideas (empty)', priority: 'normal' })

	await insertItems([
		{ listId: adminBirthday, title: 'Bottle of nice scotch', priority: 'high', price: '120.00', currency: 'USD' },
		{ listId: adminBirthday, title: 'Plant for the office', priority: 'normal' },
	])

	// ----------------------------------------------------------------
	// CLAIMS / GIFTS
	// ----------------------------------------------------------------
	console.log('🎉 Recording claims (purchases)...')

	// Alice's list - bob fully claims headphones, carol partial chocolates,
	// dave partial chocolates, bob+carol co-gift cookbook.
	await db.insert(giftedItems).values([
		{
			itemId: need(aliceItems, 'Noise-cancelling headphones'),
			gifterId: bobId,
			quantity: 1,
			totalCost: '299.99',
			notes: 'Already ordered, arriving Friday.',
		},
		{
			itemId: need(aliceItems, 'Box of very nice chocolates'),
			gifterId: carolId,
			quantity: 1,
			totalCost: '18.00',
		},
		{
			itemId: need(aliceItems, 'Box of very nice chocolates'),
			gifterId: daveId,
			quantity: 1,
			totalCost: '18.00',
			notes: 'Picking these up at the shop downtown.',
		},
		{
			itemId: need(aliceItems, 'A really good cookbook'),
			gifterId: bobId,
			additionalGifterIds: [carolId],
			quantity: 1,
			totalCost: '34.50',
			notes: 'Bob + Carol going in together.',
		},
		// Pour-over kettle is archived + claimed = received gift for alice.
		{
			itemId: need(aliceItems, 'Pour-over kettle'),
			gifterId: carolId,
			quantity: 1,
			totalCost: '95.00',
		},
	])

	// Bob's list - alice claims cast iron, dave claims running shoes, carol
	// fully claims the (archived) coffee subscription so bob's "received" is
	// populated.
	await db.insert(giftedItems).values([
		{
			itemId: need(bobItems, 'A new cast iron pan'),
			gifterId: aliceId,
			quantity: 1,
			totalCost: '89.00',
		},
		{
			itemId: need(bobItems, 'Running shoes, size 11'),
			gifterId: daveId,
			quantity: 1,
			totalCost: '140.00',
		},
		{
			itemId: need(bobItems, 'Coffee subscription (one year)'),
			gifterId: carolId,
			quantity: 1,
			totalCost: '180.00',
		},
	])

	// Eve's list - alice + bob co-gift the stand mixer, carol takes 2 of 6
	// bath salts, dave claims one cookware-bundle item, alice claims silk
	// scarf which is archived (received gift for eve).
	await db.insert(giftedItems).values([
		{
			itemId: need(eveItems, 'Stand mixer'),
			gifterId: aliceId,
			additionalGifterIds: [bobId],
			quantity: 1,
			totalCost: '449.00',
			notes: 'Alice + Bob going in together.',
		},
		{
			itemId: need(eveItems, 'Bath salts (any scent)'),
			gifterId: carolId,
			quantity: 2,
			totalCost: '28.00',
		},
		{
			itemId: need(eveItems, 'Silk scarf'),
			gifterId: aliceId,
			quantity: 1,
			totalCost: '85.00',
		},
	])

	// Admin list - bob claims espresso (full), carol claims 2 of 6 coffee
	// beans, eve claims wool socks (3 of 12).
	await db.insert(giftedItems).values([
		{
			itemId: need(adminItems, 'Espresso machine'),
			gifterId: bobId,
			quantity: 1,
			totalCost: '1299.00',
			notes: 'Already ordered.',
		},
		{
			itemId: need(adminItems, 'Specialty coffee beans'),
			gifterId: carolId,
			quantity: 2,
			totalCost: '45.00',
		},
		{
			itemId: need(adminItems, 'Wool socks'),
			gifterId: eveId,
			quantity: 3,
			totalCost: '42.00',
		},
	])

	// Kid + teen - alice + bob co-gift the LEGO and the earbuds, carol claims
	// art supplies (1 of 2).
	await db.insert(giftedItems).values([
		{
			itemId: need(kidItems, 'LEGO set'),
			gifterId: aliceId,
			additionalGifterIds: [bobId],
			quantity: 1,
			totalCost: '79.99',
		},
		{
			itemId: need(kidItems, 'Art supplies'),
			gifterId: carolId,
			quantity: 1,
			totalCost: '32.00',
		},
		{
			itemId: need(teenItems, 'Wireless earbuds'),
			gifterId: aliceId,
			additionalGifterIds: [bobId],
			quantity: 1,
			totalCost: '199.00',
		},
	])

	// ----------------------------------------------------------------
	// LIST ADDONS (off-list gifts, including one archived = received)
	// ----------------------------------------------------------------
	console.log('➕ Adding off-list addons...')
	await db.insert(listAddons).values([
		{
			listId: aliceWishlist,
			userId: bobId,
			description: 'Wrapping paper + card',
			totalCost: '12.50',
			notes: 'Stocking stuffer style.',
		},
		// Archived addon on alice's list - shows up in alice's "received".
		{
			listId: aliceWishlist,
			userId: carolId,
			description: "Bouquet from the farmer's market",
			totalCost: '22.00',
			isArchived: true,
		},
		{
			listId: adminShowcase,
			userId: bobId,
			description: 'Descaling kit for the espresso machine',
			totalCost: '24.00',
		},
		{
			listId: eveWishlist,
			userId: aliceId,
			description: 'Hand-written card + pressed flowers',
			totalCost: null,
		},
	])

	// ----------------------------------------------------------------
	// LIST EDITORS
	// ----------------------------------------------------------------
	console.log('✏️  Granting list-level editor rights...')
	await db.insert(listEditors).values([
		// Bob can tick things off alice's todo list.
		{ listId: aliceTodo, userId: bobId, ownerId: aliceId },
		// Carol helps alice manage her christmas list.
		{ listId: aliceChristmas, userId: carolId, ownerId: aliceId },
		// Bob can edit admin's showcase.
		{ listId: adminShowcase, userId: bobId, ownerId: adminId },
		// Alice can edit eve's birthday list.
		{ listId: eveBirthday, userId: aliceId, ownerId: eveId },
	])

	// ----------------------------------------------------------------
	// COMMENTS
	// ----------------------------------------------------------------
	console.log('💬 Dropping item comments...')
	await db.insert(itemComments).values([
		{
			itemId: need(aliceItems, 'Noise-cancelling headphones'),
			userId: carolId,
			comment: 'Ooh, these are nice - good call Alice.',
		},
		{
			itemId: need(aliceItems, 'A really good cookbook'),
			userId: bobId,
			comment: 'Any specific cuisine in mind?',
		},
		{
			itemId: need(adminItems, 'Espresso machine'),
			userId: carolId,
			comment: 'Great pick, this one pulls beautiful shots.',
		},
		{
			itemId: need(eveItems, 'Stand mixer'),
			userId: carolId,
			comment: 'Color preference?',
		},
		{
			itemId: need(eveItems, 'Stand mixer'),
			userId: aliceId,
			comment: 'She mentioned wanting matte black or sage green.',
		},
	])

	console.log('')
	console.log('✅ Seed complete.')
	console.log('')
	console.log('   Users (all password: SeedPass123!):')
	console.log('     admin@example.test  - admin, owns the kitchen-sink showcase list')
	console.log('     alice@example.test  - partnered w/ bob, guardian of kid + teen')
	console.log('     bob@example.test    - partnered w/ alice, guardian of kid + teen')
	console.log('     carol@example.test  - solo, mutual view w/ alice + eve')
	console.log('     dave@example.test   - partnered w/ eve')
	console.log('     eve@example.test    - partnered w/ dave, gifter-perspective showcase')
	console.log('     frank@example.test  - isolated, no relationships')
	console.log("     grace@example.test  - only sees admin's showcase")
	console.log('     kid@example.test    - child, guardians alice + bob')
	console.log('     teen@example.test   - child, guardians alice + bob')
	console.log('')
	console.log('   Quick verification suggestions:')
	console.log('     - sign in as alice  → /me, /purchases, /purchases/received')
	console.log('                           private list + 2 todos lists (House + Italy trip)')
	console.log('     - sign in as bob    → received gifts, garage todos, private list')
	console.log("     - sign in as carol  → view eve's list as a gifter")
	console.log('     - sign in as eve    → garden todos with seasonal mix')
	console.log('     - sign in as frank  → confirm gallery is empty')
	console.log('')
}

main()
	.then(() => process.exit(0))
	.catch(err => {
		console.error(err)
		process.exit(1)
	})
