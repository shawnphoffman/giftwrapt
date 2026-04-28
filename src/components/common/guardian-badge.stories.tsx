import type { Meta, StoryObj } from '@storybook/react-vite'

import GuardianBadge from './guardian-badge'

const meta = {
	title: 'Common/GuardianBadge',
	component: GuardianBadge,
	parameters: {
		layout: 'padded',
	},
} satisfies Meta<typeof GuardianBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
