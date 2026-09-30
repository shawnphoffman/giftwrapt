import type { Meta, StoryObj } from '@storybook/react-vite'

import { AddBirthdayBanner } from './add-birthday-banner'

const meta = {
	title: 'Lists/AddBirthdayBanner',
	component: AddBirthdayBanner,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof AddBirthdayBanner>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
