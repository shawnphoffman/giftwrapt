/**
 * Screenshot seed - standalone fixture builder for the screenshot CLI.
 *
 * Distinct from `scripts/seed.ts`: that one is a kitchen-sink dev fixture,
 * this one is curated specifically for the screenshot generator. Centred
 * on `admin@example.test` (who has a partner, kids, friends, and a rich
 * mix of received + given gifts) and laid out so every captured route
 * has interesting, realistic-looking data on it.
 *
 * !!! DEV ONLY !!!
 *
 * Same safety guards as the dev seed (SEED_SAFE=1, localhost-only,
 * TRUNCATE before insert). The seeded password is `password`.
 *
 * Time-relative: every `createdAt`, `availabilityChangedAt`, and birthday
 * is computed as an offset from the script's start time. Re-running the
 * seed shifts every date forward by the same delta, so screenshots that
 * include relative time strings ("3 days ago", "in 5 days") stay
 * meaningful regardless of when the seed last ran.
 *
 * Usage:
 *   pnpm dev:screenshots
 *
 * `dev:screenshots` chains DB ensure + migrate + seed + the dev server in one
 * step; SEED_SAFE=1 is set there. Run this script directly only when iterating
 * on the seed itself, and remember to pass SEED_SAFE=1.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { sql } from 'drizzle-orm'

import { db } from '@/db'
import type { BirthMonth } from '@/db/schema'
import {
	appSettings,
	dependentGuardianships,
	dependents,
	giftedItems,
	guardianships,
	holidayCatalog,
	itemComments,
	itemGroups,
	items,
	itemScrapes,
	listAddons,
	listEditors,
	lists,
	type NewItem,
	recommendationRuns,
	recommendations,
	userRelationLabels,
	userRelationships,
	users,
} from '@/db/schema'
import { auth } from '@/lib/auth'
import { encryptAppSecret } from '@/lib/crypto/app-secret'
import { fingerprintFor } from '@/lib/intelligence/fingerprint'

const FIXTURE_IDS_PATH = new URL('./screenshots/.fixture-ids.json', import.meta.url).pathname
const PASSWORD = 'password'

// ------------------------------------------------------------------
// Safety guards (mirrors scripts/seed.ts)
// ------------------------------------------------------------------
function assertSafe() {
	if (process.env.SEED_SAFE !== '1') {
		throw new Error(
			'Refusing to seed: SEED_SAFE=1 is not set. Run `pnpm dev:screenshots` (which sets it), or pass SEED_SAFE=1 manually when invoking this script directly.'
		)
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
		throw new Error(`Refusing to seed: DATABASE_URL host "${host}" is not in the local/docker allowlist.`)
	}
}

// ------------------------------------------------------------------
// Time helpers - everything relative to a single fixed `seedTime`.
// ------------------------------------------------------------------
const seedTime = new Date()

function daysAgo(days: number): Date {
	return new Date(seedTime.getTime() - days * 24 * 60 * 60 * 1000)
}
function hoursAgo(hours: number): Date {
	return new Date(seedTime.getTime() - hours * 60 * 60 * 1000)
}
function daysFromNow(days: number): Date {
	return new Date(seedTime.getTime() + days * 24 * 60 * 60 * 1000)
}

const BIRTH_MONTHS: ReadonlyArray<BirthMonth> = [
	'january',
	'february',
	'march',
	'april',
	'may',
	'june',
	'july',
	'august',
	'september',
	'october',
	'november',
	'december',
]

function birthdayInDays(days: number): { birthMonth: BirthMonth; birthDay: number } {
	const target = daysFromNow(days)
	return { birthMonth: BIRTH_MONTHS[target.getMonth()], birthDay: target.getDate() }
}

// ------------------------------------------------------------------
// Placeholder image helpers - real photos via loremflickr (tag-based,
// deterministic via the `lock` param) and DiceBear avatars for users.
// The `hex` parameter is ignored (kept for call-site compatibility).
// ------------------------------------------------------------------
function stableHash(s: string): number {
	let h = 2166136261
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
	return Math.abs(h | 0)
}
function photo(label: string, w: number, h: number): string {
	const tags = encodeURIComponent(label.toLowerCase())
	return `https://loremflickr.com/${w}/${h}/${tags}?lock=${stableHash(label)}`
}
const ph = {
	square: (label: string, _hex?: string) => photo(label, 600, 600),
	wide: (label: string, _hex?: string) => photo(label, 800, 500),
	tall: (label: string, _hex?: string) => photo(label, 500, 800),
}
function avatarUrl(seed: string): string {
	const params = new URLSearchParams({
		scale: '120',
		radius: '50',
		backgroundType: 'solid,gradientLinear',
		translateX: '-5',
		backgroundColor: 'b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
		seed,
	})
	return `https://api.dicebear.com/9.x/open-peeps/svg?${params.toString()}`
}

// ------------------------------------------------------------------
// Insert helpers
// ------------------------------------------------------------------
async function signUp(input: {
	email: string
	name: string
	role: 'user' | 'admin' | 'child'
	birthMonth?: BirthMonth | null
	birthDay?: number | null
	avatarSeed: string
}): Promise<string> {
	const result = await auth.api.signUpEmail({
		body: { email: input.email, password: PASSWORD, name: input.name } as never,
	})
	if (!result.user.id) throw new Error(`signUp failed for ${input.email}`)
	const id = result.user.id
	await db
		.update(users)
		.set({
			role: input.role,
			birthMonth: (input.birthMonth ?? null) as never,
			birthDay: input.birthDay ?? null,
			image: avatarUrl(input.avatarSeed),
		})
		.where(sql`id = ${id}`)
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
	createdAt?: Date
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
			...(input.createdAt ? { createdAt: input.createdAt } : {}),
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

async function insertItems(values: Array<NewItem>): Promise<Map<string, number>> {
	const rows = await db.insert(items).values(values).returning({ id: items.id, title: items.title })
	return new Map(rows.map(r => [r.title, r.id]))
}

function need(map: Map<string, number>, title: string): number {
	const id = map.get(title)
	if (id == null) throw new Error(`Seed: missing item "${title}"`)
	return id
}

// ------------------------------------------------------------------
// Reset
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
			"user_relation_labels",
			"user_relationships",
			"guardianships",
			"dependent_guardianships",
			"dependents",
			"recommendations",
			"recommendation_run_steps",
			"recommendation_runs",
			"holiday_catalog",
			"app_settings",
			"session",
			"account",
			"verification",
			"users"
			RESTART IDENTITY CASCADE`
	)
}

// ------------------------------------------------------------------
// Long-form copy used to exercise wrap / clamp / overflow rendering.
// ------------------------------------------------------------------
const LONG_TITLE =
	'Hand-thrown stoneware mug from that small ceramic studio in Portland with the matte glaze and the slight wobble at the base'
const LONG_NOTES =
	'Looking for one of these for a while now. The matte black version specifically - not the glossy one. Size large please. If it ' +
	'is available in olive green that would also work but black is the first preference. Let me know if you need the link or want ' +
	'me to email it over - I can also forward the original gift guide article that mentioned it.'
const MEDIUM_NOTES = 'Any color but red. Pre-order is fine if it is on backorder.'
const SHORT_NOTES = 'Size large.'

const LONG_DESCRIPTION = 'Mostly stocking-stuffer-sized things plus a few bigger ticket items.'

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
async function main() {
	assertSafe()

	console.log(`🕐 Seed time: ${seedTime.toISOString()}`)
	console.log('🔥 Resetting tables...')
	await reset()

	// --------------------------------------------------------- APP SETTINGS
	// Fake-but-complete configuration so every admin/feature surface looks
	// "live" in screenshots: AI provider configured, email provider
	// configured, intelligence on, passkeys on, OIDC on, scraper providers
	// populated. None of these credentials work; we never actually call
	// the upstream APIs in a screenshot run.
	console.log('⚙️  Seeding app_settings (fake configured)...')
	await db.insert(appSettings).values([
		{ key: 'appTitle', value: 'GiftWrapt' },

		// List type gates: keep only wishlists + birthdays + giftideas. Drop
		// christmas/todos/holiday so /admin doesn't show every toggle on.
		{ key: 'enableChristmasLists', value: false },
		{ key: 'enableBirthdayLists', value: true },
		{ key: 'enableTodoLists', value: false },
		// Generic holiday lists ON so the holiday-list type and the
		// catalog-driven Mother's Day / Father's Day pickers appear.
		{ key: 'enableGenericHolidayLists', value: true },
		{ key: 'defaultListType', value: 'wishlist' },

		// Email features ON.
		{ key: 'enableBirthdayEmails', value: true },
		{ key: 'enableChristmasEmails', value: false },
		{ key: 'enableGenericHolidayEmails', value: true },
		{ key: 'enableComments', value: true },
		{ key: 'enableCommentEmails', value: true },

		// Parental relations (Mother's / Father's Day) ON.
		{ key: 'enableParentalRelations', value: true },
		{ key: 'parentalRelationsReminderLeadDays', value: 21 },

		// Mobile + passkeys + OIDC ON so the sign-in page surfaces every
		// auth path.
		{ key: 'enableMobileApp', value: true },
		{ key: 'enablePasskeys', value: true },
		{
			key: 'oidcClient',
			value: {
				enabled: true,
				issuerUrl: 'https://idp.example.test',
				authorizationUrl: '',
				tokenUrl: '',
				userinfoUrl: '',
				jwksUrl: '',
				logoutUrl: '',
				clientId: 'giftwrapt-screenshots',
				// Encrypted envelope so the loader's decrypt-on-read pass
				// matches the prod write path.
				clientSecret: encryptAppSecret('not-a-real-secret-but-non-empty'),
				scopes: ['openid', 'email', 'profile'],
				buttonText: 'Sign in with Example IdP',
				matchExistingUsersBy: 'email',
				autoRegister: true,
			},
		},
		{
			key: 'mobileApp',
			value: {
				redirectUris: ['giftwrapt://oauth/callback'],
			},
		},

		// AI provider: fake but valid-shape config so /admin/ai shows
		// configured state and Intelligence treats the provider as resolvable.
		{ key: 'aiProviderType', value: 'anthropic' },
		{ key: 'aiModel', value: 'claude-sonnet-4-6' },
		{ key: 'aiBaseUrl', value: 'https://api.anthropic.com' },
		{ key: 'aiApiKey', value: encryptAppSecret('sk-ant-screenshot-fake-not-a-real-key-XXXXXXXXXXX1234') },
		{ key: 'aiMaxOutputTokens', value: 4096 },

		// Email provider: fake Resend-shaped config.
		{ key: 'resendApiKey', value: encryptAppSecret('re_screenshot_fake_NotARealKey1234567890') },
		{ key: 'resendFromEmail', value: 'GiftWrapt <hello@example.test>' },
		{ key: 'resendFromName', value: 'GiftWrapt' },
		{ key: 'resendBccAddress', value: 'archive@example.test' },

		// Scraper timing + providers list: a varied chain so /admin/scraping
		// shows real rows in the providers list with the expected mix of
		// types, tiers, and toggles.
		{ key: 'scrapeProviderTimeoutMs', value: 20_000 },
		{ key: 'scrapeOverallTimeoutMs', value: 45_000 },
		{ key: 'scrapeQualityThreshold', value: 3 },
		{ key: 'scrapeCacheTtlHours', value: 24 },
		{ key: 'scrapeAiProviderEnabled', value: true },
		{ key: 'scrapeAiCleanTitlesEnabled', value: true },
		{
			key: 'scrapeProviders',
			value: [
				{
					id: 'gw-fly',
					type: 'giftwrapt-scraper',
					name: 'GiftWrapt Scraper (hosted)',
					enabled: true,
					tier: 1,
					endpoint: 'https://scraper.example.test',
					token: encryptAppSecret('gw_screenshot_fake_token_AAAAAAAAA'),
				},
				{
					id: 'browserless-pri',
					type: 'browserless',
					name: 'Browserless (primary)',
					enabled: true,
					tier: 1,
					url: 'https://chrome.example.test',
					token: encryptAppSecret('bl_screenshot_fake_token_BBBBBBBBB'),
				},
				{
					id: 'flaresolverr',
					type: 'flaresolverr',
					name: 'FlareSolverr (cloudflare)',
					enabled: true,
					tier: 2,
					url: 'http://flaresolverr.local:8191',
				},
				{
					id: 'scrapfly-1',
					type: 'scrapfly',
					name: 'ScrapFly (anti-bot)',
					enabled: false,
					tier: 3,
					apiKey: encryptAppSecret('sf_screenshot_fake_CCCCCCCCC'),
					asp: true,
					renderJs: false,
				},
				{
					id: 'ai-extract',
					type: 'ai',
					name: 'AI extractor',
					enabled: true,
					tier: 4,
				},
			],
		},

		// Bulk import + scrape queue.
		{ key: 'importEnabled', value: true },
		{ key: 'scrapeQueueUsersPerInvocation', value: 25 },
		{ key: 'scrapeQueueConcurrency', value: 3 },
		{ key: 'scrapeQueueMaxAttempts', value: 3 },

		// Intelligence ON with a tuned config.
		{ key: 'intelligenceEnabled', value: true },
		{ key: 'intelligenceRefreshIntervalDays', value: 7 },
		{ key: 'intelligenceManualRefreshCooldownMinutes', value: 60 },
		{ key: 'intelligenceCandidateCap', value: 50 },
		{ key: 'intelligenceConcurrency', value: 3 },
		{ key: 'intelligenceUsersPerInvocation', value: 25 },
		{ key: 'intelligenceStaleRecRetentionDays', value: 30 },
		{ key: 'intelligenceRunStepsRetentionDays', value: 30 },
		{ key: 'intelligenceUpcomingWindowDays', value: 45 },
		{ key: 'intelligenceMinDaysBeforeEventForRecs', value: 1 },
		{ key: 'intelligenceDryRun', value: false },
		{
			key: 'intelligencePerAnalyzerEnabled',
			value: { 'primary-list': true, 'list-hygiene': true, 'relation-labels': true, 'stale-items': true, duplicates: true, grouping: true },
		},
		{ key: 'intelligenceModelOverride', value: null },
		{ key: 'intelligenceEmailEnabled', value: true },
		{ key: 'intelligenceEmailWeeklyDigestEnabled', value: false },
		{ key: 'intelligenceEmailTestRecipient', value: 'admin@example.test' },
		{ key: 'cronRunsRetentionDays', value: 90 },

		// Misc.
		{ key: 'archiveDaysAfterBirthday', value: 14 },
		{ key: 'archiveDaysAfterChristmas', value: 14 },
		{ key: 'archiveDaysAfterHoliday', value: 14 },
		{ key: 'mirrorExternalImagesOnSave', value: false },
	])

	// --------------------------------------------------------- HOLIDAY CATALOG
	// User wants only Mother's Day + Father's Day enabled in the catalog.
	// Seed JUST those two (US) so the new-list holiday picker is short.
	console.log('🎉 Seeding holiday catalog (mothers + fathers only)...')
	await db.insert(holidayCatalog).values([
		{ country: 'US', slug: 'mothers-day', name: "Mother's Day", rule: '2nd sunday in May', isEnabled: true },
		{ country: 'US', slug: 'fathers-day', name: "Father's Day", rule: '3rd sunday in June', isEnabled: true },
	])

	// ------------------------------------------------------------- USERS
	console.log('👤 Creating users (varied birthdays)...')
	const adminId = await signUp({
		email: 'admin@example.test',
		name: 'Sam Rivera',
		role: 'admin',
		avatarSeed: 'Luis',
		...birthdayInDays(5), // close: birthday in 5 days
	})
	const partnerId = await signUp({
		email: 'partner@example.test',
		name: 'Alex Rivera',
		role: 'user',
		avatarSeed: 'Maria',
		...birthdayInDays(18), // soon-ish: birthday in 18 days
	})
	const friendId = await signUp({
		email: 'friend@example.test',
		name: 'Jordan Lee',
		role: 'user',
		avatarSeed: 'Aiden',
		...birthdayInDays(200), // far: ~6.5 months out
	})
	const gifterId = await signUp({
		email: 'gifter@example.test',
		name: 'Morgan Patel',
		role: 'user',
		avatarSeed: 'Sophia',
		...birthdayInDays(-45), // past: birthday already passed this year
	})
	const nobdayId = await signUp({
		email: 'nobday@example.test',
		name: 'Riley Chen',
		role: 'user',
		avatarSeed: 'Kai',
		// no birthMonth/birthDay
	})
	const childId = await signUp({
		email: 'child@example.test',
		name: 'Casey Rivera',
		role: 'child',
		avatarSeed: 'Nora',
		...birthdayInDays(21), // close-ish: 3 weeks
	})
	// Distant acquaintance whose lists admin can see at all only as a
	// `restricted` viewer. Drives capture of the filtered item view, the
	// stripped co-gifter columns, and the disabled Restrict toggle UI.
	const restrictedOwnerId = await signUp({
		email: 'distant@example.test',
		name: 'Sky Patel',
		role: 'user',
		avatarSeed: 'Elena',
		...birthdayInDays(95),
	})

	// ----------------------------------------------- PARTNERSHIPS / GUARDIANSHIPS
	console.log('💞 Wiring up partnerships + guardianships...')
	await db
		.update(users)
		.set({ partnerId })
		.where(sql`id = ${adminId}`)
	await db
		.update(users)
		.set({ partnerId: adminId })
		.where(sql`id = ${partnerId}`)

	await db.insert(guardianships).values([
		{ parentUserId: adminId, childUserId: childId },
		{ parentUserId: partnerId, childUserId: childId },
	])

	// ----------------------------------------------- DEPENDENTS
	// One dependent (a pet) co-managed by admin + partner. Gives every
	// screenshot a chance to capture the dependent surfaces: /me's
	// "Dependents' Lists" section, the public-feed Sprout entry, the
	// /received per-dependent block, and the permissions-matrix
	// dependent column.
	console.log('🌱 Creating dependent...')
	const petId = crypto.randomUUID()
	await db.insert(dependents).values({
		id: petId,
		name: 'Buddy',
		image: photo('golden retriever puppy', 600, 600),
		birthMonth: 'april',
		birthDay: 22,
		birthYear: 2021,
		createdByUserId: adminId,
	})
	await db.insert(dependentGuardianships).values([
		{ guardianUserId: adminId, dependentId: petId },
		{ guardianUserId: partnerId, dependentId: petId },
	])

	// ---------------------------------------------------- USER RELATIONSHIPS
	// admin ↔ partner: full mutual edit (also handled by partnership).
	// admin ↔ friend: mutual view+edit.
	// admin ↔ gifter: mutual view-only (pure gifter-mode capture).
	// admin ↔ nobday: mutual view-only (pure gifter-mode capture, sparse data).
	console.log('👥 Wiring view/edit grants...')
	await db.insert(userRelationships).values([
		{ ownerUserId: adminId, viewerUserId: partnerId, accessLevel: 'view', canEdit: true },
		{ ownerUserId: partnerId, viewerUserId: adminId, accessLevel: 'view', canEdit: true },
		{ ownerUserId: adminId, viewerUserId: friendId, accessLevel: 'view', canEdit: true },
		{ ownerUserId: friendId, viewerUserId: adminId, accessLevel: 'view', canEdit: true },
		{ ownerUserId: adminId, viewerUserId: gifterId, accessLevel: 'view', canEdit: false },
		{ ownerUserId: gifterId, viewerUserId: adminId, accessLevel: 'view', canEdit: false },
		{ ownerUserId: adminId, viewerUserId: nobdayId, accessLevel: 'view', canEdit: false },
		{ ownerUserId: nobdayId, viewerUserId: adminId, accessLevel: 'view', canEdit: false },
		// Friend ↔ gifter so partial-claim scenarios on gifter's list make sense.
		{ ownerUserId: gifterId, viewerUserId: friendId, accessLevel: 'view', canEdit: false },
		{ ownerUserId: friendId, viewerUserId: gifterId, accessLevel: 'view', canEdit: false },
		// Partner ↔ friend so cross-claims on each other's lists work.
		{ ownerUserId: partnerId, viewerUserId: friendId, accessLevel: 'view', canEdit: false },
		{ ownerUserId: friendId, viewerUserId: partnerId, accessLevel: 'view', canEdit: false },
		// Restricted owner ↔ admin: admin sees the distant user's lists only
		// in the filtered restricted view; the distant user gets default view
		// of admin (no overrides). Restricted owner ↔ friend + gifter is
		// view-only so the seed can add real claims by them on the distant
		// user's items (those claims should be hidden from admin).
		{ ownerUserId: restrictedOwnerId, viewerUserId: adminId, accessLevel: 'restricted', canEdit: false },
		{ ownerUserId: restrictedOwnerId, viewerUserId: friendId, accessLevel: 'view', canEdit: false },
		{ ownerUserId: friendId, viewerUserId: restrictedOwnerId, accessLevel: 'view', canEdit: false },
		{ ownerUserId: restrictedOwnerId, viewerUserId: gifterId, accessLevel: 'view', canEdit: false },
		{ ownerUserId: gifterId, viewerUserId: restrictedOwnerId, accessLevel: 'view', canEdit: false },
	])

	// --------------------------------------------------------------- LISTS
	console.log('📝 Creating lists (varied types/privacies/access)...')

	// Admin's lists - the main focus of screenshots.
	const adminWishlist = await createList({
		name: 'Birthday Wishlist',
		ownerId: adminId,
		isPrimary: true,
		description: LONG_DESCRIPTION,
		createdAt: daysAgo(120),
	})
	const adminChristmas = await createList({
		name: 'Christmas List',
		type: 'christmas',
		ownerId: adminId,
		description: 'Stuff that would be cozy for the holidays.',
		createdAt: daysAgo(45),
	})
	const adminBirthday = await createList({
		name: 'Big 4-0',
		type: 'birthday',
		ownerId: adminId,
		// no description on purpose - exercises empty-description state
		createdAt: daysAgo(60),
	})
	const adminTodos = await createList({
		name: 'House Projects',
		type: 'todos',
		ownerId: adminId,
		description: 'Spring cleanup + ongoing weekend projects.',
		createdAt: daysAgo(90),
	})
	const adminPrivate = await createList({
		name: 'Private Wishlist',
		ownerId: adminId,
		isPrivate: true,
		description: 'For my eyes only.',
		createdAt: daysAgo(30),
	})
	const adminIdeasForPartner = await createList({
		name: 'Ideas for Alex',
		type: 'giftideas',
		ownerId: adminId,
		giftIdeasTargetUserId: partnerId,
		description: 'Things I have heard Alex mention - keep adding to this list.',
		createdAt: daysAgo(75),
	})

	// Partner's lists
	const partnerWishlist = await createList({
		name: 'Wishlist',
		ownerId: partnerId,
		isPrimary: true,
		description: 'Open to alternatives on anything here.',
		createdAt: daysAgo(80),
	})
	const partnerBirthday = await createList({
		name: 'Birthday',
		type: 'birthday',
		ownerId: partnerId,
		createdAt: daysAgo(20),
	})
	const partnerChristmas = await createList({
		name: 'Christmas',
		type: 'christmas',
		ownerId: partnerId,
		description: 'Anything cozy is great.',
		createdAt: daysAgo(35),
	})
	const partnerIdeasForAdmin = await createList({
		name: 'Ideas for Sam',
		type: 'giftideas',
		ownerId: partnerId,
		giftIdeasTargetUserId: adminId,
		createdAt: daysAgo(60),
	})

	// Friend's lists - admin views as gifter (mutual edit, but we capture
	// the gifter view).
	const friendWishlist = await createList({
		name: "Jordan's Wishlist",
		ownerId: friendId,
		isPrimary: true,
		createdAt: daysAgo(100),
	})
	const friendChristmas = await createList({
		name: "Jordan's Christmas",
		type: 'christmas',
		ownerId: friendId,
		createdAt: daysAgo(28),
	})

	// Gifter's lists - admin views as gifter (view-only relationship, no
	// edit affordances should appear in captures).
	const gifterWishlist = await createList({
		name: "Morgan's Wishlist",
		ownerId: gifterId,
		isPrimary: true,
		description: 'Slow accumulation - mostly small things.',
		createdAt: daysAgo(110),
	})
	const gifterBirthday = await createList({
		name: "Morgan's Birthday",
		type: 'birthday',
		ownerId: gifterId,
		createdAt: daysAgo(40),
	})

	// Nobday's wishlist - sparse data on purpose: minimal fields filled.
	const nobdayWishlist = await createList({
		name: "Riley's Wishlist",
		ownerId: nobdayId,
		isPrimary: true,
		// no description on purpose
		createdAt: daysAgo(15),
	})

	// Child's lists
	const childWishlist = await createList({
		name: "Casey's Wishlist",
		ownerId: childId,
		isPrimary: true,
		createdAt: daysAgo(40),
	})
	const childChristmas = await createList({
		name: "Casey's Christmas",
		type: 'christmas',
		ownerId: childId,
		createdAt: daysAgo(25),
	})

	// Dependent-subject list (Buddy the pet, co-managed by admin + partner).
	// Owner stays the guardian; subjectDependentId flips the recipient
	// identity throughout the app.
	const buddyWishlist = await createList({
		name: "Buddy's Wishlist",
		ownerId: adminId,
		isPrimary: true,
		subjectDependentId: petId,
		description: 'Treats, toys, and the occasional sweater.',
		createdAt: daysAgo(35),
	})

	// Distant user's wishlist - admin sees this through the restricted lens.
	const restrictedOwnerWishlist = await createList({
		name: "Sky's Wishlist",
		ownerId: restrictedOwnerId,
		isPrimary: true,
		description: 'Casual list - no rush on anything.',
		createdAt: daysAgo(45),
	})

	// --------------------------------------------- ITEMS - admin primary wishlist
	// Kitchen-sink: every priority, varied lengths, mix of states. Time
	// distribution is older → newer down the list.
	console.log('🎁 Adding admin primary wishlist (kitchen-sink)...')
	const adminItems = await insertItems([
		{
			listId: adminWishlist,
			title: 'Espresso machine',
			priority: 'very-high',
			url: 'https://amazon.com/espresso',
			notes: LONG_NOTES,
			imageUrl: ph.square('Espresso', '1f2937'),
			price: '1499.00',
			currency: 'USD',
			quantity: 1,
			createdAt: daysAgo(310),
		},
		{
			listId: adminWishlist,
			title: 'Noise-cancelling headphones',
			priority: 'high',
			url: 'https://walmart.com/headphones',
			notes: MEDIUM_NOTES,
			imageUrl: ph.square('Headphones', '0f172a'),
			price: '299.00',
			currency: 'USD',
			createdAt: daysAgo(220),
		},
		{
			listId: adminWishlist,
			title: LONG_TITLE,
			priority: 'normal',
			notes: 'No rush on this one.',
			imageUrl: ph.tall('Stoneware', 'b45309'),
			price: '64.00',
			currency: 'USD',
			createdAt: daysAgo(155),
		},
		{
			listId: adminWishlist,
			title: 'Limited edition vinyl',
			priority: 'normal',
			availability: 'unavailable',
			availabilityChangedAt: daysAgo(2),
			imageUrl: ph.square('Vinyl', '171717'),
			price: '45.00',
			currency: 'USD',
			notes: 'This one is sold out at the label - waiting on a restock.',
			createdAt: daysAgo(105),
		},
		{
			listId: adminWishlist,
			title: 'Leather journal',
			priority: 'normal',
			imageUrl: ph.tall('Journal', '78350f'),
			price: '42.00',
			currency: 'USD',
			notes: MEDIUM_NOTES,
			createdAt: daysAgo(70),
		},
		{
			listId: adminWishlist,
			title: 'Pencil set',
			priority: 'low',
			quantity: 2,
			price: '5.00',
			currency: 'USD',
			createdAt: daysAgo(45),
		},
		{
			listId: adminWishlist,
			title: 'Box of chocolates',
			priority: 'normal',
			quantity: 5,
			imageUrl: ph.square('Chocolates', 'a16207'),
			price: '18.00',
			currency: 'USD',
			notes: 'Any flavor mix is fine.',
			createdAt: daysAgo(18),
		},
		{
			listId: adminWishlist,
			title: 'New cookbook',
			priority: 'high',
			imageUrl: ph.tall('Cookbook', 'be185d'),
			price: '34.50',
			currency: 'USD',
			notes: 'Vegetarian focus, ideally one with weeknight-fast recipes.',
			isArchived: true, // archived = received gift (claim below)
			createdAt: daysAgo(95),
		},
		{
			listId: adminWishlist,
			title: 'Stand mixer',
			priority: 'high',
			imageUrl: ph.square('Mixer', 'be185d'),
			price: '449.00',
			currency: 'USD',
			notes: 'Color preference: matte black or sage green.',
			isArchived: true, // archived = received gift
			createdAt: daysAgo(70),
		},
		{
			listId: adminWishlist,
			title: 'A really old idea',
			priority: 'low',
			isArchived: true,
			createdAt: daysAgo(150),
		},
	])

	// Groups: one "or" pick-one, one "order" sequence, one empty.
	const cameraPick = await createGroup({ listId: adminWishlist, name: 'Pick one camera', type: 'or', priority: 'high' })
	await insertItems([
		{
			listId: adminWishlist,
			groupId: cameraPick,
			title: 'Mirrorless body A',
			priority: 'high',
			price: '1499.00',
			currency: 'USD',
			imageUrl: ph.square('Cam A', '262626'),
			createdAt: daysAgo(50),
		},
		{
			listId: adminWishlist,
			groupId: cameraPick,
			title: 'Mirrorless body B',
			priority: 'high',
			price: '1699.00',
			currency: 'USD',
			imageUrl: ph.square('Cam B', '404040'),
			createdAt: daysAgo(50),
		},
		{
			listId: adminWishlist,
			groupId: cameraPick,
			title: 'Refurb body C',
			priority: 'normal',
			price: '899.00',
			currency: 'USD',
			createdAt: daysAgo(50),
		},
	])

	const consoleSetup = await createGroup({
		listId: adminWishlist,
		name: 'Console setup',
		type: 'order',
		priority: 'very-high',
	})
	await insertItems([
		{
			listId: adminWishlist,
			groupId: consoleSetup,
			title: 'Gaming console',
			priority: 'very-high',
			price: '499.99',
			currency: 'USD',
			imageUrl: ph.wide('Console', '111827'),
			groupSortOrder: 1,
			createdAt: daysAgo(30),
		},
		{
			listId: adminWishlist,
			groupId: consoleSetup,
			title: 'Extra controller',
			priority: 'very-high',
			quantity: 2,
			price: '69.99',
			currency: 'USD',
			groupSortOrder: 2,
			createdAt: daysAgo(30),
		},
		{
			listId: adminWishlist,
			groupId: consoleSetup,
			title: 'Launch title game',
			priority: 'high',
			price: '59.99',
			currency: 'USD',
			groupSortOrder: 3,
			createdAt: daysAgo(30),
		},
	])

	await createGroup({ listId: adminWishlist, name: 'Future ideas (empty)', priority: 'normal' })

	// --------------------------------------------- ITEMS - admin christmas
	await insertItems([
		{
			listId: adminChristmas,
			title: 'Cozy wool blanket',
			priority: 'high',
			imageUrl: ph.wide('Blanket', 'b91c1c'),
			price: '79.00',
			currency: 'USD',
			createdAt: daysAgo(40),
		},
		{ listId: adminChristmas, title: 'Fancy candle', priority: 'normal', quantity: 2, createdAt: daysAgo(35) },
		{ listId: adminChristmas, title: 'New mittens', priority: 'low', createdAt: daysAgo(25) },
		{
			listId: adminChristmas,
			title: 'Slippers',
			priority: 'normal',
			price: '55.00',
			currency: 'USD',
			notes: 'Size 9, leather sole if possible.',
			createdAt: daysAgo(15),
		},
	])

	// --------------------------------------------- ITEMS - admin birthday
	await insertItems([
		{
			listId: adminBirthday,
			title: 'Bottle of nice scotch',
			priority: 'high',
			price: '120.00',
			currency: 'USD',
			imageUrl: ph.tall('Scotch', '78350f'),
			createdAt: daysAgo(50),
		},
		{ listId: adminBirthday, title: 'Plant for the office', priority: 'normal', createdAt: daysAgo(40) },
		{
			listId: adminBirthday,
			title: 'That sold-out concert ticket',
			priority: 'high',
			availability: 'unavailable',
			availabilityChangedAt: daysAgo(7),
			notes: 'Resale only - long shot.',
			createdAt: daysAgo(30),
		},
	])

	// --------------------------------------------- ITEMS - admin todos
	await insertItems([
		{ listId: adminTodos, title: 'Replace smoke alarm batteries', priority: 'very-high', status: 'incomplete', createdAt: daysAgo(60) },
		{ listId: adminTodos, title: 'Fix the squeaky door', priority: 'high', status: 'incomplete', createdAt: daysAgo(58) },
		{ listId: adminTodos, title: 'Clean the gutters', priority: 'normal', status: 'complete', createdAt: daysAgo(45) },
		{ listId: adminTodos, title: 'Re-caulk bathtub', priority: 'normal', status: 'incomplete', createdAt: daysAgo(40) },
		{ listId: adminTodos, title: 'Schedule HVAC tune-up', priority: 'normal', status: 'complete', createdAt: daysAgo(30) },
		{ listId: adminTodos, title: 'Touch up paint in hallway', priority: 'low', status: 'incomplete', createdAt: daysAgo(25) },
		{
			listId: adminTodos,
			title: 'Order replacement filter',
			priority: 'low',
			status: 'incomplete',
			availability: 'unavailable',
			availabilityChangedAt: daysAgo(5),
			notes: 'Out of stock at the usual place.',
			createdAt: daysAgo(20),
		},
		{
			listId: adminTodos,
			title: 'Move pile of mail off counter',
			priority: 'low',
			status: 'complete',
			isArchived: true,
			createdAt: daysAgo(80),
		},
	])

	// --------------------------------------------- ITEMS - admin private
	await insertItems([
		{
			listId: adminPrivate,
			title: 'Therapy journal',
			priority: 'high',
			notes: 'Just for me.',
			createdAt: daysAgo(28),
		},
		{
			listId: adminPrivate,
			title: 'That expensive perfume',
			priority: 'low',
			price: '220.00',
			currency: 'USD',
			imageUrl: ph.tall('Perfume', '4c1d95'),
			createdAt: daysAgo(20),
		},
	])

	// --------------------------------------------- ITEMS - admin ideas for partner
	await insertItems([
		{
			listId: adminIdeasForPartner,
			title: 'New leather wallet',
			priority: 'high',
			notes: 'Theirs is falling apart.',
			createdAt: daysAgo(70),
		},
		{ listId: adminIdeasForPartner, title: 'Subscription to that magazine', priority: 'normal', createdAt: daysAgo(50) },
		{ listId: adminIdeasForPartner, title: 'Replacement for the ugly mug', priority: 'low', createdAt: daysAgo(20) },
	])

	// --------------------------------------------- ITEMS - partner wishlist
	console.log('🎁 Adding partner items...')
	const partnerItems = await insertItems([
		{
			listId: partnerWishlist,
			title: 'Mountain bike helmet',
			priority: 'high',
			imageUrl: ph.square('Helmet', '1d4ed8'),
			price: '110.00',
			currency: 'USD',
			createdAt: daysAgo(75),
		},
		{
			listId: partnerWishlist,
			title: 'Cycling jersey, large',
			priority: 'normal',
			notes: SHORT_NOTES,
			createdAt: daysAgo(65),
		},
		{
			listId: partnerWishlist,
			title: 'Trail running shoes',
			priority: 'normal',
			availability: 'unavailable',
			availabilityChangedAt: daysAgo(12),
			notes: 'Out of stock everywhere right now.',
			createdAt: daysAgo(55),
		},
		{
			listId: partnerWishlist,
			title: 'New chef knife',
			priority: 'high',
			price: '180.00',
			currency: 'USD',
			imageUrl: ph.square('Knife', '0f172a'),
			notes: MEDIUM_NOTES,
			createdAt: daysAgo(35),
		},
		{
			listId: partnerWishlist,
			title: 'A really good cookbook',
			priority: 'normal',
			price: '34.50',
			currency: 'USD',
			imageUrl: ph.tall('Cookbook', '14b8a6'),
			createdAt: daysAgo(22),
		},
		{
			listId: partnerWishlist,
			title: 'Garage shelving',
			priority: 'low',
			createdAt: daysAgo(15),
		},
		{
			listId: partnerWishlist,
			title: 'Fancy hot sauce sampler',
			priority: 'normal',
			isArchived: true, // already received
			imageUrl: ph.square('Hot Sauce', 'b91c1c'),
			price: '48.00',
			currency: 'USD',
			createdAt: daysAgo(90),
		},
	])

	// Partner wishlist groups: an "or" pick-one with one sibling already
	// claimed (so admin in gifter mode sees the others locked) and an
	// "order" sequence with the first step claimed (so the second step is
	// the only one currently claimable). Gives the gifter view real
	// group-state surfaces to capture.
	const partnerTentPick = await createGroup({
		listId: partnerWishlist,
		name: 'Pick one tent',
		type: 'or',
		priority: 'high',
	})
	const partnerTentItems = await insertItems([
		{
			listId: partnerWishlist,
			groupId: partnerTentPick,
			title: 'Two-person backpacking tent',
			priority: 'high',
			price: '320.00',
			currency: 'USD',
			imageUrl: ph.square('Tent', '15803d'),
			createdAt: daysAgo(45),
		},
		{
			listId: partnerWishlist,
			groupId: partnerTentPick,
			title: 'Three-person family tent',
			priority: 'high',
			price: '420.00',
			currency: 'USD',
			imageUrl: ph.square('Tent Family', '166534'),
			createdAt: daysAgo(45),
		},
		{
			listId: partnerWishlist,
			groupId: partnerTentPick,
			title: 'Lightweight bivy',
			priority: 'normal',
			price: '180.00',
			currency: 'USD',
			createdAt: daysAgo(45),
		},
	])

	const partnerBikeOrder = await createGroup({
		listId: partnerWishlist,
		name: 'Bike upgrade kit',
		type: 'order',
		priority: 'very-high',
	})
	const partnerBikeItems = await insertItems([
		{
			listId: partnerWishlist,
			groupId: partnerBikeOrder,
			title: 'Drivetrain swap (groupset)',
			priority: 'very-high',
			price: '550.00',
			currency: 'USD',
			imageUrl: ph.wide('Drivetrain', '0f172a'),
			groupSortOrder: 1,
			createdAt: daysAgo(40),
		},
		{
			listId: partnerWishlist,
			groupId: partnerBikeOrder,
			title: 'Replacement wheelset',
			priority: 'high',
			price: '780.00',
			currency: 'USD',
			groupSortOrder: 2,
			createdAt: daysAgo(40),
		},
		{
			listId: partnerWishlist,
			groupId: partnerBikeOrder,
			title: 'Carbon handlebar',
			priority: 'normal',
			price: '210.00',
			currency: 'USD',
			groupSortOrder: 3,
			createdAt: daysAgo(40),
		},
	])

	await insertItems([
		{ listId: partnerBirthday, title: 'Spa day gift card', priority: 'high', price: '150.00', currency: 'USD', createdAt: daysAgo(15) },
		{ listId: partnerBirthday, title: 'Bottle of natural wine', priority: 'normal', quantity: 2, createdAt: daysAgo(12) },
	])

	// Partner christmas - mix of unclaimed + already-claimed-by-friend so admin
	// sees a realistic gifter-view with some items already taken.
	const partnerChristmasItems = await insertItems([
		{
			listId: partnerChristmas,
			title: 'Wool throw blanket',
			priority: 'high',
			imageUrl: ph.wide('Throw', 'b91c1c'),
			price: '95.00',
			currency: 'USD',
			createdAt: daysAgo(30),
		},
		{
			listId: partnerChristmas,
			title: 'Hand-poured candle set',
			priority: 'normal',
			quantity: 3,
			price: '36.00',
			currency: 'USD',
			imageUrl: ph.square('Candles', 'a16207'),
			createdAt: daysAgo(28),
		},
		{
			listId: partnerChristmas,
			title: 'Ceramic pour-over cone',
			priority: 'normal',
			price: '48.00',
			currency: 'USD',
			notes: SHORT_NOTES,
			createdAt: daysAgo(20),
		},
		{
			listId: partnerChristmas,
			title: 'Reading light',
			priority: 'low',
			createdAt: daysAgo(14),
		},
	])

	await insertItems([
		{ listId: partnerIdeasForAdmin, title: 'Dust collector for the workshop', priority: 'high', createdAt: daysAgo(50) },
		{ listId: partnerIdeasForAdmin, title: 'Thicker yoga mat', priority: 'normal', createdAt: daysAgo(35) },
	])

	// --------------------------------------------- ITEMS - friend wishlist
	console.log('🎁 Adding friend items...')
	const friendItems = await insertItems([
		{
			listId: friendWishlist,
			title: 'Indoor herb garden kit',
			priority: 'high',
			imageUrl: ph.wide('Gardening', '15803d'),
			price: '65.00',
			currency: 'USD',
			notes: MEDIUM_NOTES,
			createdAt: daysAgo(95),
		},
		{
			listId: friendWishlist,
			title: 'Good tea',
			priority: 'normal',
			quantity: 2,
			imageUrl: ph.square('Tea', '047857'),
			price: '24.00',
			currency: 'USD',
			notes: [
				'A few I keep coming back to:',
				'',
				'- [Harney & Sons Paris Black Tea](https://example.test/harney-paris)',
				'- [Bellocq No. 19 White Wolf](https://example.test/bellocq-white-wolf)',
				'- [Rishi Jade Cloud Green](https://example.test/rishi-jade-cloud)',
				'- [Smith Teamaker Lord Bergamot](https://example.test/smith-lord-bergamot)',
				'- [In Pursuit of Tea Silver Needle](https://example.test/ipot-silver-needle)',
			].join('\n'),
			createdAt: daysAgo(60),
		},
		{
			listId: friendWishlist,
			title: 'A houseplant',
			priority: 'low',
			createdAt: daysAgo(30),
		},
		{
			listId: friendWishlist,
			title: 'Vintage record',
			priority: 'low',
			availability: 'unavailable',
			availabilityChangedAt: daysAgo(40),
			notes: 'It is gone. RIP.',
			createdAt: daysAgo(20),
		},
	])

	// Friend christmas - smaller list, mix of claim states
	const friendChristmasItems = await insertItems([
		{
			listId: friendChristmas,
			title: 'Beeswax candles',
			priority: 'normal',
			quantity: 4,
			price: '28.00',
			currency: 'USD',
			imageUrl: ph.square('Beeswax', 'a16207'),
			createdAt: daysAgo(25),
		},
		{
			listId: friendChristmas,
			title: 'Wool slippers',
			priority: 'high',
			price: '85.00',
			currency: 'USD',
			imageUrl: ph.wide('Slippers', '78350f'),
			createdAt: daysAgo(22),
		},
		{
			listId: friendChristmas,
			title: 'Tea sampler box',
			priority: 'normal',
			price: '32.00',
			currency: 'USD',
			notes: 'Loose-leaf only please.',
			createdAt: daysAgo(18),
		},
		{
			listId: friendChristmas,
			title: 'Bird feeder',
			priority: 'low',
			createdAt: daysAgo(10),
		},
	])

	// --------------------------------------------- ITEMS - gifter (view-only)
	console.log('🎁 Adding gifter items...')
	const gifterItems = await insertItems([
		{
			listId: gifterWishlist,
			title: 'Field notebook',
			priority: 'normal',
			quantity: 3,
			price: '12.00',
			currency: 'USD',
			imageUrl: ph.tall('Notebook', '0f172a'),
			createdAt: daysAgo(95),
		},
		{
			listId: gifterWishlist,
			title: 'Bluetooth speaker',
			priority: 'high',
			price: '129.00',
			currency: 'USD',
			imageUrl: ph.square('Speaker', '1f2937'),
			notes: MEDIUM_NOTES,
			createdAt: daysAgo(80),
		},
		{
			listId: gifterWishlist,
			title: 'Hiking socks',
			priority: 'normal',
			quantity: 6,
			price: '18.00',
			currency: 'USD',
			createdAt: daysAgo(60),
		},
		{
			listId: gifterWishlist,
			title: 'Trail map of the local range',
			priority: 'low',
			price: '15.00',
			currency: 'USD',
			createdAt: daysAgo(45),
		},
		{
			listId: gifterWishlist,
			title: 'Pour-over filters',
			priority: 'low',
			quantity: 2,
			availability: 'unavailable',
			availabilityChangedAt: daysAgo(8),
			notes: 'Out of stock at the usual roaster.',
			createdAt: daysAgo(30),
		},
		{
			listId: gifterWishlist,
			title: 'Insulated water bottle',
			priority: 'normal',
			price: '42.00',
			currency: 'USD',
			imageUrl: ph.tall('Bottle', '0e7490'),
			createdAt: daysAgo(20),
		},
	])

	// gifter "or" group - pick one backpack
	const gifterBackpackPick = await createGroup({
		listId: gifterWishlist,
		name: 'Pick one backpack',
		type: 'or',
		priority: 'high',
	})
	await insertItems([
		{
			listId: gifterWishlist,
			groupId: gifterBackpackPick,
			title: 'Daypack (20L)',
			priority: 'high',
			price: '120.00',
			currency: 'USD',
			imageUrl: ph.square('Daypack', '1d4ed8'),
			createdAt: daysAgo(40),
		},
		{
			listId: gifterWishlist,
			groupId: gifterBackpackPick,
			title: 'Overnight pack (35L)',
			priority: 'high',
			price: '180.00',
			currency: 'USD',
			createdAt: daysAgo(40),
		},
	])

	const gifterBirthdayItems = await insertItems([
		{ listId: gifterBirthday, title: 'Cast iron skillet', priority: 'high', price: '69.00', currency: 'USD', createdAt: daysAgo(35) },
		{ listId: gifterBirthday, title: 'Hot sauce of the month', priority: 'normal', notes: SHORT_NOTES, createdAt: daysAgo(30) },
		{ listId: gifterBirthday, title: 'Replacement watch strap', priority: 'low', createdAt: daysAgo(18) },
	])

	// --------------------------------------------- ITEMS - nobday (sparse)
	console.log('🎁 Adding nobday items (sparse)...')
	const nobdayItems = await insertItems([
		{ listId: nobdayWishlist, title: 'A book', priority: 'normal', createdAt: daysAgo(12) },
		{ listId: nobdayWishlist, title: 'Something for the kitchen', priority: 'low', createdAt: daysAgo(10) },
		{ listId: nobdayWishlist, title: 'Surprise me', priority: 'low', createdAt: daysAgo(8) },
	])

	// --------------------------------------------- ITEMS - child
	await insertItems([
		{
			listId: childWishlist,
			title: 'LEGO set',
			priority: 'very-high',
			imageUrl: ph.square('LEGO', 'eab308'),
			price: '79.99',
			currency: 'USD',
			createdAt: daysAgo(35),
		},
		{
			listId: childWishlist,
			title: 'Art supplies',
			priority: 'normal',
			quantity: 2,
			imageUrl: ph.wide('Art Supplies', 'db2777'),
			price: '32.00',
			currency: 'USD',
			createdAt: daysAgo(30),
		},
		{ listId: childWishlist, title: 'New scooter', priority: 'high', createdAt: daysAgo(20) },
		{ listId: childWishlist, title: 'Skateboard wheels', priority: 'low', quantity: 4, createdAt: daysAgo(10) },
	])

	await insertItems([
		{ listId: childChristmas, title: 'Bike bell', priority: 'normal', createdAt: daysAgo(20) },
		{
			listId: childChristmas,
			title: 'Stuffed dragon',
			priority: 'high',
			imageUrl: ph.tall('Dragon', '7c3aed'),
			createdAt: daysAgo(15),
		},
		{ listId: childChristmas, title: 'Sticker book', priority: 'low', quantity: 3, createdAt: daysAgo(8) },
	])

	// ---------------------------------------------------- ITEMS - dependent
	console.log('🎁 Adding Buddy items...')
	await insertItems([
		{
			listId: buddyWishlist,
			title: 'Salmon-flavor training treats',
			priority: 'high',
			quantity: 2,
			imageUrl: ph.square('Treats', 'f97316'),
			createdAt: daysAgo(28),
		},
		{
			listId: buddyWishlist,
			title: 'Heavy-duty rope toy',
			priority: 'normal',
			price: '18.00',
			currency: 'USD',
			createdAt: daysAgo(20),
		},
		{
			listId: buddyWishlist,
			title: 'New collar, medium',
			priority: 'normal',
			price: '24.00',
			currency: 'USD',
			createdAt: daysAgo(12),
		},
		{ listId: buddyWishlist, title: 'Heated bed (winter, eventually)', priority: 'low', createdAt: daysAgo(5) },
	])

	// ---------------------------------------------------- ITEMS - distant (restricted)
	console.log('🎁 Adding distant-user items (restricted view)...')
	const restrictedOwnerItems = await insertItems([
		{
			listId: restrictedOwnerWishlist,
			title: 'Travel adapter set',
			priority: 'normal',
			price: '32.00',
			currency: 'USD',
			imageUrl: ph.square('Adapter', '0f172a'),
			createdAt: daysAgo(40),
		},
		{
			listId: restrictedOwnerWishlist,
			title: 'Carry-on suitcase',
			priority: 'high',
			price: '240.00',
			currency: 'USD',
			imageUrl: ph.wide('Suitcase', '1f2937'),
			createdAt: daysAgo(35),
		},
		{
			listId: restrictedOwnerWishlist,
			title: 'Packing cubes (set of 6)',
			priority: 'normal',
			price: '38.00',
			currency: 'USD',
			createdAt: daysAgo(28),
		},
		{
			listId: restrictedOwnerWishlist,
			title: 'Noise-cancelling earbuds',
			priority: 'high',
			price: '199.00',
			currency: 'USD',
			imageUrl: ph.square('Earbuds', '0e7490'),
			createdAt: daysAgo(20),
		},
		{
			listId: restrictedOwnerWishlist,
			title: 'Pocket umbrella',
			priority: 'low',
			price: '22.00',
			currency: 'USD',
			createdAt: daysAgo(15),
		},
		{
			listId: restrictedOwnerWishlist,
			title: 'Reading lamp',
			priority: 'low',
			createdAt: daysAgo(10),
		},
	])

	// ----------------------------------------------------- CLAIMS / GIFTS
	// Admin RECEIVED gifts:
	//  - cookbook (full, archived) from partner
	//  - stand mixer (full + co-gifter) from friend with gifter as co
	//  - pencil set (partial 1 of 2) from gifter
	//  - chocolates (partial 2 of 5) from friend
	//
	// Admin GAVE gifts:
	//  - to partner: chef knife (full)
	//  - to partner: cycling jersey (full)
	//  - to friend:  herb garden kit (full)
	//  - to child:   LEGO set (full)
	//
	// Partner GAVE gifts:
	//  - to admin: cookbook + stand mixer (above)
	//  - to admin: leather journal (full)
	//  - to friend: tea (partial 1 of 2)
	console.log('🎉 Recording claims...')
	await db.insert(giftedItems).values([
		// Admin received
		{
			itemId: need(adminItems, 'New cookbook'),
			gifterId: partnerId,
			quantity: 1,
			totalCost: '34.50',
			notes: 'Picked it up at the bookshop downtown.',
			createdAt: daysAgo(80),
		},
		{
			itemId: need(adminItems, 'Stand mixer'),
			gifterId: friendId,
			additionalGifterIds: [gifterId],
			quantity: 1,
			totalCost: '449.00',
			notes: 'Going in together.',
			createdAt: daysAgo(60),
		},
		{
			itemId: need(adminItems, 'Pencil set'),
			gifterId: gifterId,
			quantity: 1,
			totalCost: '5.00',
			createdAt: daysAgo(8),
		},
		{
			itemId: need(adminItems, 'Box of chocolates'),
			gifterId: friendId,
			quantity: 2,
			totalCost: '36.00',
			createdAt: daysAgo(5),
		},
		// Admin gave
		{
			itemId: need(partnerItems, 'New chef knife'),
			gifterId: adminId,
			quantity: 1,
			totalCost: '180.00',
			notes: 'Already ordered, arriving Friday.',
			createdAt: daysAgo(28),
		},
		{
			itemId: need(partnerItems, 'Cycling jersey, large'),
			gifterId: adminId,
			quantity: 1,
			createdAt: daysAgo(20),
		},
		{
			itemId: need(friendItems, 'Indoor herb garden kit'),
			gifterId: adminId,
			quantity: 1,
			totalCost: '65.00',
			createdAt: daysAgo(15),
		},
		// Partner gave
		{
			itemId: need(adminItems, 'Leather journal'),
			gifterId: partnerId,
			quantity: 1,
			totalCost: '42.00',
			createdAt: daysAgo(12),
		},
		{
			itemId: need(friendItems, 'Good tea'),
			gifterId: partnerId,
			quantity: 1,
			totalCost: '24.00',
			createdAt: daysAgo(10),
		},
		// Gifter co-claimed Hot Sauce sampler on partner's archived item (received)
		{
			itemId: need(partnerItems, 'Fancy hot sauce sampler'),
			gifterId: gifterId,
			quantity: 1,
			totalCost: '48.00',
			createdAt: daysAgo(85),
		},
	])

	// LEGO set for child - admin + partner co-gift
	await db.insert(giftedItems).values([
		{
			itemId: (
				await db
					.select({ id: items.id })
					.from(items)
					.where(sql`${items.listId} = ${childWishlist} AND ${items.title} = 'LEGO set'`)
			)[0].id,
			gifterId: adminId,
			additionalGifterIds: [partnerId],
			quantity: 1,
			totalCost: '79.99',
			createdAt: daysAgo(18),
		},
	])

	// Cross-list claims to populate the gifter-view captures with realistic
	// "claimed by someone else" / "partial claim" / "you've already claimed
	// this" states.
	await db.insert(giftedItems).values([
		// Partner christmas: friend claimed the throw blanket; gifter took 1
		// of 3 candles; admin claimed the pour-over (so admin's /purchases
		// shows multiple cross-user claims).
		{
			itemId: need(partnerChristmasItems, 'Wool throw blanket'),
			gifterId: friendId,
			quantity: 1,
			totalCost: '95.00',
			createdAt: daysAgo(22),
		},
		{
			itemId: need(partnerChristmasItems, 'Hand-poured candle set'),
			gifterId: gifterId,
			quantity: 1,
			totalCost: '12.00',
			createdAt: daysAgo(15),
		},
		{
			itemId: need(partnerChristmasItems, 'Ceramic pour-over cone'),
			gifterId: adminId,
			quantity: 1,
			totalCost: '48.00',
			createdAt: daysAgo(9),
		},

		// Friend christmas: gifter claimed slippers; partner took 2 of 4
		// beeswax candles; admin claimed the tea sampler.
		{ itemId: need(friendChristmasItems, 'Wool slippers'), gifterId: gifterId, quantity: 1, totalCost: '85.00', createdAt: daysAgo(18) },
		{ itemId: need(friendChristmasItems, 'Beeswax candles'), gifterId: partnerId, quantity: 2, totalCost: '14.00', createdAt: daysAgo(12) },
		{ itemId: need(friendChristmasItems, 'Tea sampler box'), gifterId: adminId, quantity: 1, totalCost: '32.00', createdAt: daysAgo(6) },

		// Gifter wishlist: friend claimed the speaker (full); partner took 2
		// of 6 hiking socks; admin claimed the water bottle (so admin shows
		// up in the gifter's "received" view too).
		{
			itemId: need(gifterItems, 'Bluetooth speaker'),
			gifterId: friendId,
			quantity: 1,
			totalCost: '129.00',
			notes: 'Already shipped.',
			createdAt: daysAgo(50),
		},
		{ itemId: need(gifterItems, 'Hiking socks'), gifterId: partnerId, quantity: 2, totalCost: '36.00', createdAt: daysAgo(35) },
		{ itemId: need(gifterItems, 'Insulated water bottle'), gifterId: adminId, quantity: 1, totalCost: '42.00', createdAt: daysAgo(11) },
		// Field notebooks - admin took 1 of 3 (partial claim authored by admin)
		{ itemId: need(gifterItems, 'Field notebook'), gifterId: adminId, quantity: 1, totalCost: '12.00', createdAt: daysAgo(60) },

		// Gifter birthday: friend + admin co-gift the cast iron skillet.
		{
			itemId: need(gifterBirthdayItems, 'Cast iron skillet'),
			gifterId: friendId,
			additionalGifterIds: [adminId],
			quantity: 1,
			totalCost: '69.00',
			notes: 'Going in together.',
			createdAt: daysAgo(20),
		},

		// Nobday: admin claimed "A book" (so even sparse list shows a claim).
		{ itemId: need(nobdayItems, 'A book'), gifterId: adminId, quantity: 1, createdAt: daysAgo(7) },

		// Partner tent "or" group: friend already grabbed the family tent, so
		// admin's gifter view should render the other two siblings as locked
		// out by `group-already-claimed`.
		{
			itemId: need(partnerTentItems, 'Three-person family tent'),
			gifterId: friendId,
			quantity: 1,
			totalCost: '420.00',
			notes: 'Picked it up at the outdoor co-op.',
			createdAt: daysAgo(14),
		},

		// Partner bike "order" group: gifter took the first step (drivetrain).
		// Steps 2+ are locked until step 1 is fully claimed - admin in gifter
		// mode should see the order-gate UI on the wheelset and handlebar.
		{
			itemId: need(partnerBikeItems, 'Drivetrain swap (groupset)'),
			gifterId: gifterId,
			quantity: 1,
			totalCost: '550.00',
			createdAt: daysAgo(11),
		},

		// Distant-user (restricted) claims by friend + gifter only. Admin is
		// `accessLevel: 'restricted'` on this owner, so the item filter must
		// hide every item where every claim is by someone other than admin or
		// admin's partner. Travel adapter, suitcase, packing cubes, earbuds
		// each get a non-admin claim; pocket umbrella + reading lamp stay
		// unclaimed (and therefore visible).
		{
			itemId: need(restrictedOwnerItems, 'Travel adapter set'),
			gifterId: friendId,
			quantity: 1,
			totalCost: '32.00',
			createdAt: daysAgo(20),
		},
		{
			itemId: need(restrictedOwnerItems, 'Carry-on suitcase'),
			gifterId: gifterId,
			quantity: 1,
			totalCost: '240.00',
			createdAt: daysAgo(18),
		},
		{
			itemId: need(restrictedOwnerItems, 'Packing cubes (set of 6)'),
			gifterId: friendId,
			additionalGifterIds: [gifterId],
			quantity: 1,
			totalCost: '38.00',
			notes: 'Co-gifting these.',
			createdAt: daysAgo(12),
		},
		{
			itemId: need(restrictedOwnerItems, 'Noise-cancelling earbuds'),
			gifterId: gifterId,
			quantity: 1,
			totalCost: '199.00',
			createdAt: daysAgo(8),
		},
	])

	// ------------------------------------------------- ADDONS (off-list gifts)
	console.log('➕ Adding off-list addons...')
	await db.insert(listAddons).values([
		// On admin's primary - both active and archived (= received off-list).
		{
			listId: adminWishlist,
			userId: partnerId,
			description: 'Hand-written card + pressed flowers',
			totalCost: null,
			createdAt: daysAgo(7),
		},
		{
			listId: adminWishlist,
			userId: friendId,
			description: 'Wrapping paper + ribbon set',
			totalCost: '12.50',
			notes: 'Stocking-stuffer style.',
			createdAt: daysAgo(4),
		},
		{
			listId: adminWishlist,
			userId: gifterId,
			description: "Bouquet from the farmer's market",
			totalCost: '22.00',
			isArchived: true, // already received
			createdAt: daysAgo(50),
		},
		// On partner's list - admin contributed
		{
			listId: partnerWishlist,
			userId: adminId,
			description: 'Descaling kit + replacement portafilter basket',
			totalCost: '38.00',
			createdAt: daysAgo(11),
		},
	])

	// ----------------------------------------------------------- LIST EDITORS
	console.log('✏️  Granting list editors...')
	await db.insert(listEditors).values([
		// Friend can edit admin's todos (helping out).
		{ listId: adminTodos, userId: friendId, ownerId: adminId },
		// Partner can edit admin's christmas list.
		{ listId: adminChristmas, userId: partnerId, ownerId: adminId },
	])

	// ---------------------------------------------------------------- COMMENTS
	// Rule: never have a list owner be the FIRST commenter on their own item.
	// Owners can chime in later in a thread, but the conversation is started
	// by someone else.
	console.log('💬 Dropping comments...')
	await db.insert(itemComments).values([
		{
			itemId: need(adminItems, 'Espresso machine'),
			userId: friendId,
			comment: 'This is the model I have - pulls beautiful shots, no regrets.',
			createdAt: daysAgo(13),
		},
		{
			itemId: need(adminItems, 'Espresso machine'),
			userId: gifterId,
			comment: 'How loud is it? Mine rattles the whole counter.',
			createdAt: daysAgo(11),
		},
		{
			itemId: need(adminItems, 'Espresso machine'),
			userId: adminId,
			comment: 'This one is supposedly quiet. Will report back.',
			createdAt: daysAgo(10),
		},
		{
			itemId: need(adminItems, 'Noise-cancelling headphones'),
			userId: partnerId,
			comment: 'Over-ear or in-ear?',
			createdAt: hoursAgo(36),
		},
		{
			itemId: need(adminItems, 'Stand mixer'),
			userId: gifterId,
			comment: 'Color preference?',
			createdAt: daysAgo(65),
		},
		{
			itemId: need(adminItems, 'Stand mixer'),
			userId: friendId,
			comment: 'Matte black is the cleanest, IMO.',
			createdAt: daysAgo(63),
		},
		{
			itemId: need(partnerItems, 'New chef knife'),
			userId: adminId,
			comment: 'I have the smaller version - the balance is great.',
			createdAt: daysAgo(27),
		},
		{
			itemId: need(friendItems, 'Indoor herb garden kit'),
			userId: adminId,
			comment: 'Saw this on sale at the hardware store last weekend - looks worth it.',
			createdAt: daysAgo(16),
		},
	])

	// --------------------------------------------------------- RELATION LABELS
	// Mother's Day / Father's Day flows key off `userRelationLabels`.
	// Seed admin's two declarations so the profile screen, the holiday
	// reminder cron, and the relation-labels Intelligence analyzer all
	// have something real to render. Friend (Jordan) plays mom; gifter
	// (Morgan) plays dad. Per-direction; their reverse rows aren't seeded.
	console.log('👪 Seeding relation labels (mother + father)...')
	await db.insert(userRelationLabels).values([
		{ userId: adminId, label: 'mother', targetUserId: friendId },
		{ userId: adminId, label: 'father', targetUserId: gifterId },
	])

	// ---------------------------------------------------------------- SCRAPES
	// Fake scrape history so /admin/scraping's "Recent scrapes" dialog has
	// rows. Mix of successful + failed attempts across multiple providers
	// so the table renders varied state badges.
	console.log('🕷️  Seeding fake scrape history...')
	const espressoItemId = need(adminItems, 'Espresso machine')
	const headphonesItemId = need(adminItems, 'Noise-cancelling headphones')
	const knifeItemId = need(partnerItems, 'New chef knife')
	await db.insert(itemScrapes).values([
		{
			itemId: espressoItemId,
			userId: adminId,
			url: 'https://example.com/espresso',
			scraperId: 'fetch-provider:builtin',
			ok: true,
			score: 5,
			ms: 412,
			title: 'La Marzocco Linea Mini',
			cleanTitle: 'La Marzocco Linea Mini',
			description: 'Compact dual-boiler home espresso machine.',
			price: '5800',
			currency: 'USD',
			imageUrls: ['https://example.com/img/espresso.jpg'],
			ratingValue: 4.8,
			ratingCount: 124,
			response: { status: 200, contentType: 'text/html' },
			createdAt: hoursAgo(12),
		},
		{
			itemId: espressoItemId,
			userId: adminId,
			url: 'https://example.com/espresso',
			scraperId: 'browserless:browserless-pri',
			ok: true,
			score: 4,
			ms: 1840,
			title: 'La Marzocco Linea Mini Espresso',
			price: '5800',
			currency: 'USD',
			response: { status: 200, contentType: 'text/html' },
			createdAt: hoursAgo(12),
		},
		{
			itemId: headphonesItemId,
			userId: adminId,
			url: 'https://example.com/headphones',
			scraperId: 'giftwrapt-scraper:gw-fly',
			ok: true,
			score: 5,
			ms: 920,
			title: 'Sony WH-1000XM5',
			cleanTitle: 'Sony WH-1000XM5',
			price: '349',
			currency: 'USD',
			ratingValue: 4.7,
			ratingCount: 4321,
			response: { status: 200 },
			createdAt: daysAgo(2),
		},
		{
			itemId: knifeItemId,
			userId: adminId,
			url: 'https://example.com/chef-knife',
			scraperId: 'flaresolverr:flaresolverr',
			ok: false,
			ms: 30000,
			errorCode: 'TIMEOUT',
			response: { error: 'upstream timed out after 30s' },
			createdAt: daysAgo(3),
		},
		{
			itemId: null,
			userId: adminId,
			url: 'https://example.com/orphan-product',
			scraperId: 'ai:ai-extract',
			ok: true,
			score: 3,
			ms: 2200,
			title: 'Probably a coffee grinder',
			price: '249',
			currency: 'USD',
			response: { status: 200, model: 'claude-sonnet-4-6' },
			createdAt: daysAgo(5),
		},
		{
			itemId: null,
			userId: adminId,
			url: 'https://blocked.example.test/item/42',
			scraperId: 'fetch-provider:builtin',
			ok: false,
			ms: 320,
			errorCode: 'BLOCKED_403',
			response: { status: 403 },
			createdAt: daysAgo(7),
		},
	])

	// -------------------------------------------------------- RECOMMENDATIONS
	// Seed a finished Intelligence run + a handful of active recs for
	// admin so /suggestions and /admin/intelligence/history are populated.
	// `payload` mirrors the analyzer-output shape so the rec card renders
	// real action buttons + affected counts.
	console.log('🧠 Seeding intelligence run + recommendations...')
	const batchId = crypto.randomUUID()
	const runId = crypto.randomUUID()
	await db.insert(recommendationRuns).values({
		id: runId,
		userId: adminId,
		startedAt: hoursAgo(8),
		finishedAt: hoursAgo(8),
		status: 'success',
		trigger: 'cron',
		inputHash: 'screenshot-fake-input-hash',
		tokensIn: 4200,
		tokensOut: 980,
		estimatedCostMicroUsd: 24500,
	})

	const espressoStrId = String(espressoItemId)
	const headphonesStrId = String(headphonesItemId)
	const adminWishlistStrId = String(adminWishlist)
	const adminTodosStrId = String(adminTodos)
	const adminPrivateStrId = String(adminPrivate)

	await db.insert(recommendations).values([
		{
			userId: adminId,
			batchId,
			analyzerId: 'primary-list',
			kind: 'pin-primary',
			fingerprint: fingerprintFor({ analyzerId: 'primary-list', kind: 'pin-primary', fingerprintTargets: [adminWishlistStrId] }),
			status: 'active',
			severity: 'suggest',
			title: 'Pin "Birthday Wishlist" as primary',
			body: 'Most of your activity is on this list. Pinning it primary keeps it at the top of every gifter view.',
			payload: {
				actions: [
					{
						label: 'Set as primary',
						description: 'Pin this list as your primary wishlist.',
						intent: 'do',
						apply: { kind: 'set-primary-list', listId: adminWishlistStrId },
					},
					{
						label: 'Open list',
						description: 'Jump to the list and pin it manually.',
						intent: 'noop',
						nav: { listId: adminWishlistStrId, openEdit: false },
					},
				],
				affected: { noun: 'list', count: 1, lines: ['Birthday Wishlist (29 items, last edited today)'] },
			},
			createdAt: hoursAgo(8),
		},
		{
			userId: adminId,
			batchId,
			analyzerId: 'stale-items',
			kind: 'old-items',
			fingerprint: fingerprintFor({
				analyzerId: 'stale-items',
				kind: 'old-items',
				fingerprintTargets: [espressoStrId, headphonesStrId],
			}),
			status: 'active',
			severity: 'suggest',
			title: "Two items haven't been touched in months",
			body: "These items are still on your primary wishlist but the last edit was over six months ago. Confirm they're still wanted, or archive.",
			payload: {
				actions: [
					{
						label: 'Open Espresso machine',
						description: 'Review the item and decide.',
						intent: 'noop',
						nav: { listId: adminWishlistStrId, itemId: espressoStrId },
					},
				],
				affected: {
					noun: 'item',
					count: 2,
					lines: ['Espresso machine (310 days old)', 'Noise-cancelling headphones (220 days old)'],
				},
				dismissDescription: "Don't surface these again until they change.",
			},
			createdAt: hoursAgo(8),
		},
		{
			userId: adminId,
			batchId,
			analyzerId: 'duplicates',
			kind: 'cross-list-duplicate',
			fingerprint: fingerprintFor({
				analyzerId: 'duplicates',
				kind: 'cross-list-duplicate',
				fingerprintTargets: [adminWishlistStrId, adminPrivateStrId],
			}),
			status: 'active',
			severity: 'info',
			title: 'Possible duplicate across two lists',
			body: '"Leather journal" appears on both your Birthday Wishlist and your Private Wishlist. Keep the public copy and remove the private one to avoid surprises.',
			payload: {
				actions: [
					{
						label: 'Open private list',
						description: 'Review and decide.',
						intent: 'noop',
						nav: { listId: adminPrivateStrId },
					},
				],
				affected: { noun: 'item', count: 1, lines: ['Leather journal'] },
			},
			createdAt: hoursAgo(8),
		},
		{
			userId: adminId,
			batchId,
			analyzerId: 'grouping',
			kind: 'suggest-or-group',
			fingerprint: fingerprintFor({
				analyzerId: 'grouping',
				kind: 'suggest-or-group',
				fingerprintTargets: [adminTodosStrId],
			}),
			status: 'active',
			severity: 'suggest',
			title: 'Group "House Projects" weekend tasks',
			body: 'These three items look like alternative weekend projects, not a sequence. Grouping them as "pick one" tells helpers to claim only one.',
			payload: {
				actions: [
					{
						label: 'Group as Pick One',
						description: 'Create an "or" group with these items.',
						intent: 'do',
						apply: {
							kind: 'create-group',
							listId: adminTodosStrId,
							groupType: 'or',
							priority: 'normal',
							itemIds: [],
						},
					},
				],
				affected: { noun: 'item', count: 3, lines: ['Fix the squeaky door', 'Re-caulk bathtub', 'Touch up paint in hallway'] },
			},
			createdAt: hoursAgo(8),
		},
		{
			userId: adminId,
			batchId,
			analyzerId: 'list-hygiene',
			kind: 'convert-public-list',
			fingerprint: fingerprintFor({
				analyzerId: 'list-hygiene',
				kind: 'convert-public-list',
				fingerprintTargets: ['birthday', '2026-06-05T00:00:00.000Z', adminWishlistStrId],
			}),
			status: 'active',
			severity: 'important',
			title: 'Reshape "Birthday Wishlist" for Birthday',
			body: 'Your Birthday is in 14 days and the most-attention-getting list "Birthday Wishlist" isn\'t shaped for it. Convert it to a birthday list and rename it to "Birthday 2026" so gifts auto-reveal on the right day.',
			payload: {
				actions: [
					{
						label: 'Convert to birthday',
						description: "Change the list's type and rename it. Items and existing claims stay put.",
						intent: 'do',
						apply: { kind: 'convert-list', listId: adminWishlistStrId, newType: 'birthday', newName: 'Birthday 2026' },
					},
				],
				affected: { noun: 'list', count: 1, lines: ['Birthday Wishlist'] },
			},
			createdAt: hoursAgo(8),
		},
		{
			userId: adminId,
			batchId,
			analyzerId: 'stale-items',
			kind: 'old-items',
			fingerprint: fingerprintFor({
				analyzerId: 'stale-items',
				kind: 'old-items',
				fingerprintTargets: ['dismissed-fake'],
			}),
			status: 'dismissed',
			severity: 'info',
			title: 'Already-resolved suggestion',
			body: 'You dismissed this earlier. Kept here so the dismissed state is captured in screenshots.',
			payload: { affected: { noun: 'item', count: 1, lines: ['Old idea you decided against'] } },
			createdAt: daysAgo(3),
			dismissedAt: daysAgo(2),
		},
	])

	// --------------------------------------------------------- FIXTURE-IDS FILE
	const fixtureIds = {
		generatedAt: seedTime.toISOString(),
		users: {
			admin: adminId,
			partner: partnerId,
			friend: friendId,
			gifter: gifterId,
			nobday: nobdayId,
			child: childId,
			restrictedOwner: restrictedOwnerId,
		},
		lists: {
			adminWishlist,
			adminChristmas,
			adminBirthday,
			adminTodos,
			adminPrivate,
			adminIdeasForPartner,
			partnerWishlist,
			partnerBirthday,
			partnerChristmas,
			partnerIdeasForAdmin,
			friendWishlist,
			friendChristmas,
			gifterWishlist,
			gifterBirthday,
			nobdayWishlist,
			childWishlist,
			childChristmas,
			buddyWishlist,
			restrictedOwnerWishlist,
		},
	}

	await mkdir(dirname(FIXTURE_IDS_PATH), { recursive: true })
	await writeFile(FIXTURE_IDS_PATH, JSON.stringify(fixtureIds, null, 2) + '\n')

	console.log('')
	console.log(`📝 Wrote fixture IDs → ${FIXTURE_IDS_PATH}`)
	console.log('')
	console.log('✅ Screenshot seed complete.')
	console.log('')
	console.log('   Cast (all password: password):')
	console.log('     admin@example.test    - admin, partnered + guardian, birthday in 5 days')
	console.log("     partner@example.test  - admin's partner, birthday in 18 days")
	console.log('     friend@example.test   - mutual edit access, far birthday (~6 months)')
	console.log('     gifter@example.test   - one-way view, past birthday this year')
	console.log('     nobday@example.test   - no birthday set')
	console.log("     child@example.test    - admin + partner's child, birthday in 21 days")
	console.log('     distant@example.test  - distant acquaintance; admin is restricted on their lists')
	console.log('')
	console.log('   Now run: pnpm screenshots')
}

main()
	.then(() => process.exit(0))
	.catch(err => {
		console.error(err)
		process.exit(1)
	})
