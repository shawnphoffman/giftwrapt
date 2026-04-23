import type { Meta, StoryObj } from '@storybook/react-vite'

import { GroupConnector } from './group-connector'

/**
 * Small pill between items of the same group. OR for pick-one groups, a down
 * arrow for ordered groups. Rendered with h-0 so the pill overlaps the
 * boundary between rows instead of occupying its own vertical slot.
 */

const meta = {
	title: 'Items/Components/GroupConnector',
	component: GroupConnector,
	parameters: { layout: 'padded' },
	decorators: [
		Story => (
			<div className="max-w-sm">
				<div className="p-3 border rounded bg-muted/40">Item above</div>
				<Story />
				<div className="p-3 border rounded bg-muted/40">Item below</div>
			</div>
		),
	],
} satisfies Meta<typeof GroupConnector>

export default meta
type Story = StoryObj<typeof meta>

export const PickOne: Story = {
	args: { type: 'or' },
}

export const Ordered: Story = {
	args: { type: 'order' },
}
