/**
 * Local development seed script.
 *
 * Creates a small, deterministic cast of users + lists + items + gifts so
 * local dev and Storybook/Preview have something to look at without touching
 * production data.
 *
 * Safety:
 *  - Refuses to run unless SEED_SAFE=1 is set in the environment.
 *  - Refuses to run if DATABASE_URL points at anything that looks remote -
 *    only localhost / 127.0.0.1 / docker hostnames are allowed.
 *  - Hard-deletes all rows in the seeded tables before inserting. Do NOT
 *    run this against a DB whose contents you care about.
 *
 * Usage:
 *   SEED_SAFE=1 pnpm db:seed
 *
 * The cast:
 *   admin@example.test      - admin
 *   alice@example.test      - partnered with bob, guardian of kid
 *   bob@example.test        - partnered with alice
 *   carol@example.test      - solo
 *   kid@example.test        - child, guarded by alice
 *
 * All passwords: SeedPass123! (change via admin panel if you care).
 */

import { sql } from 'drizzle-orm'

import { db } from '@/db'
import {
	giftedItems,
	guardianships,
	itemComments,
	itemGroups,
	items,
	listAddons,
	listEditors,
	lists,
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
// Small helpers
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
	// NOTE: the admin plugin refuses `role` at signUp (only an admin can grant
	// roles), so we always sign up as the default role and patch role + birthday
	// fields in with a direct drizzle update afterward.
	// The types say `role` is required on the body (it's in additionalFields
	// with required:true) - but the admin plugin rejects it at runtime, so we
	// deliberately omit it. Cast the whole body to escape that mismatch.
	const result = await auth.api.signUpEmail({
		body: {
			email: input.email,
			password: PASSWORD,
			name: input.name,
		} as any,
	})
	if (!result.user.id) {
		throw new Error(`signUp failed for ${input.email}`)
	}

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

// ------------------------------------------------------------------
// Reset - hard-delete anything we're about to seed (plus auth rows).
// ------------------------------------------------------------------
async function reset() {
	// Order matters only loosely - CASCADE on FK handles most of it, but
	// explicit truncates keep the output clear.
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
	const carolId = await signUp({ email: 'carol@example.test', name: 'Carol', role: 'user' })
	const kidId = await signUp({ email: 'kid@example.test', name: 'Kid', role: 'child' })

	console.log('💞 Wiring up partnerships + guardianships...')
	// Alice ↔ Bob - partnered.
	await db
		.update(users)
		.set({ partnerId: bobId })
		.where(sql`id = ${aliceId}`)
	await db
		.update(users)
		.set({ partnerId: aliceId })
		.where(sql`id = ${bobId}`)

	// Alice is kid's guardian.
	await db.insert(guardianships).values({ parentUserId: aliceId, childUserId: kidId })

	console.log('👥 Wiring up user relationships (view/edit grants)...')
	await db.insert(userRelationships).values([
		// Alice ↔ Bob - full mutual access.
		{ ownerUserId: aliceId, viewerUserId: bobId, canView: true, canEdit: true },
		{ ownerUserId: bobId, viewerUserId: aliceId, canView: true, canEdit: true },
		// Alice ↔ Carol - mutual view, no edit.
		{ ownerUserId: aliceId, viewerUserId: carolId, canView: true, canEdit: false },
		{ ownerUserId: carolId, viewerUserId: aliceId, canView: true, canEdit: false },
		// Admin ↔ Bob / Carol - one-way view grants so they can see and claim
		// on the admin showcase list without cluttering their own relationships.
		{ ownerUserId: adminId, viewerUserId: bobId, canView: true, canEdit: false },
		{ ownerUserId: adminId, viewerUserId: carolId, canView: true, canEdit: false },
	])

	console.log('📝 Creating lists...')
	const [aliceWishlist] = await db
		.insert(lists)
		.values({
			name: "Alice's Wishlist",
			type: 'wishlist',
			ownerId: aliceId,
			isPrimary: true,
			description: 'Things I want.',
		})
		.returning({ id: lists.id })

	const [aliceTodo] = await db
		.insert(lists)
		.values({ name: 'House ToDos', type: 'todos', ownerId: aliceId, isPrimary: false })
		.returning({ id: lists.id })

	const [bobWishlist] = await db
		.insert(lists)
		.values({ name: "Bob's Wishlist", type: 'wishlist', ownerId: bobId, isPrimary: true })
		.returning({ id: lists.id })

	const [carolWishlist] = await db
		.insert(lists)
		.values({ name: "Carol's Wishlist", type: 'wishlist', ownerId: carolId, isPrimary: true })
		.returning({ id: lists.id })

	// Carol keeps a gift-ideas list for Alice. giftIdeasTargetUserId is only
	// meaningful for type='giftideas'. Never visible to Alice.
	const [carolGiftIdeasForAlice] = await db
		.insert(lists)
		.values({
			name: 'Ideas for Alice',
			type: 'giftideas',
			ownerId: carolId,
			giftIdeasTargetUserId: aliceId,
		})
		.returning({ id: lists.id })

	const [kidWishlist] = await db
		.insert(lists)
		.values({ name: "Kid's Wishlist", type: 'wishlist', ownerId: kidId, isPrimary: true })
		.returning({ id: lists.id })

	console.log('🎁 Creating items...')
	const aliceItemRows = await db
		.insert(items)
		.values([
			{
				listId: aliceWishlist.id,
				title: 'Noise-cancelling headphones',
				priority: 'high',
				url: 'https://example.com/headphones',
				notes: 'Over-ear, not in-ear.',
				quantity: 1,
			},
			{
				listId: aliceWishlist.id,
				title: 'A really good cookbook',
				priority: 'normal',
				quantity: 1,
			},
			{
				listId: aliceWishlist.id,
				title: 'Climbing shoes',
				priority: 'low',
				availability: 'unavailable', // discontinued, but still want
				quantity: 1,
			},
			{
				listId: aliceWishlist.id,
				title: 'Box of very nice chocolates',
				priority: 'normal',
				quantity: 3,
			},
			{
				listId: aliceWishlist.id,
				title: 'An old, forgotten thing',
				priority: 'low',
				isArchived: true,
				quantity: 1,
			},
		])
		.returning({ id: items.id, title: items.title, quantity: items.quantity })

	await db.insert(items).values([
		{ listId: aliceTodo.id, title: 'Fix the squeaky door', priority: 'high' },
		{ listId: aliceTodo.id, title: 'Clean the gutters', priority: 'normal' },
	])

	await db.insert(items).values([
		{ listId: bobWishlist.id, title: 'A new cast iron pan', priority: 'very-high' },
		{ listId: bobWishlist.id, title: 'Running shoes, size 11', priority: 'high' },
	])

	await db.insert(items).values([
		{ listId: carolWishlist.id, title: 'Good tea', priority: 'normal' },
		{ listId: carolWishlist.id, title: 'A houseplant', priority: 'low' },
	])

	await db.insert(items).values([
		{ listId: carolGiftIdeasForAlice.id, title: 'Bike helmet (overheard her talking about it)', priority: 'normal' },
		{ listId: carolGiftIdeasForAlice.id, title: 'That one specific plant she mentioned', priority: 'low' },
	])

	await db.insert(items).values([
		{ listId: kidWishlist.id, title: 'LEGO set', priority: 'very-high' },
		{ listId: kidWishlist.id, title: 'Art supplies', priority: 'normal', quantity: 2 },
	])

	console.log('🎉 Claiming some gifts...')
	// Find items by title for clarity (small seed, so we can).
	const headphones = aliceItemRows.find(i => i.title === 'Noise-cancelling headphones')
	const chocolates = aliceItemRows.find(i => i.title === 'Box of very nice chocolates')
	if (!headphones || !chocolates) throw new Error('Seed item lookup failed.')

	await db.insert(giftedItems).values([
		// Bob claims Alice's headphones (full quantity).
		{
			itemId: headphones.id,
			gifterId: bobId,
			quantity: 1,
			totalCost: '299.99',
			notes: 'Already ordered, arriving Friday.',
		},
		// Carol claims 1 of 3 chocolate boxes. Leaves 2 still claimable.
		{ itemId: chocolates.id, gifterId: carolId, quantity: 1, totalCost: '18.00' },
	])

	console.log('➕ Adding an off-list addon...')
	await db.insert(listAddons).values({
		listId: aliceWishlist.id,
		userId: bobId,
		description: 'Wrapping paper + card',
		totalCost: '12.50',
		notes: 'Stocking stuffer style.',
	})

	console.log('✏️  Granting list-level editor rights...')
	// Alice grants Bob editor on her todo list (so he can tick things off).
	await db.insert(listEditors).values({
		listId: aliceTodo.id,
		userId: bobId,
		ownerId: aliceId,
	})

	console.log('💬 Dropping an item comment...')
	await db.insert(itemComments).values({
		itemId: headphones.id,
		userId: carolId,
		comment: 'Ooh, these are nice - good call Alice.',
	})

	console.log('🗂️  Creating an item group with children...')
	const [diningGroup] = await db
		.insert(itemGroups)
		.values({ listId: aliceWishlist.id, priority: 'normal' })
		.returning({ id: itemGroups.id })

	await db.insert(items).values([
		{ listId: aliceWishlist.id, groupId: diningGroup.id, title: 'Nice dinner plates', priority: 'normal', quantity: 4 },
		{ listId: aliceWishlist.id, groupId: diningGroup.id, title: 'Matching bowls', priority: 'normal', quantity: 4 },
	])

	// ------------------------------------------------------------------
	// Admin's own wishlist - a kitchen-sink showcase so local dev can see
	// every priority, group type, and item variation in one place.
	// ------------------------------------------------------------------
	console.log('🧪 Seeding admin showcase list...')
	const [adminWishlist] = await db
		.insert(lists)
		.values({
			name: "Admin's Showcase Wishlist",
			type: 'wishlist',
			ownerId: adminId,
			isPrimary: true,
			description: 'A kitchen-sink list demonstrating priorities, groups, quantities, and prices.',
		})
		.returning({ id: lists.id })

	// Standalone items - one of each priority, mix of quantities + prices,
	// plus an archived row to demonstrate the hidden-from-edit state.
	const adminItemRows = await db
		.insert(items)
		.values([
			{
				listId: adminWishlist.id,
				title: 'Espresso machine',
				priority: 'very-high',
				url: 'https://example.com/espresso',
				notes: 'Dual boiler, PID controlled.',
				quantity: 1,
				price: '1299.00',
				currency: 'USD',
			},
			{
				listId: adminWishlist.id,
				title: 'Mechanical keyboard',
				priority: 'high',
				quantity: 1,
				price: '189.99',
				currency: 'USD',
			},
			{
				listId: adminWishlist.id,
				title: 'Specialty coffee beans',
				priority: 'normal',
				quantity: 6,
				price: '22.50',
				currency: 'USD',
				notes: 'Light roast, single origin.',
			},
			{
				listId: adminWishlist.id,
				title: 'Wool socks',
				priority: 'low',
				quantity: 12,
				price: '14.00',
				currency: 'USD',
			},
			{
				listId: adminWishlist.id,
				title: 'Limited edition vinyl',
				priority: 'normal',
				availability: 'unavailable',
				quantity: 1,
				price: '45.00',
				currency: 'USD',
			},
			{
				listId: adminWishlist.id,
				title: 'Nice pen',
				priority: 'low',
				quantity: 2,
				price: '8.99',
				currency: 'USD',
			},
			{
				listId: adminWishlist.id,
				title: 'An old, forgotten admin idea',
				priority: 'low',
				isArchived: true,
				quantity: 1,
			},
		])
		.returning({ id: items.id, title: items.title })

	// Four groups, one per priority, plus type variety and an empty group.

	// very-high priority: "order" group - gaming console before accessories.
	const [consoleSetup] = await db
		.insert(itemGroups)
		.values({ listId: adminWishlist.id, name: 'Console setup', type: 'order', priority: 'very-high' })
		.returning({ id: itemGroups.id })

	await db.insert(items).values([
		{
			listId: adminWishlist.id,
			groupId: consoleSetup.id,
			title: 'Gaming console',
			priority: 'very-high',
			quantity: 1,
			price: '499.99',
			currency: 'USD',
			groupSortOrder: 1,
		},
		{
			listId: adminWishlist.id,
			groupId: consoleSetup.id,
			title: 'Extra controller',
			priority: 'very-high',
			quantity: 2,
			price: '69.99',
			currency: 'USD',
			groupSortOrder: 2,
		},
		{
			listId: adminWishlist.id,
			groupId: consoleSetup.id,
			title: 'Launch title game',
			priority: 'high',
			quantity: 1,
			price: '59.99',
			currency: 'USD',
			groupSortOrder: 3,
		},
	])

	// high priority: "or" group - pick one camera.
	const [cameraPick] = await db
		.insert(itemGroups)
		.values({ listId: adminWishlist.id, name: 'Pick one camera', type: 'or', priority: 'high' })
		.returning({ id: itemGroups.id })

	await db.insert(items).values([
		{
			listId: adminWishlist.id,
			groupId: cameraPick.id,
			title: 'Mirrorless camera body A',
			priority: 'high',
			quantity: 1,
			price: '1499.00',
			currency: 'USD',
		},
		{
			listId: adminWishlist.id,
			groupId: cameraPick.id,
			title: 'Mirrorless camera body B',
			priority: 'high',
			quantity: 1,
			price: '1699.00',
			currency: 'USD',
		},
		{
			listId: adminWishlist.id,
			groupId: cameraPick.id,
			title: 'Mirrorless camera body C (refurb)',
			priority: 'normal',
			quantity: 1,
			price: '899.00',
			currency: 'USD',
		},
	])

	// normal priority: "or" group - large multi-item group showcasing a
	// multitude of alternatives.
	const [bookPick] = await db
		.insert(itemGroups)
		.values({ listId: adminWishlist.id, name: 'Any of these books', type: 'or', priority: 'normal' })
		.returning({ id: itemGroups.id })

	await db.insert(items).values([
		{
			listId: adminWishlist.id,
			groupId: bookPick.id,
			title: 'The Pragmatic Programmer',
			priority: 'normal',
			quantity: 1,
			price: '34.99',
			currency: 'USD',
		},
		{
			listId: adminWishlist.id,
			groupId: bookPick.id,
			title: 'Designing Data-Intensive Applications',
			priority: 'normal',
			quantity: 1,
			price: '59.99',
			currency: 'USD',
		},
		{
			listId: adminWishlist.id,
			groupId: bookPick.id,
			title: 'Crafting Interpreters',
			priority: 'normal',
			quantity: 1,
			price: '39.99',
			currency: 'USD',
		},
		{
			listId: adminWishlist.id,
			groupId: bookPick.id,
			title: 'The Mythical Man-Month',
			priority: 'low',
			quantity: 1,
			price: '24.99',
			currency: 'USD',
		},
		{
			listId: adminWishlist.id,
			groupId: bookPick.id,
			title: 'Code Complete',
			priority: 'low',
			quantity: 1,
			price: '44.99',
			currency: 'USD',
		},
	])

	// low priority: "order" group - home gym bundle.
	const [homeGym] = await db
		.insert(itemGroups)
		.values({ listId: adminWishlist.id, name: 'Home gym starter', type: 'order', priority: 'low' })
		.returning({ id: itemGroups.id })

	await db.insert(items).values([
		{
			listId: adminWishlist.id,
			groupId: homeGym.id,
			title: 'Yoga mat',
			priority: 'low',
			quantity: 1,
			price: '39.00',
			currency: 'USD',
			groupSortOrder: 1,
		},
		{
			listId: adminWishlist.id,
			groupId: homeGym.id,
			title: 'Adjustable dumbbells',
			priority: 'normal',
			quantity: 2,
			price: '299.00',
			currency: 'USD',
			groupSortOrder: 2,
		},
	])

	// Empty group - exists to demonstrate zero-child rendering.
	await db.insert(itemGroups).values({ listId: adminWishlist.id, name: 'Future ideas (empty)', type: 'or', priority: 'normal' })

	console.log('🎉 Claiming gifts on the admin list...')
	const adminEspresso = adminItemRows.find(i => i.title === 'Espresso machine')
	const adminBeans = adminItemRows.find(i => i.title === 'Specialty coffee beans')
	if (!adminEspresso || !adminBeans) throw new Error('Admin seed item lookup failed.')

	await db.insert(giftedItems).values([
		// Bob fully claims the espresso machine.
		{
			itemId: adminEspresso.id,
			gifterId: bobId,
			quantity: 1,
			totalCost: '1299.00',
			notes: 'Already ordered.',
		},
		// Carol partially claims the coffee beans (2 of 6).
		{
			itemId: adminBeans.id,
			gifterId: carolId,
			quantity: 2,
			totalCost: '45.00',
		},
	])

	console.log('➕ Adding an off-list addon to the admin list...')
	await db.insert(listAddons).values({
		listId: adminWishlist.id,
		userId: bobId,
		description: 'Descaling kit for the espresso machine',
		totalCost: '24.00',
	})

	console.log('💬 Dropping a comment on an admin item...')
	await db.insert(itemComments).values({
		itemId: adminEspresso.id,
		userId: carolId,
		comment: 'Great pick, this one pulls beautiful shots.',
	})

	console.log('✏️  Granting Bob editor rights on the admin list...')
	await db.insert(listEditors).values({
		listId: adminWishlist.id,
		userId: bobId,
		ownerId: adminId,
	})

	console.log('')
	console.log('✅ Seed complete.')
	console.log('')
	console.log('   Users (all password: SeedPass123!):')
	console.log('     admin@example.test  - admin')
	console.log('     alice@example.test  - partnered w/ bob, guardian of kid')
	console.log('     bob@example.test    - partnered w/ alice, editor on alice todo list')
	console.log('     carol@example.test  - solo')
	console.log('     kid@example.test    - child')
	console.log('')
}

main()
	.then(() => process.exit(0))
	.catch(err => {
		console.error(err)
		process.exit(1)
	})
