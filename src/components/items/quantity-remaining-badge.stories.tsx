import type { Meta, StoryObj } from '@storybook/react-vite'

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

const STATES: Array<{ label: string; quantity: number; remaining: number; youClaimed?: boolean; lockReason?: LockReason }> = [
	{ label: 'qty 1, unclaimed', quantity: 1, remaining: 1 },
	{ label: 'qty 1, claimed', quantity: 1, remaining: 0 },
	{ label: 'qty 1, claimed (you)', quantity: 1, remaining: 0, youClaimed: true },
	{ label: 'qty 1, locked by order', quantity: 1, remaining: 1, lockReason: 'order' },
	{ label: 'qty 1, locked by or-group', quantity: 1, remaining: 1, lockReason: 'or' },
	{ label: 'qty 3, none claimed', quantity: 3, remaining: 3 },
	{ label: 'qty 3, 1 claimed', quantity: 3, remaining: 2 },
	{ label: 'qty 3, 2 claimed', quantity: 3, remaining: 1 },
	{ label: 'qty 6, 2 claimed', quantity: 6, remaining: 4 },
	{ label: 'qty 7, 3 claimed', quantity: 7, remaining: 4 },
	{ label: 'qty 10, 4 claimed', quantity: 10, remaining: 6 },
	{ label: 'qty 12, 7 claimed', quantity: 12, remaining: 5 },
	{ label: 'qty 20, 8 claimed', quantity: 20, remaining: 12 },
	{ label: 'qty 3, fully claimed', quantity: 3, remaining: 0 },
	{ label: 'qty 3, 1 claimed (you)', quantity: 3, remaining: 2, youClaimed: true },
	{ label: 'qty 3, 2 claimed (you)', quantity: 3, remaining: 1, youClaimed: true },
	{ label: 'qty 3, fully claimed (you)', quantity: 3, remaining: 0, youClaimed: true },
	{ label: 'qty 3, locked by order', quantity: 3, remaining: 3, lockReason: 'order' },
	{ label: 'qty 3, locked by or-group', quantity: 3, remaining: 3, lockReason: 'or' },
]

export const Gallery: Story = {
	args: { quantity: 4, remaining: 2 },
	render: () => (
		<table className="border-collapse text-sm">
			<thead>
				<tr>
					<th className="text-left font-mono text-xs text-muted-foreground font-normal px-3 py-2 border-b">state</th>
					{VARIANTS.map(v => (
						<th key={v} className="text-left text-[10px] uppercase tracking-wide text-muted-foreground font-medium px-4 py-2 border-b">
							{v}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{STATES.map(state => (
					<tr key={state.label}>
						<td className="font-mono text-xs text-muted-foreground px-3 py-3 border-b align-middle whitespace-nowrap">{state.label}</td>
						{VARIANTS.map(v => (
							<td key={v} className="px-4 py-3 border-b align-middle">
								<QuantityRemainingBadge
									variant={v}
									quantity={state.quantity}
									remaining={state.remaining}
									youClaimed={state.youClaimed}
									lockReason={state.lockReason}
								/>
							</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	),
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

// ---------- Playground (knobs-driven) ----------

export const Playground: Story = {
	args: { quantity: 5, remaining: 3, variant: 'split', youClaimed: false, lockReason: undefined },
}
