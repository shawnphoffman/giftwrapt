import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

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

export const BackupCodeMode: Story = {
	args: { mode: 'backup' },
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
