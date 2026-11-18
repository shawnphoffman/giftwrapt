import { ScrollText } from 'lucide-react'
import { Fragment, useState } from 'react'

import { PageHeading } from '@/components/common/page-heading'
import { RichMessage } from '@/components/common/rich-message'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ChangelogRelease, ChangelogSectionKind } from '@/lib/changelog'
import { formatCalendarDate } from '@/lib/i18n/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

const INITIAL_RELEASES = 5

// `label` is a function, not a string: this table is built at module level,
// before any request has a language.
const SECTION_META: Record<ChangelogSectionKind, { label: () => string; dot: string }> = {
	breaking: { label: () => m.changelog_section_breaking(), dot: 'bg-amber-500' },
	features: { label: () => m.changelog_section_features(), dot: 'bg-green-500' },
	performance: { label: () => m.changelog_section_performance(), dot: 'bg-cyan-500' },
	fixes: { label: () => m.changelog_section_fixes(), dot: 'bg-purple-500' },
}

type Props = {
	releases: Array<ChangelogRelease>
	currentVersion: string
}

function formatReleaseDate(iso: string): string {
	// Release dates are calendar days; format in UTC so they never shift a day.
	return formatCalendarDate(`${iso}T00:00:00Z`, { year: 'numeric', month: 'short', day: 'numeric' })
}

// Entries are plain text with the occasional `code` span.
function EntryText({ text }: { text: string }) {
	return text.split('`').map((part, i) =>
		i % 2 === 1 ? (
			<code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
				{part}
			</code>
		) : (
			<Fragment key={i}>{part}</Fragment>
		)
	)
}

function ReleaseCard({ release, isCurrent }: { release: ChangelogRelease; isCurrent: boolean }) {
	return (
		<section className={cn('flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5', isCurrent && 'ring-1 ring-primary/40')}>
			<header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<h2 className="text-lg font-semibold tabular-nums">{m.changelog_version_heading({ version: release.version })}</h2>
				{release.date && <span className="text-sm text-muted-foreground">{formatReleaseDate(release.date)}</span>}
				{isCurrent && <Badge variant="secondary">{m.changelog_your_version()}</Badge>}
			</header>

			{release.sections.length === 0 ? (
				<p className="text-sm text-muted-foreground">{m.changelog_maintenance_only()}</p>
			) : (
				release.sections.map(section => {
					const meta = SECTION_META[section.kind]
					return (
						<div key={section.kind} className="flex flex-col gap-2">
							<h3 className="flex items-center gap-2 text-sm font-medium">
								<span className={cn('size-2 rounded-full', meta.dot)} aria-hidden />
								{meta.label()}
							</h3>
							<ul className="flex flex-col gap-1.5 pl-4">
								{section.entries.map((entry, i) => (
									<li key={i} className="text-sm leading-relaxed">
										{entry.area && (
											<span className="mr-1.5 font-medium text-muted-foreground">{m.changelog_entry_area({ area: entry.area })}</span>
										)}
										<EntryText text={entry.text} />
									</li>
								))}
							</ul>
						</div>
					)
				})
			)}
		</section>
	)
}

export function ChangelogPageContent({ releases, currentVersion }: Props) {
	const [showAll, setShowAll] = useState(false)
	const visible = showAll ? releases : releases.slice(0, INITIAL_RELEASES)
	const hiddenCount = releases.length - visible.length

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				<PageHeading title={m.page_whats_new()} icon={ScrollText} color="amber" />

				<p className="text-sm text-muted-foreground">
					<RichMessage
						parts={m.changelog_current_version.parts({ version: currentVersion })}
						tags={{ version: children => <span className="font-medium text-foreground tabular-nums">{children}</span> }}
					/>
				</p>

				<div className="flex flex-col gap-4">
					{visible.map(release => (
						<ReleaseCard key={release.version} release={release} isCurrent={release.version === currentVersion} />
					))}
				</div>

				{hiddenCount > 0 && (
					<Button variant="outline" className="self-center" onClick={() => setShowAll(true)}>
						{m.changelog_show_older({ count: hiddenCount })}
					</Button>
				)}
			</div>
		</div>
	)
}
