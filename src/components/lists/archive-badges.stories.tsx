import type { Meta, StoryObj } from '@storybook/react-vite'

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

// A representative list-title row so the inline placement + truncation can be
// eyeballed at different widths.
function TitleRow({ children, width }: { children: React.ReactNode; width: number }) {
	return (
		<div className="rounded-lg border p-3" style={{ width }}>
			<div className="flex min-w-0 items-center gap-2 xs:gap-3">
				<div className="size-10 shrink-0 rounded-full bg-muted" />
				<span className="shrink-0 rounded bg-muted px-2 py-1 text-xs">Birthday</span>
				<h1 className="min-w-0 flex-1 truncate text-xl font-bold">Mom&apos;s Birthday Wishlist</h1>
				{children}
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

export const RevealBadgeDesktop: Story = {
	render: () => (
		<TitleRow width={680}>
			<ArchiveRevealBadge archiveInfo={inGap} recipientName="Mom" />
		</TitleRow>
	),
}

export const RevealBadgeMobile: Story = {
	render: () => (
		<TitleRow width={360}>
			<ArchiveRevealBadge archiveInfo={inGap} recipientName="Mom" />
		</TitleRow>
	),
}

export const RevealBadgeExtended: Story = {
	render: () => (
		<TitleRow width={680}>
			<ArchiveRevealBadge archiveInfo={extended} recipientName="Mom" />
		</TitleRow>
	),
}
