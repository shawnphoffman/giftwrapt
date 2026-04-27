// One-shot bootstrap for a bundled RustFS instance. Triggered by
// INIT_RUSTFS=true in the giftwrapt container's entrypoint, and usable
// standalone via `pnpm storage:init:rustfs` for local dev.
//
// Unlike Garage, RustFS provisions root credentials at startup via its own
// env vars, so there's no admin API to call: this script only needs to
// ensure the bucket exists. That makes it generic enough to work against
// any S3-compatible backend that lets the configured key create buckets,
// not just RustFS.
//
// Idempotent: HeadBucket short-circuits when the bucket is already there.

import { CreateBucketCommand, HeadBucketCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3'
import { config } from 'dotenv'

// Load .env.local first (local-dev-specific overrides), then .env. Same
// precedence rules as init-garage.ts: first call wins per key, real
// process-env values still override both. In the Docker container these
// are no-ops; everything comes through the compose `environment:` block.
config({ path: '.env.local' })
config({ path: '.env' })

const requireEnv = (name: string): string => {
	const v = process.env[name]
	if (!v) {
		console.error(`[init-rustfs] missing required env: ${name}`)
		process.exit(1)
	}
	return v
}

const ENDPOINT = requireEnv('STORAGE_ENDPOINT').replace(/\/$/, '')
const REGION = requireEnv('STORAGE_REGION')
const BUCKET = requireEnv('STORAGE_BUCKET')
const ACCESS_KEY_ID = requireEnv('STORAGE_ACCESS_KEY_ID')
const SECRET_ACCESS_KEY = requireEnv('STORAGE_SECRET_ACCESS_KEY')
const FORCE_PATH_STYLE = (process.env.STORAGE_FORCE_PATH_STYLE ?? 'true').toLowerCase() === 'true'

const HEALTH_TIMEOUT_MS = 60_000

const say = (msg: string): void => {
	console.log(`[init-rustfs] ${msg}`)
}

const client = new S3Client({
	endpoint: ENDPOINT,
	region: REGION,
	credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
	forcePathStyle: FORCE_PATH_STYLE,
})

// HeadBucket on a non-existent bucket returns 404 (NotFound). On a fresh
// daemon that's still binding its socket we'll see ECONNREFUSED instead.
// The first is "proceed to create"; the second is "keep waiting".
interface ProbeResult {
	state: 'exists' | 'missing' | 'unreachable'
	detail?: string
}

async function probe(): Promise<ProbeResult> {
	try {
		await client.send(new HeadBucketCommand({ Bucket: BUCKET }))
		return { state: 'exists' }
	} catch (error) {
		const name = (error as { name?: string }).name
		const code = (error as { Code?: string }).Code
		const httpStatus = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
		if (name === 'NotFound' || code === 'NoSuchBucket' || httpStatus === 404) {
			return { state: 'missing' }
		}
		// AccessDenied (403) on HeadBucket usually means the bucket exists but
		// the key isn't allowed to head it. RustFS root creds always have
		// permission, but external buckets (R2/AWS) might not, so treat as
		// "exists" rather than failing.
		if (name === 'Forbidden' || httpStatus === 403) {
			return { state: 'exists', detail: 'forbidden, assuming bucket exists' }
		}
		return { state: 'unreachable', detail: error instanceof Error ? error.message : String(error) }
	}
}

async function waitForEndpoint(): Promise<ProbeResult> {
	const deadline = Date.now() + HEALTH_TIMEOUT_MS
	let last: ProbeResult = { state: 'unreachable', detail: 'never responded' }
	while (Date.now() < deadline) {
		last = await probe()
		if (last.state !== 'unreachable') return last
		await new Promise(resolve => setTimeout(resolve, 1_000))
	}
	throw new Error(`storage endpoint at ${ENDPOINT} did not become reachable within ${HEALTH_TIMEOUT_MS / 1000}s: ${last.detail}`)
}

async function ensureBucket(): Promise<void> {
	const initial = await waitForEndpoint()
	if (initial.state === 'exists') {
		say(`bucket ${BUCKET} already exists, skipping${initial.detail ? ` (${initial.detail})` : ''}`)
		return
	}
	say(`creating bucket ${BUCKET}`)
	try {
		await client.send(new CreateBucketCommand({ Bucket: BUCKET }))
	} catch (error) {
		// BucketAlreadyOwnedByYou: a parallel boot raced us to creation. That's
		// fine; the post-condition (bucket exists) holds.
		if (error instanceof S3ServiceException && error.name === 'BucketAlreadyOwnedByYou') {
			say(`bucket ${BUCKET} already owned, skipping`)
			return
		}
		throw error
	}
	say(`bucket ${BUCKET} created`)
}

async function main(): Promise<void> {
	say(`endpoint: ${ENDPOINT}`)
	await ensureBucket()
	say('done')
}

main().catch(error => {
	console.error('[init-rustfs] failed:', error instanceof Error ? error.message : error)
	process.exit(1)
})
