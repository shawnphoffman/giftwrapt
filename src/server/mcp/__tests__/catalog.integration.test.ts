// Keeps the committed docs catalogs in step with the code. The docs site
// inlines catalogs/*.json at build time, so a stale file is a wrong docs
// page.
//
//   catalogs/ai-features.json  from src/lib/ai-features.ts
//   catalogs/mcp-tools.json    from a live tools/list
//
// To regenerate after changing a tool or an AI feature: pnpm docs:catalogs
// (this file run with UPDATE_CATALOGS=1, which writes instead of
// comparing). The MCP server graph needs the Vite runtime, so a plain
// tsx script cannot build the list.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { db } from '@/db'
import { buildAiFeaturesCatalog } from '@/lib/ai-features'
import { createLogger } from '@/lib/logger'
import { DEFAULT_APP_SETTINGS } from '@/lib/settings'

import { buildMcpToolCatalog, serializeCatalog } from '../catalog'

const CATALOG_DIR = join(__dirname, '..', '..', '..', '..', 'catalogs')
const UPDATE = process.env.UPDATE_CATALOGS === '1'

function check(name: string, body: string): void {
	const path = join(CATALOG_DIR, name)
	if (UPDATE) {
		mkdirSync(dirname(path), { recursive: true })
		writeFileSync(path, body)
		return
	}
	let existing = ''
	try {
		existing = readFileSync(path, 'utf8')
	} catch {
		// A missing file compares as stale.
	}
	expect(existing === body, `catalogs/${name} is stale. Run \`pnpm docs:catalogs\` and commit the result.`).toBe(true)
}

describe('docs catalogs', () => {
	it('catalogs/ai-features.json matches the AI feature registry', () => {
		check('ai-features.json', serializeCatalog(buildAiFeaturesCatalog()))
	})

	it('catalogs/mcp-tools.json matches the registered MCP tools', async () => {
		const tools = await buildMcpToolCatalog({
			actor: { userId: 'catalog', isAdmin: false, clientId: 'catalog', tokenId: 'catalog', scopes: [] },
			settings: DEFAULT_APP_SETTINGS,
			dbx: db,
			log: createLogger('catalog'),
			now: new Date(0),
		})
		expect(tools.length).toBeGreaterThan(30)
		check('mcp-tools.json', serializeCatalog(tools))
	})
})
