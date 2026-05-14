#!/usr/bin/env node
// Post-build server smoke test. Boots `.output/server/index.mjs` against a
// fake config just long enough to confirm the module graph loads without
// crashing, then shuts it down. Catches missing externals, bad import
// resolutions, and other "build looked fine, server won't boot" regressions
// that unit tests miss.
//
// Usage: `pnpm smoke` (after `pnpm build`).
// Exit code is what callers should check.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(__dirname, '..')
const serverEntry = resolve(repoRoot, '.output/server/index.mjs')

if (!existsSync(serverEntry)) {
	console.error(`smoke: ${serverEntry} not found — run \`pnpm build\` first.`)
	process.exit(2)
}

// The env values are intentionally fake. The smoke test validates module
// load + listener startup, not request handling. The env-core schema rejects
// missing/invalid values at boot, so we have to supply syntactically valid
// ones. Anything that talks to the DB will fail later, when an actual request
// comes in — but the server itself will be up.
const env = {
	...process.env,
	NODE_ENV: 'production',
	PORT: process.env.SMOKE_PORT ?? '38121',
	DATABASE_URL: 'postgres://smoke:smoke@127.0.0.1:5/smoke',
	BETTER_AUTH_SECRET: 'smoke-secret-at-least-one-char',
	BETTER_AUTH_URL: 'http://127.0.0.1:38121',
	VITE_SERVER_URL: 'http://127.0.0.1:38121',
}

const READY_PATTERN = /Listening on/i
const TIMEOUT_MS = 15_000

const child = spawn(process.execPath, [serverEntry], {
	cwd: repoRoot,
	env,
	stdio: ['ignore', 'pipe', 'pipe'],
})

let ready = false
let buffer = ''

const stop = (code, reason) => {
	if (!child.killed) child.kill('SIGTERM')
	const stripped = stripAnsi(buffer).trim()
	if (code === 0) {
		console.log(`smoke: ${reason}`)
	} else {
		console.error(`smoke: ${reason}`)
		if (stripped) {
			console.error('--- server output ---')
			console.error(stripped)
			console.error('--- end server output ---')
		}
	}
	// Give the child a moment to exit cleanly before we yield.
	setTimeout(() => process.exit(code), 200).unref()
}

const onChunk = chunk => {
	buffer += chunk.toString()
	if (!ready && READY_PATTERN.test(buffer)) {
		ready = true
		stop(0, 'server booted cleanly (matched "Listening on")')
	}
}

child.stdout.on('data', onChunk)
child.stderr.on('data', onChunk)

child.on('exit', (code, signal) => {
	if (ready) return // expected — we triggered it
	stop(1, `server exited before ready (code=${code}, signal=${signal})`)
})

child.on('error', err => {
	stop(1, `failed to spawn server: ${err.message}`)
})

setTimeout(() => {
	if (!ready) stop(1, `timed out after ${TIMEOUT_MS}ms waiting for "Listening on"`)
}, TIMEOUT_MS).unref()

function stripAnsi(s) {
	// Minimal ANSI strip so the captured log is grep-friendly.
	return s.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
}
