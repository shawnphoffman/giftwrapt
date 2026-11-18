import { createFileRoute } from '@tanstack/react-router'

import { ChangelogPageContent } from '@/components/changelog/changelog-page'
import { BUILD_INFO } from '@/lib/build-info'
import { type ChangelogRelease, parseChangelog } from '@/lib/changelog'
import { currentLocale } from '@/lib/i18n/format'
import type { Locale } from '@/lib/i18n/locales'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

import changelogMarkdown from '../../../CHANGELOG.md?raw'

// Inlined at build time, so the page always matches the deployed version and
// needs no filesystem access at runtime (the Docker image ships only .output).
// Parsed once per language, on first render in that language: the parser
// names each entry's area ("Mobile API"), and those names are translated.
const releasesByLocale = new Map<Locale, Array<ChangelogRelease>>()

function releasesFor(locale: Locale): Array<ChangelogRelease> {
	let releases = releasesByLocale.get(locale)
	if (!releases) {
		releases = parseChangelog(changelogMarkdown)
		releasesByLocale.set(locale, releases)
	}
	return releases
}

export const Route = createFileRoute('/(core)/changelog')({
	head: pageHead(() => m.page_whats_new()),
	component: ChangelogRoute,
})

function ChangelogRoute() {
	return <ChangelogPageContent releases={releasesFor(currentLocale())} currentVersion={BUILD_INFO.version} />
}
