import type { Meta, StoryObj } from '@storybook/react-vite'

import BirthdayBadge from './birthday-badge'

const meta = {
	title: 'Common/Badges/BirthdayBadge',
	component: BirthdayBadge,
	parameters: {
		layout: 'padded',
	},
} satisfies Meta<typeof BirthdayBadge>

export default meta
type Story = StoryObj<typeof meta>

export const FarAway: Story = {
	args: { birthMonth: 'october', birthDay: 14 },
	parameters: {
		docs: {
			description: { story: 'No countdown badge when the birthday is more than 30 days away.' },
		},
	},
}

export const WithCountdown: Story = {
	args: { birthMonth: 'may', birthDay: 3 },
	parameters: {
		docs: {
			description: { story: 'Countdown badge appears when the birthday is within 30 days.' },
		},
	},
}

export const MissingData: Story = {
	args: { birthMonth: null, birthDay: null },
	parameters: {
		docs: { description: { story: 'Renders nothing when month or day is missing.' } },
	},
}
