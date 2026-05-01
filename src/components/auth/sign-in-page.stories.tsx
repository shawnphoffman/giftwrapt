import type { Meta, StoryObj } from '@storybook/react-vite'

import { withCenteredBoundary } from '../../../.storybook/decorators'
import { SignInPageContent } from './sign-in-page'

const meta = {
	title: 'Pages/Sign In',
	component: SignInPageContent,
	parameters: { layout: 'fullscreen' },
	decorators: [withCenteredBoundary],
	args: {
		onSubmit: async () => {},
	},
} satisfies Meta<typeof SignInPageContent>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithError: Story = {
	args: { initialError: 'Invalid email or password.' },
}

export const Loading: Story = {
	args: { forceLoading: true },
}

export const SubmitFails: Story = {
	args: {
		onSubmit: () => Promise.reject(new Error('boom')),
	},
}

export const WithPasskeyOption: Story = {
	args: {
		forgotPasswordHref: '/forgot-password',
		onSignInWithPasskey: async () => {
			await new Promise(resolve => setTimeout(resolve, 500))
		},
	},
}
