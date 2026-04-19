import type { Meta, StoryObj } from '@storybook/react-vite'

import EmptyMessage from './empty-message'

const meta = {
	title: 'Common/EmptyMessage',
	component: EmptyMessage,
	parameters: {
		layout: 'padded',
	},
	decorators: [
		Story => (
			<div className="max-w-md">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof EmptyMessage>

export default meta
type Story = StoryObj<typeof meta>

export const NoItems: Story = { args: { message: 'No items yet' } }
export const NoLists: Story = { args: { message: 'No lists' } }
export const LongerMessage: Story = {
	args: { message: 'No one has shared a list with you yet. Check back later.' },
}
