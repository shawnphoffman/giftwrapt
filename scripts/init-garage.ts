// One-shot bootstrap for a bundled Garage instance. Triggered by
// INIT_GARAGE=true in the wish-lists container's entrypoint, and usable
// standalone via `pnpm storage:init` for local dev.
//
// Uses Garage's admin HTTP API (default port 3903) with a Bearer token.
// No CLI, no shared volume, no separate container — just fetch() calls
// from the same Node process that's about to boot the app. Keeps the
// wish-lists image free of any Garage binary dependency, and lets
// non-Garage deploys (R2, AWS, Supabase) skip this path entirely.
//
// Idempotent: a fresh cluster goes through assign + create + import +
// grant; subsequent boots skip each step they find already done.

import { config } from 'dotenv'

// Load .env.local first (local-dev-specific overrides), then .env. Dotenv
// does not clobber already-set values, so the first call wins per key and
// actual process-env values (e.g. set inline on `pnpm storage:init`) still
// take precedence over both. In the Docker container there's no .env file
// on disk; everything comes through the compose `environment:` block and
// these calls are no-ops.
config({ path: '.env.local' })
config({ path: '.env' })

const requireEnv = (name: string): string => {
	const v = process.env[name]
	if (!v) {
		console.error(`[init-garage] missing required env: ${name}`)
		process.exit(1)
	}
	return v
}

const ADMIN_URL = (process.env.GARAGE_ADMIN_URL ?? 'http://wish-lists-storage:3903').replace(/\/$/, '')
const ADMIN_TOKEN = requireEnv('GARAGE_ADMIN_TOKEN')
const BUCKET = requireEnv('STORAGE_BUCKET')
const ACCESS_KEY_ID = requireEnv('STORAGE_ACCESS_KEY_ID')
const SECRET_ACCESS_KEY = requireEnv('STORAGE_SECRET_ACCESS_KEY')

const KEY_NAME = 'wishlist-app'
const ZONE = 'dc1'
// Layout capacity is a bookkeeping value Garage uses to plan partition
// assignment, not a real disk quota. 1 GiB is enough for any single-node
// cluster; Garage will never refuse a write because of it.
const CAPACITY_BYTES = 1024 * 1024 * 1024
const HEALTH_TIMEOUT_MS = 60_000

const say = (msg: string): void => {
	console.log(`[init-garage] ${msg}`)
}

interface AdminOptions {
	method: 'GET' | 'POST'
	path: string
	body?: unknown
}

async function admin({ method, path, body }: AdminOptions): Promise<Response> {
	return fetch(`${ADMIN_URL}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${ADMIN_TOKEN}`,
			...(body ? { 'Content-Type': 'application/json' } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	})
}

async function waitForHealth(): Promise<void> {
	const deadline = Date.now() + HEALTH_TIMEOUT_MS
	let last = 'never responded'
	while (Date.now() < deadline) {
		try {
			const res = await admin({ method: 'GET', path: '/health' })
			if (res.ok) return
			last = `status ${res.status}`
		} catch (error) {
			last = error instanceof Error ? error.message : String(error)
		}
		await new Promise(resolve => setTimeout(resolve, 1_000))
	}
	throw new Error(`Garage admin API at ${ADMIN_URL} did not become healthy within ${HEALTH_TIMEOUT_MS / 1000}s: ${last}`)
}

interface StatusNode {
	id: string
	role: unknown | null
}
interface StatusResponse {
	node: string
	layoutVersion: number
	nodes: Array<StatusNode>
}

async function ensureLayout(): Promise<void> {
	const res = await admin({ method: 'GET', path: '/v1/status' })
	if (!res.ok) throw new Error(`GET /v1/status failed: ${res.status} ${await res.text()}`)
	const status = (await res.json()) as StatusResponse
	const self = status.nodes.find(n => n.id === status.node)
	if (self?.role) {
		say('layout already applied, skipping')
		return
	}
	say(`staging layout for node ${status.node.slice(0, 16)}…`)
	const stage = await admin({
		method: 'POST',
		path: '/v1/layout',
		body: [{ id: status.node, zone: ZONE, capacity: CAPACITY_BYTES, tags: [] }],
	})
	if (!stage.ok) throw new Error(`POST /v1/layout failed: ${stage.status} ${await stage.text()}`)
	const nextVersion = status.layoutVersion + 1
	say(`applying layout at version ${nextVersion}`)
	const apply = await admin({
		method: 'POST',
		path: '/v1/layout/apply',
		body: { version: nextVersion },
	})
	if (!apply.ok) throw new Error(`POST /v1/layout/apply failed: ${apply.status} ${await apply.text()}`)
}

interface BucketInfo {
	id: string
}

async function ensureBucket(): Promise<string> {
	const get = await admin({ method: 'GET', path: `/v1/bucket?globalAlias=${encodeURIComponent(BUCKET)}` })
	if (get.ok) {
		const info = (await get.json()) as BucketInfo
		say(`bucket ${BUCKET} already exists, skipping`)
		return info.id
	}
	// 404 is the "not found" case we're expecting on first boot. Anything
	// else is a real error we shouldn't paper over.
	if (get.status !== 404) {
		throw new Error(`GET /v1/bucket failed: ${get.status} ${await get.text()}`)
	}
	say(`creating bucket ${BUCKET}`)
	const create = await admin({ method: 'POST', path: '/v1/bucket', body: { globalAlias: BUCKET } })
	if (!create.ok) throw new Error(`POST /v1/bucket failed: ${create.status} ${await create.text()}`)
	const info = (await create.json()) as BucketInfo
	return info.id
}

async function ensureKey(): Promise<void> {
	// Garage's /v1/key GET returns 400 for "key does not exist" (not 404), so
	// we can't cleanly distinguish "missing" from "malformed". Just try the
	// import; 409 means the key is already in the data store (either still
	// alive or tombstoned from a prior delete), which for our purposes is the
	// same "nothing to do" outcome.
	const create = await admin({
		method: 'POST',
		path: '/v1/key/import',
		body: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY, name: KEY_NAME },
	})
	if (create.status === 409) {
		say(`key ${ACCESS_KEY_ID.slice(0, 8)}… already exists, skipping import`)
		return
	}
	if (!create.ok) throw new Error(`POST /v1/key/import failed: ${create.status} ${await create.text()}`)
	say(`imported key ${KEY_NAME}`)
}

async function ensureGrant(bucketId: string): Promise<void> {
	say(`granting read+write+owner on ${BUCKET} to ${ACCESS_KEY_ID.slice(0, 8)}…`)
	const grant = await admin({
		method: 'POST',
		path: '/v1/bucket/allow',
		body: {
			bucketId,
			accessKeyId: ACCESS_KEY_ID,
			permissions: { read: true, write: true, owner: true },
		},
	})
	if (!grant.ok) throw new Error(`POST /v1/bucket/allow failed: ${grant.status} ${await grant.text()}`)
}

async function main(): Promise<void> {
	say(`admin url: ${ADMIN_URL}`)
	await waitForHealth()
	say('daemon ready')
	await ensureLayout()
	const bucketId = await ensureBucket()
	await ensureKey()
	await ensureGrant(bucketId)
	say('done')
}

main().catch(error => {
	console.error('[init-garage] failed:', error instanceof Error ? error.message : error)
	process.exit(1)
})
