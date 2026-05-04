import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'

import { AddItemSplitButton } from './add-item-split-button'

const meta = {
	title: 'Items/Components/AddItemSplitButton',
	component: AddItemSplitButton,
	parameters: { layout: 'padded' },
	args: {
		listId: 1,
		onAddItem: () => {},
		importEnabledOverride: true,
	},
} satisfies Meta<typeof AddItemSplitButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ImportDisabled: Story = {
	args: { importEnabledOverride: false },
	play: ({ canvasElement }) => {
		const canvas = within(canvasElement)
		// Caret should not render when import is disabled.
		expect(canvas.queryByLabelText('Import items')).toBeNull()
	},
}

export const Open: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const trigger = await canvas.findByLabelText('Import items')
		await userEvent.click(trigger)
		// Dropdown items render in a portal, so query the document body.
		const body = within(document.body)
		expect(await body.findByText('Paste URLs')).toBeInTheDocument()
		expect(await body.findByText('Apple Notes')).toBeInTheDocument()
		expect(await body.findByText('Amazon wish list')).toBeInTheDocument()
	},
}
