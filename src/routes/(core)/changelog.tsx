import { createFileRoute } from '@tanstack/react-router'

import { ChangelogPageContent } from '@/components/changelog/changelog-page'
import { BUILD_INFO } from '@/lib/build-info'
import { parseChangelog } from '@/lib/changelog'

import changelogMarkdown from '../../../CHANGELOG.md?raw'

// Inlined at build time, so the page always matches the deployed version and
// needs no filesystem access at runtime (the Docker image ships only .output).
const releases = parseChangelog(changelogMarkdown)

export const Route = createFileRoute('/(core)/changelog')({
	component: ChangelogRoute,
})

function ChangelogRoute() {
	return <ChangelogPageContent releases={releases} currentVersion={BUILD_INFO.version} />
}
