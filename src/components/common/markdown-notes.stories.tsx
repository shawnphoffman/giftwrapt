import type { Meta, StoryObj } from '@storybook/react-vite'

import { MarkdownNotes } from './markdown-notes'

const meta = {
	title: 'Common/Markdown/MarkdownNotes',
	component: MarkdownNotes,
	parameters: {
		layout: 'padded',
	},
	decorators: [
		Story => (
			<div className="max-w-xl">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof MarkdownNotes>

export default meta
type Story = StoryObj<typeof meta>

export const PlainText: Story = {
	args: { content: 'Any neutral color works, cream, sage, or stone preferred over bright glazes.' },
}

export const WithFormatting: Story = {
	args: {
		content: `**Preferred**: size medium.\n\n*Also fine*: size large if medium is sold out.\n\nSee [the brand page](https://example.com) for sizing.`,
	},
}

export const WithList: Story = {
	args: {
		content: `Top picks:\n\n- Black or navy\n- No logos\n- Natural fabric if possible\n\n> A runner-up option is linked below.`,
	},
}

export const SanitizesHtml: Story = {
	args: {
		content: `Safe markdown renders. <script>alert('xss')</script> Scripts are stripped by rehype-sanitize.`,
	},
}
