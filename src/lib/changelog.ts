// Parses the release-please CHANGELOG.md into a reader-friendly shape for the
// in-app "What's New" page. The raw file is developer-facing (commit hashes,
// issue links, internal scopes like storybook); this strips that noise and
// keeps only what a user of the app would care about.

export type ChangelogSectionKind = 'breaking' | 'features' | 'performance' | 'fixes'

export interface ChangelogEntry {
	/** Humanized conventional-commit scope, e.g. "Mobile API". Null when unscoped. */
	area: string | null
	text: string
}

export interface ChangelogSection {
	kind: ChangelogSectionKind
	entries: Array<ChangelogEntry>
}

export interface ChangelogRelease {
	version: string
	/** ISO date (YYYY-MM-DD) as written by release-please. */
	date: string | null
	sections: Array<ChangelogSection>
}

const SECTION_KINDS: Record<string, ChangelogSectionKind | undefined> = {
	'⚠ breaking changes': 'breaking',
	features: 'features',
	'performance improvements': 'performance',
	'bug fixes': 'fixes',
}

const SECTION_ORDER: Array<ChangelogSectionKind> = ['breaking', 'features', 'performance', 'fixes']

// Scopes that only matter to people working on the codebase.
const INTERNAL_SCOPES = new Set(['storybook', 'screenshots', 'seed', 'deps', 'ci', 'test', 'tests', 'dev', 'lint', 'tooling', 'release'])

const SCOPE_LABELS: Record<string, string> = {
	api: 'API',
	'mobile-api': 'Mobile API',
	sse: 'Live updates',
	ui: 'UI',
	db: 'Database',
	ios: 'iOS',
}

const RELEASE_HEADING = /^## \[?(\d+\.\d+\.\d+)\]?(?:\([^)]*\))?(?:\s+\((\d{4}-\d{2}-\d{2})\))?/
const ENTRY = /^\* (?:\*\*([^*]+):\*\* )?(.+)$/
// Trailing " ([abc1234](url))" commit refs, with an optional ", closes [#1](url)" tail.
const COMMIT_REF = /\s*\(\[[0-9a-f]{7,40}\]\([^)]*\)\)(?:,\s*closes\s.*)?$/
// Inline issue / PR refs like " ([#62](url))".
const ISSUE_REF = /\s*\(\[#\d+\]\([^)]*\)\)/g
// Any other inline link, unwrapped to its text. release-please links
// `@word` in a commit subject to that GitHub user, so "add @mentions"
// arrives as "add [@mentions](https://github.com/mentions)".
const INLINE_LINK = /\[([^\]]+)\]\(https?:[^)]*\)/g

export function humanizeScope(scope: string): string {
	const key = scope.trim().toLowerCase()
	if (SCOPE_LABELS[key]) return SCOPE_LABELS[key]
	const words = key.replace(/[-_]+/g, ' ')
	return words.charAt(0).toUpperCase() + words.slice(1)
}

function cleanText(raw: string): string {
	const text = raw.replace(COMMIT_REF, '').replace(ISSUE_REF, '').replace(INLINE_LINK, '$1').trim()
	return text.charAt(0).toUpperCase() + text.slice(1)
}

export function parseChangelog(markdown: string): Array<ChangelogRelease> {
	const releases: Array<ChangelogRelease> = []
	let release: ChangelogRelease | null = null
	let kind: ChangelogSectionKind | null = null
	const buckets = new Map<ChangelogSectionKind, Array<ChangelogEntry>>()

	const flush = () => {
		if (!release) return
		release.sections = SECTION_ORDER.filter(k => buckets.get(k)?.length).map(k => ({ kind: k, entries: buckets.get(k)! }))
		releases.push(release)
		buckets.clear()
	}

	for (const line of markdown.split('\n')) {
		const heading = RELEASE_HEADING.exec(line)
		if (heading) {
			flush()
			// Optional capture groups are undefined at runtime despite RegExpExecArray typing them as string.
			const date = heading[2] as string | undefined
			release = { version: heading[1], date: date ?? null, sections: [] }
			kind = null
			continue
		}
		if (line.startsWith('### ')) {
			kind = SECTION_KINDS[line.slice(4).trim().toLowerCase()] ?? null
			continue
		}
		if (!release || !kind) continue

		const entry = ENTRY.exec(line)
		if (!entry) continue
		const scope = (entry[1] as string | undefined)?.trim() ?? null
		if (scope && INTERNAL_SCOPES.has(scope.toLowerCase())) continue
		const text = cleanText(entry[2])
		if (!text) continue

		const area = scope ? humanizeScope(scope) : null
		const bucket = buckets.get(kind) ?? []
		if (!bucket.some(e => e.area === area && e.text === text)) bucket.push({ area, text })
		buckets.set(kind, bucket)
	}
	flush()

	return releases
}
