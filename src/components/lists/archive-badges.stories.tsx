import type { Meta, StoryObj } from '@storybook/react-vite'

import ListTypeTile from '@/components/common/list-type-tile'
import UserAvatar from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { ArchiveBannerInfo } from '@/lib/archive-schedule-loader'

import { ArchiveRevealBadge } from './archive-reveal-badge'

// Note: only the gifting-view `ArchiveRevealBadge` is storied here. The
// edit-view `ArchiveManagerBadge` statically imports the reveal-timing server
// fns, which the Storybook/vitest browser runner can't resolve for a
// newly-added server-fn module; it shares the identical badge trigger, so its
// look is represented by the reveal badge below.

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

// Mimics the real list-detail page: heading, description, then the item
// filter bar - where the reveal badge now lives (left edge, separated from
// the right-aligned filter controls and styled to stand out from them).
function ListPagePreview({ archiveInfo }: { archiveInfo: ArchiveBannerInfo }) {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex min-w-0 items-center gap-1 xs:gap-3">
				<UserAvatar name="Mom" image={null} size="large" className="border-2 border-background" />
				<ListTypeTile type="birthday" />
				<h1 className="truncate text-2xl font-bold">Mom&apos;s Birthday Wishlist</h1>
			</div>

			<p className="text-muted-foreground">A few things I&apos;ve been eyeing this year - no pressure, just ideas!</p>

			<div className="flex flex-col gap-3">
				<div className="flex flex-row flex-wrap items-center justify-end gap-1">
					<ArchiveRevealBadge archiveInfo={archiveInfo} recipientName="Mom" />
					<Button variant="outline" size="sm" className="h-7 text-xs text-muted-foreground">
						All items
					</Button>
					<Button variant="outline" size="sm" className="h-7 text-xs text-muted-foreground">
						Any price
					</Button>
					<Button variant="outline" size="sm" className="h-7 text-xs text-muted-foreground">
						Priority
					</Button>
				</div>

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
