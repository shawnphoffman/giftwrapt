import type { Meta, StoryObj } from '@storybook/react-vite'

import { AddBirthdayBanner } from './add-birthday-banner'

const meta = {
	title: 'Lists/AddBirthdayBanner',
	component: AddBirthdayBanner,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof AddBirthdayBanner>

export default meta
type Story = StoryObj<typeof meta>

// The owner's own birthday or wishlist list; their profile has no birthday.
export const Owner: Story = {}

// A list made for a dependent (pet, baby) with no birthday set.
export const Dependent: Story = {
	args: { dependentName: 'Fido' },
}
