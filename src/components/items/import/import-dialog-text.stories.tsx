import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { ImportDialogText } from './import-dialog-text'

/**
 * The AI import source: paste any text, one model call picks out the
 * items, and the shared preview table lets the user fix or drop rows
 * before anything is created. Only reachable when the admin has turned
 * `aiPasteToItemsEnabled` on.
 */
const meta = {
	title: 'Items/Components/ImportDialogText',
	component: ImportDialogText,
	parameters: { layout: 'padded' },
	args: {
		listId: 1,
		open: true,
		onOpenChange: () => {},
	},
} satisfies Meta<typeof ImportDialogText>

export default meta
type Story = StoryObj<typeof meta>

export const InputStep: Story = {}

export const PreviewStep: Story = {
	play: async ({ canvasElement }) => {
		// The dialog renders in a portal, so query the whole document.
		const screen = within(canvasElement.ownerDocument.body)
		await userEvent.type(
			await screen.findByLabelText('Text'),
			'blue enamel mug, the big one. wool socks size M about $18. trail map poster'
		)
		await userEvent.click(screen.getByRole('button', { name: 'Find Items' }))
		await waitFor(() => expect(screen.getByDisplayValue('Blue Enamel Mug')).toBeInTheDocument())
	},
}
