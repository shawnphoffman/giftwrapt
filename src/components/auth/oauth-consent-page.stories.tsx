import type { Meta, StoryObj } from '@storybook/react-vite'

import { withCenteredBoundary } from '../../../.storybook/decorators'
import { OAuthConsentPageContent } from './oauth-consent-page'

const meta = {
	title: 'Pages/Auth/OAuth Consent',
	component: OAuthConsentPageContent,
	parameters: { layout: 'fullscreen' },
	decorators: [withCenteredBoundary],
	args: {
		client: { clientId: 'abc', name: 'Acme Tasks', icon: null },
		scopes: ['openid', 'profile', 'email'],
		onApprove: async () => {},
		onDeny: async () => {},
		signInHref: '/',
	},
} satisfies Meta<typeof OAuthConsentPageContent>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithIcon: Story = {
	args: { client: { clientId: 'abc', name: 'Acme Tasks', icon: 'https://cdn.example.com/icon.png' } },
}

export const OnlyOpenId: Story = {
	args: { scopes: ['openid'] },
}

export const NoScopes: Story = {
	args: { scopes: [] },
}

export const OfflineAccess: Story = {
	args: { scopes: ['openid', 'profile', 'email', 'offline_access', 'tasks:read'] },
}

export const UnknownClient: Story = {
	args: { client: null, scopes: [] },
}

export const Loading: Story = {
	args: { forceLoading: true },
}

export const PriorError: Story = {
	args: { initialError: 'Something went wrong. Try again.' },
}
