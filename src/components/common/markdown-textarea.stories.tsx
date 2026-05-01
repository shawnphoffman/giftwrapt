import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import { MarkdownTextarea } from './markdown-textarea'

/**
 * Textarea with a connected toolbar for basic markdown (bold, italic, list,
 * link). Used for item notes and list descriptions.
 */

function ControlledDemo({ initial, placeholder, rows }: { initial?: string; placeholder?: string; rows?: number }) {
	const [value, setValue] = useState(initial ?? '')
	return (
		<div className="max-w-xl">
			<MarkdownTextarea value={value} onChange={setValue} placeholder={placeholder} rows={rows} />
		</div>
	)
}

const meta = {
	title: 'Common/Markdown/MarkdownTextarea',
	component: ControlledDemo,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof ControlledDemo>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
	args: { placeholder: 'Color preferences, size, model, etc.', rows: 3 },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		// Toolbar buttons render alongside the textarea; verify the surface
		// the user actually interacts with is in the DOM.
		await expect(canvas.getByRole('textbox')).toBeInTheDocument()
		await expect(canvas.getByRole('button', { name: /bold/i })).toBeInTheDocument()
	},
}

export const WithContent: Story = {
	args: {
		initial: 'Prefer **enameled**: sage or cream.\n\n- Size 5-7qt\n- Avoid red\n- [Reference photo](https://example.com)',
		rows: 6,
	},
}

export const TypingUpdatesValue: Story = {
	args: { placeholder: 'Type here', rows: 3 },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const textarea = canvas.getByRole<HTMLTextAreaElement>('textbox')
		await userEvent.click(textarea)
		await userEvent.type(textarea, 'hello world')
		await expect(textarea.value).toBe('hello world')
	},
	tags: ['!autodocs'],
}

export const BoldButtonWrapsSelection: Story = {
	args: { placeholder: 'Type here', rows: 3 },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const textarea = canvas.getByRole<HTMLTextAreaElement>('textbox')
		await userEvent.click(textarea)
		await userEvent.type(textarea, 'foo')
		// Select-all then click the bold toolbar button.
		textarea.setSelectionRange(0, textarea.value.length)
		await userEvent.click(canvas.getByRole('button', { name: /bold/i }))
		await expect(textarea.value).toBe('**foo**')
	},
	tags: ['!autodocs'],
}
