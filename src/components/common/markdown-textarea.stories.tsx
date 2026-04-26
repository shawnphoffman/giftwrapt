import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

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
}

export const WithContent: Story = {
	args: {
		initial: 'Prefer **enameled**: sage or cream.\n\n- Size 5-7qt\n- Avoid red\n- [Reference photo](https://example.com)',
		rows: 6,
	},
}
