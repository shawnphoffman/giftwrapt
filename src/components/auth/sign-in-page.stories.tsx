import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

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

export const Default: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.getByLabelText(/email/i)).toBeInTheDocument()
		await expect(canvas.getByLabelText(/password/i)).toBeInTheDocument()
		await expect(canvas.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
	},
}

export const WithError: Story = {
	args: { initialError: 'Invalid email or password.' },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.getByText(/invalid email or password/i)).toBeInTheDocument()
	},
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

export const SubmitsCredentials: Story = {
	args: {
		// `fn()` records calls so the assertion below can confirm the handler
		// got the typed values verbatim.
		onSubmit: fn(() => Promise.resolve(undefined)),
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		await userEvent.type(canvas.getByLabelText(/email/i), 'alice@test.local')
		await userEvent.type(canvas.getByLabelText(/password/i), 'hunter2')
		await userEvent.click(canvas.getByRole('button', { name: /sign in/i }))

		await waitFor(() => {
			expect(args.onSubmit).toHaveBeenCalledWith('alice@test.local', 'hunter2')
		})
	},
	tags: ['!autodocs'],
}

export const ShowsErrorWhenSubmitRejects: Story = {
	args: {
		onSubmit: () => Promise.reject(new Error('boom')),
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await userEvent.type(canvas.getByLabelText(/email/i), 'alice@test.local')
		await userEvent.type(canvas.getByLabelText(/password/i), 'hunter2')
		await userEvent.click(canvas.getByRole('button', { name: /sign in/i }))

		await waitFor(async () => {
			await expect(canvas.getByText(/invalid email or password/i)).toBeInTheDocument()
		})
	},
	tags: ['!autodocs'],
}
