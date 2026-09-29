import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { humanizeScope, parseChangelog } from '../changelog'

const SAMPLE = `# Changelog

## [1.2.0](https://github.com/o/r/compare/v1.1.1...v1.2.0) (2026-09-18)


### Features

* **intelligence:** scroll Open List to the flagged item ([a854f5e](https://github.com/o/r/commit/a854f5e2264a9f696a12203e86c180825b50332b))
* **storybook:** add stories for the thing ([b854f5e](https://github.com/o/r/commit/b854f5e))


### Bug Fixes

* **orphan-claims:** never email the recipient ([99fbb57](https://github.com/o/r/commit/99fbb57)), closes [#9](https://github.com/o/r/issues/9)
* **mobile-api:** wrap GET /v1/app-settings in \`{ settings }\` ([c854f5e](https://github.com/o/r/commit/c854f5e))
* **mobile-api:** wrap GET /v1/app-settings in \`{ settings }\` ([d854f5e](https://github.com/o/r/commit/d854f5e))

## [1.0.0](https://github.com/o/r/compare/v0.46.0...v1.0.0) (2026-09-01)


### Miscellaneous Chores

* release 1.0.0 ([f2faacc](https://github.com/o/r/commit/f2faacc))

## [0.2.0](https://github.com/o/r/compare/v0.1.0...v0.2.0) (2026-04-18)


### ⚠ BREAKING CHANGES

* **settings:** fresh deployments no longer expose the todos list type out of the box.

### Features

* Phase 1 - tooling, schema ([#1](https://github.com/o/r/issues/1)) ([e854f5e](https://github.com/o/r/commit/e854f5e))
`

describe('parseChangelog', () => {
	const releases = parseChangelog(SAMPLE)

	it('reads versions and dates in file order', () => {
		expect(releases.map(r => [r.version, r.date])).toEqual([
			['1.2.0', '2026-09-18'],
			['1.0.0', '2026-09-01'],
			['0.2.0', '2026-04-18'],
		])
	})

	it('strips commit refs, closes tails, and issue refs', () => {
		const [features, fixes] = releases[0].sections
		expect(features.entries).toEqual([{ area: 'Intelligence', text: 'Scroll Open List to the flagged item' }])
		expect(fixes.entries[0]).toEqual({ area: 'Orphan claims', text: 'Never email the recipient' })
		expect(releases[2].sections[1].entries).toEqual([{ area: null, text: 'Phase 1 - tooling, schema' }])
	})

	it('drops internal scopes and duplicate entries', () => {
		const fixes = releases[0].sections[1]
		expect(fixes.entries).toHaveLength(2)
		expect(fixes.entries[1]).toEqual({ area: 'Mobile API', text: 'Wrap GET /v1/app-settings in `{ settings }`' })
	})

	it('keeps releases whose only section is chores, with no sections', () => {
		expect(releases[1].sections).toEqual([])
	})

	it('orders breaking changes first', () => {
		expect(releases[2].sections.map(s => s.kind)).toEqual(['breaking', 'features'])
	})

	it('unwraps the GitHub user links release-please adds for @words', () => {
		const [release] = parseChangelog(`## [1.3.0](https://github.com/o/r/compare/v1.2.0...v1.3.0) (2026-09-29)

### Features

* **comments:** add [@mentions](https://github.com/mentions) with email notifications ([5160a07](https://github.com/o/r/commit/5160a07))
`)
		expect(release.sections[0].entries).toEqual([{ area: 'Comments', text: 'Add @mentions with email notifications' }])
	})

	it('parses the real CHANGELOG without leaking raw markdown', () => {
		const real = parseChangelog(readFileSync(resolve(__dirname, '../../../CHANGELOG.md'), 'utf8'))
		expect(real.length).toBeGreaterThan(10)
		for (const release of real) {
			for (const section of release.sections) {
				for (const entry of section.entries) {
					expect(entry.text).not.toMatch(/\]\(https?:/)
					expect(entry.text).not.toMatch(/^\*\*/)
				}
			}
		}
	})
})

describe('humanizeScope', () => {
	it('uses overrides and sentence-cases the rest', () => {
		expect(humanizeScope('ui')).toBe('UI')
		expect(humanizeScope('list-addons')).toBe('List addons')
	})
})
