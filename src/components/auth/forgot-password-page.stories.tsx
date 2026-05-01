import type { Meta, StoryObj } from '@storybook/react-vite'

import { withCenteredBoundary } from '../../../.storybook/decorators'
import { ForgotPasswordPageContent } from './forgot-password-page'

const meta = {
	title: 'Pages/Forgot Password',
	component: ForgotPasswordPageContent,
	parameters: { layout: 'fullscreen' },
	decorators: [withCenteredBoundary],
	args: {
		onSubmit: async () => {},
		signInHref: '/sign-in',
	},
} satisfies Meta<typeof ForgotPasswordPageContent>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const SubmittedConfirmation: Story = {
	args: { initialSubmitted: true },
}

export const Loading: Story = {
	args: { forceLoading: true },
}

export const SubmitFails: Story = {
	args: {
		onSubmit: () => Promise.reject(new Error('boom')),
	},
}

export const EmailDisabled: Story = {
	args: { emailEnabled: false },
}
