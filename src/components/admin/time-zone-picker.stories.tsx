import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import { TimeZonePicker } from './time-zone-picker'

/**
 * Deployment time zone chooser for the admin Core settings. Searchable over
 * every IANA zone the browser knows, with UTC first and the browser's own
 * zone offered as a shortcut when it differs from the saved value.
 */
const meta = {
	title: 'Admin/Time Zone Picker',
	component: TimeZonePicker,
	parameters: { layout: 'padded' },
	argTypes: { onChange: { action: 'changed' } },
} satisfies Meta<typeof TimeZonePicker>

export default meta
type Story = StoryObj<typeof meta>

function Controlled({ initial }: { initial: string }) {
	const [value, setValue] = useState(initial)
	return <TimeZonePicker value={value} onChange={setValue} />
}

export const Default: Story = {
	args: { value: 'UTC', onChange: () => {} },
	render: () => <Controlled initial="UTC" />,
}

export const ConfiguredZone: Story = {
	args: { value: 'America/Los_Angeles', onChange: () => {} },
	render: () => <Controlled initial="America/Los_Angeles" />,
}
