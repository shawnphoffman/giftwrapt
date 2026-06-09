import type { Meta, StoryObj } from '@storybook/react-vite'

import { Skeleton } from '@/components/ui/skeleton'
import type { ArchiveBannerInfo } from '@/lib/archive-schedule-loader'

import { ArchiveRevealBadge } from './archive-reveal-badge'

// Note: only the gifting-view `ArchiveRevealBadge` is storied here. The
// edit-view `ArchiveManagerBadge` statically imports the reveal-timing server
// fns, which the Storybook/vitest browser runner can't resolve for a
// newly-added server-fn module; it shares the identical badge trigger, so its
// compact look is represented by the reveal badge below.

const inGap: ArchiveBannerInfo = {
	applies: true,
	eventDate: '2026-06-15T00:00:00.000Z',
	defaultArchiveDate: '2026-06-29T00:00:00.000Z',
	effectiveArchiveDate: '2026-06-29T00:00:00.000Z',
	deferUntil: null,
	eventHasPassed: true,
	inForceWindow: true,
	lastArchivedAt: null,
}

const extended: ArchiveBannerInfo = {
	...inGap,
	effectiveArchiveDate: '2026-07-20T00:00:00.000Z',
	deferUntil: '2026-07-20T00:00:00.000Z',
	inForceWindow: false,
}

// Mimics the real list-detail page layout (full-width page heading, then a
// description and the item list) so the badge is seen in context rather than
// in a card that resembles a list row. No fixed width: it fills the canvas
// and reflows like the real page; use the viewport to preview narrow widths.
function ListPagePreview({ archiveInfo }: { archiveInfo: ArchiveBannerInfo }) {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex min-w-0 items-center gap-2 xs:gap-3">
				<div className="size-12 shrink-0 rounded-full bg-muted" />
				<span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium">Birthday</span>
				<h1 className="min-w-0 flex-1 truncate text-2xl font-bold">Mom&apos;s Birthday Wishlist</h1>
				<ArchiveRevealBadge archiveInfo={archiveInfo} recipientName="Mom" />
			</div>

			<p className="text-muted-foreground">A few things I&apos;ve been eyeing this year - no pressure, just ideas!</p>

			<div className="flex flex-col gap-4">
				{[0, 1, 2].map(i => (
					<div key={i} className="flex items-center gap-3">
						<Skeleton className="size-16 shrink-0 rounded-md" />
						<div className="flex flex-1 flex-col gap-2">
							<Skeleton className="h-4 w-1/2" />
							<Skeleton className="h-3 w-1/4" />
						</div>
						<Skeleton className="h-8 w-20 shrink-0 rounded-md" />
					</div>
				))}
			</div>
		</div>
	)
}

const meta = {
	title: 'Lists/ArchiveBadges',
	parameters: { layout: 'padded' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const RevealBadge: Story = {
	render: () => <ListPagePreview archiveInfo={inGap} />,
}

export const RevealBadgeExtended: Story = {
	render: () => <ListPagePreview archiveInfo={extended} />,
}
