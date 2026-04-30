import type { Meta, StoryObj } from '@storybook/react-vite'

import ListLinkBadge from './list-link-badge'

const meta = {
	title: 'Common/ListLinkBadge',
	component: ListLinkBadge,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof ListLinkBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
	args: { listId: 42, name: "Alex's Christmas List" },
}

export const WithFromParent: Story = {
	args: { listId: 42, name: "Alex's Christmas List", from: 7 },
}

export const LongName: Story = {
	args: { listId: 99, name: 'A very long sublist name that should truncate inside the badge so it does not blow out the row layout' },
	decorators: [
		Story => (
			<div className="max-w-xs">
				<Story />
			</div>
		),
	],
}
