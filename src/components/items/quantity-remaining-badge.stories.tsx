import type { Meta, StoryObj } from '@storybook/react-vite'

import { QuantityRemainingBadge } from './quantity-remaining-badge'

/**
 * Consolidated quantity + remaining indicator for the gifter view.
 *
 * Hides itself entirely when an item has `quantity: 1` (the Claim /
 * Fully claimed controls already communicate that state). For
 * multi-quantity items it always shows the desired count, and when
 * claims exist it surfaces how many slots remain (or that the item
 * is fully covered).
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
	},
} satisfies Meta<typeof QuantityRemainingBadge>

export default meta
type Story = StoryObj<typeof meta>

// ---------- State matrix (default `split` variant) ----------

export const SingleUnclaimed: Story = {
	args: { quantity: 1, remaining: 1 },
	parameters: { docs: { description: { story: 'qty=1, unclaimed — renders nothing.' } } },
}

export const SingleClaimed: Story = {
	args: { quantity: 1, remaining: 0 },
	parameters: { docs: { description: { story: 'qty=1, claimed — renders nothing.' } } },
}

export const MultiUnclaimed: Story = {
	args: { quantity: 4, remaining: 4 },
	parameters: { docs: { description: { story: 'qty=4, no claims yet — shows just the desired count.' } } },
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

// ---------- Variant comparison ----------

const VARIANTS = ['split', 'inline', 'inline-pill', 'dots'] as const

const STATES: Array<{ label: string; quantity: number; remaining: number }> = [
	{ label: 'qty 1, unclaimed', quantity: 1, remaining: 1 },
	{ label: 'qty 1, claimed', quantity: 1, remaining: 0 },
	{ label: 'qty 3, none claimed', quantity: 3, remaining: 3 },
	{ label: 'qty 3, 1 claimed', quantity: 3, remaining: 2 },
	{ label: 'qty 3, 2 claimed', quantity: 3, remaining: 1 },
	{ label: 'qty 6, 2 claimed', quantity: 6, remaining: 4 },
	{ label: 'qty 7, 3 claimed', quantity: 7, remaining: 4 },
	{ label: 'qty 10, 4 claimed', quantity: 10, remaining: 6 },
	{ label: 'qty 12, 7 claimed', quantity: 12, remaining: 5 },
	{ label: 'qty 20, 8 claimed', quantity: 20, remaining: 12 },
	{ label: 'qty 3, fully claimed', quantity: 3, remaining: 0 },
]

export const VariantComparison: Story = {
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
								<QuantityRemainingBadge variant={v} quantity={state.quantity} remaining={state.remaining} />
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
				story: 'All visual variants across the full state matrix. Pick the treatment that reads best and discard the others.',
			},
		},
	},
}

// ---------- Playground (knobs-driven) ----------

export const Playground: Story = {
	args: { quantity: 5, remaining: 3, variant: 'split' },
}
