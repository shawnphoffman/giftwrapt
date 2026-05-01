import type { Meta, StoryObj } from '@storybook/react-vite'

import { PasskeysPanelContent, type PasskeySummary } from './passkeys-panel'

const SAMPLE_PASSKEYS: Array<PasskeySummary> = [
	{
		id: 'pk_1',
		name: 'iPhone 16 Pro',
		deviceType: 'multiDevice',
		createdAt: new Date('2026-04-12T19:24:00Z'),
	},
	{
		id: 'pk_2',
		name: 'Mac Touch ID',
		deviceType: 'multiDevice',
		createdAt: new Date('2026-04-09T14:09:00Z'),
	},
	{
		id: 'pk_3',
		name: 'YubiKey 5C',
		deviceType: 'singleDevice',
		createdAt: new Date('2026-03-30T11:00:00Z'),
	},
]

const meta = {
	title: 'Settings/Passkeys Panel',
	component: PasskeysPanelContent,
	parameters: { layout: 'padded' },
	args: {
		passkeys: SAMPLE_PASSKEYS,
		loading: false,
		supported: true,
		registering: false,
		busyId: null,
		error: null,
		onRegister: async () => {},
		onRename: async () => {},
		onDelete: async () => {},
	},
} satisfies Meta<typeof PasskeysPanelContent>

export default meta
type Story = StoryObj<typeof meta>

export const PopulatedList: Story = {}

export const Empty: Story = {
	args: { passkeys: [] },
}

export const Loading: Story = {
	args: { passkeys: null, loading: true },
}

export const Registering: Story = {
	args: { passkeys: SAMPLE_PASSKEYS, registering: true },
}

export const RowBusy: Story = {
	args: { passkeys: SAMPLE_PASSKEYS, busyId: 'pk_2' },
}

export const ErrorState: Story = {
	args: { passkeys: SAMPLE_PASSKEYS, error: "Couldn't reach the authenticator. Try again." },
}

export const Unsupported: Story = {
	args: { supported: false, passkeys: null },
}
