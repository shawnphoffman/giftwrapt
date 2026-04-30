import type { Meta, StoryObj } from '@storybook/react-vite'

import { withCenteredBoundary } from '../../../.storybook/decorators'
import { SignOutPageContent } from './sign-out-page'

const meta = {
	title: 'Pages/Sign Out',
	component: SignOutPageContent,
	parameters: { layout: 'fullscreen' },
	decorators: [withCenteredBoundary],
} satisfies Meta<typeof SignOutPageContent>

export default meta
type Story = StoryObj<typeof meta>

export const SigningOut: Story = {}

export const WithError: Story = {
	args: { error: 'sign-out timed out' },
}
