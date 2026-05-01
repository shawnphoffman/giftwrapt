import type { Meta, StoryObj } from '@storybook/react-vite'

import { withCenteredBoundary } from '../../../.storybook/decorators'
import { ResetPasswordPageContent } from './reset-password-page'

const meta = {
	title: 'Pages/Reset Password',
	component: ResetPasswordPageContent,
	parameters: { layout: 'fullscreen' },
	decorators: [withCenteredBoundary],
	args: {
		onSubmit: async () => {},
		signInHref: '/sign-in',
		tokenPresent: true,
	},
} satisfies Meta<typeof ResetPasswordPageContent>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Loading: Story = {
	args: { forceLoading: true },
}

export const SubmitFails: Story = {
	args: {
		onSubmit: () => Promise.reject(new Error('boom')),
	},
}

export const Submitted: Story = {
	args: { initialSubmitted: true },
}

export const MissingToken: Story = {
	args: { tokenPresent: false },
}

export const PriorError: Story = {
	args: { initialError: 'This reset link has expired. Request a new one.' },
}
