import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import { withCenteredBoundary } from '../../../.storybook/decorators'
import { EmbeddedReconnect } from './embedded-reconnect'

// The screen the iOS web tab sees instead of any auth form. There is no
// native bridge in Storybook, so the mount-time message is a no-op here.
const meta = {
	title: 'Pages/Auth/Embedded Reconnect',
	component: EmbeddedReconnect,
	parameters: { layout: 'fullscreen' },
	decorators: [withCenteredBoundary],
	args: { to: '/lists/42' },
} satisfies Meta<typeof EmbeddedReconnect>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.getByRole('heading', { name: /reconnecting/i })).toBeInTheDocument()
		await expect(canvas.getByRole('button', { name: /try again/i })).toBeInTheDocument()
		await expect(canvas.queryByLabelText(/password/i)).not.toBeInTheDocument()
	},
}
