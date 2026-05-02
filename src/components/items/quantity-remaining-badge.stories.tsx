import type { Meta, StoryObj } from '@storybook/react-vite'
import { Check, CircleDot, ListOrdered, Lock, X } from 'lucide-react'
import { Fragment, useState } from 'react'

import { cn } from '@/lib/utils'

import { type LockReason, QuantityRemainingBadge } from './quantity-remaining-badge'

/**
 * Consolidated quantity + remaining indicator for the gifter view.
 *
 * For multi-quantity items it always shows the desired count, and when
 * claims exist it surfaces how many slots remain (or that the item is
 * fully covered). For single-quantity items it renders nothing while
 * unclaimed and a "Claimed" pill once a claim is made (green when the
 * current viewer is the claimer).
 */
const meta = {
	title: 'Items/Components/QuantityRemainingBadge',
	component: QuantityRemainingBadge,
	parameters: { layout: 'padded' },
	argTypes: {
		variant: {
			control: 'inline-radio',
			options: ['split', 'inline', 'inline-pill', 'dots'],
		},
		youClaimed: { control: 'boolean' },
		lockReason: { control: 'inline-radio', options: [undefined, 'order', 'or'] },
	},
} satisfies Meta<typeof QuantityRemainingBadge>

export default meta
type Story = StoryObj<typeof meta>

// ---------- Gallery (variant comparison) ----------

const VARIANTS = ['split', 'inline', 'inline-pill', 'dots'] as const

type GalleryState = {
	quantity: number
	remaining: number
	youClaimed?: boolean
	lockReason?: LockReason
	claimedCount?: number
	unavailable?: boolean
}

const STATES: Array<GalleryState> = [
	// wants 1
	{ quantity: 1, remaining: 1 },
	{ quantity: 1, remaining: 0 },
	{ quantity: 1, remaining: 0, youClaimed: true },
	{ quantity: 1, remaining: 1, lockReason: 'order' },
	{ quantity: 1, remaining: 1, lockReason: 'or' },
	// wants 3
	{ quantity: 3, remaining: 3 },
	{ quantity: 3, remaining: 2 },
	{ quantity: 3, remaining: 1 },
	{ quantity: 3, remaining: 0 },
	{ quantity: 3, remaining: 2, youClaimed: true },
	{ quantity: 3, remaining: 1, youClaimed: true },
	{ quantity: 3, remaining: 0, youClaimed: true },
	{ quantity: 3, remaining: 3, lockReason: 'order' },
	{ quantity: 3, remaining: 3, lockReason: 'or' },
	// dots scaling
	{ quantity: 6, remaining: 4 },
	{ quantity: 7, remaining: 4 },
	{ quantity: 10, remaining: 6 },
	{ quantity: 12, remaining: 5 },
	{ quantity: 20, remaining: 12 },
	// over-claimed
	{ quantity: 1, remaining: 0, claimedCount: 3 },
	{ quantity: 1, remaining: 0, claimedCount: 3, youClaimed: true },
	{ quantity: 3, remaining: 0, claimedCount: 5 },
	{ quantity: 3, remaining: 0, claimedCount: 5, youClaimed: true },
	// unavailable (toggle is gated on hasNoClaims, so remaining always equals quantity)
	{ quantity: 1, remaining: 1, unavailable: true },
	{ quantity: 3, remaining: 3, unavailable: true },
]

function describeState(state: GalleryState): { wants: string; claimed: string; overclaimed: boolean } {
	const overClaimed = state.claimedCount !== undefined && state.claimedCount > state.quantity
	const claimedNum = overClaimed ? (state.claimedCount as number) : state.quantity - state.remaining
	return {
		wants: `×${state.quantity}`,
		claimed: claimedNum > 0 ? `×${claimedNum}` : '—',
		overclaimed: overClaimed,
	}
}

function GalleryRender() {
	const [hoveredRow, setHoveredRow] = useState<number | null>(null)
	const headerCell = 'h-8 text-[10px] uppercase tracking-wide text-muted-foreground font-medium border-b px-3 flex items-center'
	return (
		<div className="overflow-x-auto max-w-full">
			<div className="grid grid-cols-[repeat(5,auto)_repeat(4,auto)] text-sm w-max">
				<div className={headerCell}>wants</div>
				<div className={headerCell}>claimed</div>
				<div className={headerCell}>you claimed</div>
				<div className={headerCell}>over</div>
				<div className={cn(headerCell, 'justify-center')}>
					<Lock className="size-3.5" aria-label="locked" />
				</div>
				{VARIANTS.map(v => (
					<div key={v} className={cn(headerCell, 'px-4')}>
						{v}
					</div>
				))}
				{STATES.map((state, idx) => {
					const { wants, claimed, overclaimed } = describeState(state)
					const isHovered = hoveredRow === idx
					const onEnter = () => setHoveredRow(idx)
					const onLeave = () => setHoveredRow(prev => (prev === idx ? null : prev))
					const cell = cn(
						'h-8 border-b flex items-center transition-colors text-xs text-muted-foreground whitespace-nowrap',
						isHovered && 'bg-muted/60'
					)
					return (
						<Fragment key={idx}>
							<div onMouseEnter={onEnter} onMouseLeave={onLeave} className={cn(cell, 'text-sm px-3 font-mono')}>
								{wants}
							</div>
							<div onMouseEnter={onEnter} onMouseLeave={onLeave} className={cn(cell, 'text-sm px-3 font-mono')}>
								{claimed}
							</div>
							<div onMouseEnter={onEnter} onMouseLeave={onLeave} className={cn(cell, 'text-sm px-3 justify-center')}>
								{state.youClaimed && <Check className="size-4 text-emerald-600 dark:text-emerald-400" aria-label="you claimed" />}
							</div>
							<div onMouseEnter={onEnter} onMouseLeave={onLeave} className={cn(cell, 'px-3 justify-center')}>
								{overclaimed && <Check className="size-4 text-yellow-600 dark:text-yellow-400" aria-label="overclaimed" />}
							</div>
							<div onMouseEnter={onEnter} onMouseLeave={onLeave} className={cn(cell, 'px-3 justify-center')}>
								{state.unavailable && <X className="size-4 text-red-600 dark:text-red-400" aria-label="unavailable" />}
								{!state.unavailable && state.lockReason === 'order' && <ListOrdered className="size-4" aria-label="order group" />}
								{!state.unavailable && state.lockReason === 'or' && <CircleDot className="size-4" aria-label="pick group" />}
							</div>
							{VARIANTS.map(v => (
								<div key={v} onMouseEnter={onEnter} onMouseLeave={onLeave} className={cn(cell, 'px-4')}>
									<QuantityRemainingBadge
										variant={v}
										quantity={state.quantity}
										remaining={state.remaining}
										claimedCount={state.claimedCount}
										youClaimed={state.youClaimed}
										lockReason={state.lockReason}
										unavailable={state.unavailable}
									/>
								</div>
							))}
						</Fragment>
					)
				})}
			</div>
		</div>
	)
}

export const Gallery: Story = {
	args: { quantity: 4, remaining: 2 },
	render: () => <GalleryRender />,
	parameters: {
		docs: {
			description: {
				story:
					'All visual variants across the full state matrix, including "you claimed this" rows that render in the green/success treatment. Pick the treatment that reads best and discard the others.',
			},
		},
	},
}

// ---------- State matrix (default `split` variant) ----------

export const SingleUnclaimed: Story = {
	args: { quantity: 1, remaining: 1 },
	parameters: { docs: { description: { story: 'qty=1 and unclaimed. Renders nothing.' } } },
}

export const SingleClaimed: Story = {
	args: { quantity: 1, remaining: 0 },
	parameters: { docs: { description: { story: 'qty=1 and claimed by someone else. Renders a muted "Claimed" pill.' } } },
}

export const SingleClaimedByYou: Story = {
	args: { quantity: 1, remaining: 0, youClaimed: true },
	parameters: {
		docs: { description: { story: 'qty=1 and claimed by the current viewer. Renders "Claimed" in the green/success treatment.' } },
	},
}

export const MultiUnclaimed: Story = {
	args: { quantity: 4, remaining: 4 },
	parameters: { docs: { description: { story: 'qty=4 with no claims yet. Shows just the desired count.' } } },
}

export const MultiPartialOneLeft: Story = {
	args: { quantity: 3, remaining: 1 },
}

export const MultiPartialSeveralLeft: Story = {
	args: { quantity: 6, remaining: 4 },
}

export const MultiFullyClaimed: Story = {
	args: { quantity: 3, remaining: 0 },
}

export const YouClaimedPartial: Story = {
	args: { quantity: 3, remaining: 2, youClaimed: true },
	parameters: {
		docs: {
			description: {
				story:
					'You claimed 1 of 3 but the item is not fully covered yet. Visually identical to the non-you partial state - claimer presence is communicated by ClaimUsers, not the badge.',
			},
		},
	},
}

export const YouClaimedFully: Story = {
	args: { quantity: 3, remaining: 0, youClaimed: true },
	parameters: { docs: { description: { story: 'Fully claimed and you are among the claimers. Stays green instead of muting.' } } },
}

// ---------- Locked states ----------

export const LockedByOthersQty1: Story = {
	args: { quantity: 1, remaining: 0 },
	parameters: {
		docs: {
			description: {
				story:
					'qty=1 fully claimed by someone else. Renders the "Claimed" pill with a Lock icon and a popover that explains who blocked the slot.',
			},
		},
	},
}

export const LockedByOthersMulti: Story = {
	args: { quantity: 3, remaining: 0 },
	parameters: {
		docs: {
			description: { story: 'qty>1 fully claimed by others. The split pill picks up a Lock icon plus the explanation popover.' },
		},
	},
}

export const LockedByOrder: Story = {
	args: { quantity: 3, remaining: 3, lockReason: 'order' },
	parameters: {
		docs: {
			description: {
				story:
					'Group rule blocks the viewer until an earlier item is claimed. The badge hides the quantity copy and shows just a Lock pill; the popover explains the rule.',
			},
		},
	},
}

export const LockedByOrGroup: Story = {
	args: { quantity: 1, remaining: 1, lockReason: 'or' },
	parameters: {
		docs: {
			description: {
				story: 'Pick-one group: a sibling item is already claimed. Lock pill + popover replaces the would-be empty trailing area.',
			},
		},
	},
}

// ---------- Edge case: over-claimed ----------

export const OverClaimedNotYourClaim: Story = {
	args: { quantity: 1, remaining: 0, claimedCount: 3 },
	parameters: {
		docs: {
			description: {
				story:
					"Over-claimed: the actual sum of claims exceeds items.quantity. This happens when the recipient lowers the quantity after claims have been made (they can't see claims, so they don't know they're causing it). The recipient never sees this badge (their edit views don't include claim data), so showing the truth to gifters does NOT break spoiler protection. Renders as a yellow split pill with a lock icon for viewers who aren't claimers.",
			},
		},
	},
}

export const OverClaimedYouClaimed: Story = {
	args: { quantity: 1, remaining: 0, claimedCount: 3, youClaimed: true },
	parameters: {
		docs: {
			description: {
				story:
					'Over-claimed and you are one of the claimers. Same yellow split pill as above but no lock icon (you can still edit your existing claim).',
			},
		},
	},
}

// ---------- Playground (knobs-driven) ----------

export const Playground: Story = {
	args: { quantity: 5, remaining: 3, variant: 'split', youClaimed: false, lockReason: undefined },
}
