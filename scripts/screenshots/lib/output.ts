/**
 * Output path layout + manifest writer.
 *
 *   <root>/<timestamp>/<viewport>/<theme>/<slug>.png
 *   <root>/latest      → mirror of the most recent run
 *   <root>/<timestamp>/manifest.json
 */

import type { Dirent } from 'node:fs'
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { Theme, ViewportName } from '../types'

export interface ManifestEntry {
	slug: string
	label: string
	path: string
	viewport: ViewportName
	theme: Theme
	file: string
	bytes: number
	durationMs: number
}

export interface RunMeta {
	startedAt: string
	finishedAt: string
	url: string
	totalDurationMs: number
	entries: Array<ManifestEntry>
	failed: Array<{ slug: string; viewport: ViewportName; theme: Theme; error: string }>
}

export function timestampSlug(d = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, '0')
	return [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate()), '-', pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds())].join(
		''
	)
}

export function fileForRun(rootDir: string, runId: string, viewport: ViewportName, theme: Theme, slug: string): string {
	return join(rootDir, runId, viewport, theme, `${slug}.png`)
}

export async function ensureDirFor(path: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true })
}

export async function mirrorToLatest(rootDir: string, runId: string): Promise<void> {
	const latestPath = join(rootDir, 'latest')
	await rm(latestPath, { recursive: true, force: true })
	await mkdir(latestPath, { recursive: true })
	await copyDir(join(rootDir, runId), latestPath)
}

export async function writeManifest(rootDir: string, runId: string, meta: RunMeta): Promise<string> {
	const path = join(rootDir, runId, 'manifest.json')
	await writeFile(path, JSON.stringify(meta, null, 2) + '\n')
	return path
}

// Keep only the `keep` most-recent timestamped run folders; delete the
// rest. The `latest` mirror and any non-timestamp directory (manifest
// extras, READMEs, etc.) are left alone. Returns the slugs that were
// removed so the caller can log them.
//
// Folder names are matched against `YYYYMMDD-HHMMSS` produced by
// `timestampSlug` so a typo'd custom folder isn't accidentally
// considered for deletion.
const TIMESTAMP_RE = /^\d{8}-\d{6}$/
export async function pruneOldRuns(rootDir: string, keep: number): Promise<Array<string>> {
	const { readdir } = await import('node:fs/promises')
	let entries: Array<Dirent>
	try {
		entries = await readdir(rootDir, { withFileTypes: true })
	} catch {
		return []
	}
	const runs = entries
		.filter(e => e.isDirectory() && TIMESTAMP_RE.test(e.name))
		.map(e => e.name)
		.sort() // ascending; timestamp slug sorts lexicographically
	const stale = runs.slice(0, Math.max(0, runs.length - keep))
	for (const slug of stale) {
		await rm(join(rootDir, slug), { recursive: true, force: true })
	}
	return stale
}

async function copyDir(from: string, to: string): Promise<void> {
	const { readdir } = await import('node:fs/promises')
	const entries = await readdir(from, { withFileTypes: true })
	await mkdir(to, { recursive: true })
	for (const entry of entries) {
		const src = join(from, entry.name)
		const dst = join(to, entry.name)
		if (entry.isDirectory()) {
			await copyDir(src, dst)
		} else {
			await copyFile(src, dst)
		}
	}
}
