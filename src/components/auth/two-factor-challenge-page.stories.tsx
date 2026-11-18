import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { withCenteredBoundary } from '../../../.storybook/decorators'
import { TwoFactorChallengePageContent, type TwoFactorMode } from './two-factor-challenge-page'

const meta = {
	title: 'Pages/Auth/Two Factor Challenge',
	component: TwoFactorChallengePageContent,
	parameters: { layout: 'fullscreen' },
	decorators: [withCenteredBoundary],
	args: {
		mode: 'totp',
		onModeChange: () => {},
		onSubmitTotp: async () => {},
		onSubmitBackupCode: async () => {},
		signInHref: '/sign-in',
	},
} satisfies Meta<typeof TwoFactorChallengePageContent>

export default meta
type Story = StoryObj<typeof meta>

export const TOTPMode: Story = {}

// Typing the sixth digit submits on its own. The handler must get all six
// digits: it used to read the code from state in the same tick it was set,
// so it sent five and every typed or pasted code failed until Verify was
// clicked by hand.
export const TOTPAutoSubmitsFullCode: Story = {
	args: { onSubmitTotp: fn(async () => {}) },
	play: async ({ canvasElement, args }) => {
		const input = canvasElement.querySelector<HTMLInputElement>('input[data-input-otp]')
		if (!input) throw new Error('OTP input not found')
		await userEvent.click(input)
		await userEvent.keyboard('123456')
		await waitFor(() => expect(args.onSubmitTotp).toHaveBeenCalledTimes(1))
		await expect(args.onSubmitTotp).toHaveBeenCalledWith('123456', false)
	},
}

export const BackupCodeMode: Story = {
	args: { mode: 'backup' },
}

// Backup codes are mixed-case and case-sensitive; the field used to
// uppercase them, which made every code with a lowercase letter fail.
export const BackupCodeKeepsCase: Story = {
	args: { mode: 'backup', onSubmitBackupCode: fn(async () => {}) },
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		await userEvent.type(canvas.getByLabelText('Backup Code'), ' aB3dE-fG7hJ ')
		await userEvent.click(canvas.getByRole('button', { name: 'Verify' }))
		await waitFor(() => expect(args.onSubmitBackupCode).toHaveBeenCalledWith('aB3dE-fG7hJ'))
	},
}

export const Loading: Story = {
	args: { forceLoading: true },
}

export const PriorError: Story = {
	args: { initialError: "That code didn't work. Try again." },
}

function InteractiveDemo(args: React.ComponentProps<typeof TwoFactorChallengePageContent>) {
	const [mode, setMode] = useState<TwoFactorMode>(args.mode)
	return <TwoFactorChallengePageContent {...args} mode={mode} onModeChange={setMode} />
}

export const Interactive: Story = {
	render: args => <InteractiveDemo {...args} />,
}
