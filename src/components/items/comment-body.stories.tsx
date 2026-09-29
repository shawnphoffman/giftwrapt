import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { expect, within } from 'storybook/test'

import { CommentBody } from './comment-body'

/**
 * Renders stored comment text. `@[Name](userId)` tokens show as highlighted
 * names; a mention of the signed-in viewer gets an extra tint.
 */

function Frame(props: ComponentProps<typeof CommentBody>) {
	return (
		<p className="max-w-md text-sm text-foreground/80 whitespace-pre-wrap">
			<CommentBody {...props} />
		</p>
	)
}

const meta = {
	title: 'Items/Components/CommentBody',
	component: Frame,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof Frame>

export default meta
type Story = StoryObj<typeof meta>

export const PlainText: Story = {
	args: { text: 'The cream glaze is the one to get, not the bright ones.' },
}

export const WithMentions: Story = {
	args: { text: '@[Aunt Jo](u-jo) did you already grab this? If not, @[Sam Sibling](u-sam) and I can split it.' },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.getByText('@Aunt Jo')).toHaveAttribute('data-mention-user-id', 'u-jo')
		await expect(canvas.getByText('@Sam Sibling')).toHaveAttribute('data-mention-user-id', 'u-sam')
		// Raw token syntax never reaches the screen.
		await expect(canvasElement.textContent).not.toContain('](')
	},
}

export const MentionsTheViewer: Story = {
	args: { text: '@[Alex](u-alex) what size do you wear?', currentUserId: 'u-alex' },
}

export const Multiline: Story = {
	args: { text: 'Two options:\n- the cream one\n- the slate one\n\n@[Mom](u-mom) thoughts?' },
}
