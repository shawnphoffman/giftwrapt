import type { Meta, StoryObj } from '@storybook/react-vite'

import { TextSizeSettings } from './text-size-settings'

// Moving the slider resizes the whole Storybook canvas, the same way it
// resizes the app; Reset to Default puts it back.
const meta = {
	title: 'Settings/Text Size',
	component: TextSizeSettings,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof TextSizeSettings>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
