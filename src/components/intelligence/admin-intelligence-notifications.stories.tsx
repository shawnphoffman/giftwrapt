import type { Meta, StoryObj } from '@storybook/react-vite'

import { withPageContainer } from '../../../.storybook/decorators'
import { adminData } from './__fixtures__/data'
import { IntelligenceNotificationsCard } from './admin-intelligence-sections'

const meta = {
	title: 'Intelligence/AdminNotificationsCard',
	component: IntelligenceNotificationsCard,
	parameters: { layout: 'fullscreen' },
	decorators: [withPageContainer],
	args: { patch: () => {} },
} satisfies Meta<typeof IntelligenceNotificationsCard>

export default meta
type Story = StoryObj<typeof meta>

const withEmail = (email: Partial<typeof adminData.settings.email>) => ({
	...adminData,
	settings: {
		...adminData.settings,
		email: { ...adminData.settings.email, enabled: true, weeklyDigestEnabled: true, ...email },
	},
})

export const AllAdmins: Story = {
	args: { data: withEmail({ testRecipient: null, adminEmails: ['shawn@example.com', 'madison@example.com'] }) },
}
export const RecipientOverride: Story = {
	args: { data: withEmail({ testRecipient: 'ops@example.com', adminEmails: ['shawn@example.com', 'madison@example.com'] }) },
}
export const NoAdmins: Story = {
	args: { data: withEmail({ testRecipient: null, adminEmails: [] }) },
}
