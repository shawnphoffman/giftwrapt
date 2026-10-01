import type { Meta, StoryObj } from '@storybook/react-vite'

import { withCenteredBoundary } from '../../../.storybook/decorators'
import { OAuthConsentCard } from './oauth-consent-card'

/**
 * The OAuth consent screen for MCP clients. The better-auth `mcp()` plugin
 * redirects here after a signed-in user starts connecting an AI assistant;
 * core forces this step on every authorize request (the plugin would
 * otherwise hand out a code without asking). Allow / Deny post to
 * `/api/auth/oauth2/consent`, then the browser follows the client's
 * redirect URI.
 */
const meta = {
	title: 'Pages/Auth/OAuth Consent',
	component: OAuthConsentCard,
	parameters: { layout: 'fullscreen' },
	decorators: [withCenteredBoundary],
	args: {
		state: 'ready',
		clientName: 'Claude',
		accountEmail: 'shawn@example.com',
		// `false` keeps the buttons usable in the story; the real page
		// returns `true` and leaves them disabled while the browser navigates.
		onDecision: (): Promise<boolean> => Promise.resolve(false),
	},
} satisfies Meta<typeof OAuthConsentCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const UnknownClientName: Story = {
	args: { clientName: null },
	parameters: { docs: { description: { story: 'A client that registered without a display name falls back to "An AI assistant".' } } },
}

export const Loading: Story = {
	args: { state: 'loading' },
}

export const ExpiredCode: Story = {
	args: { state: 'expired' },
	parameters: {
		docs: { description: { story: 'The consent code lives 10 minutes and is single-use. Reached by a stale tab or a replayed link.' } },
	},
}

export const FeatureDisabled: Story = {
	args: { state: 'disabled' },
	parameters: { docs: { description: { story: 'Shown when the admin `enableMcp` switch is off, so a mid-flow toggle ends cleanly.' } } },
}

export const Declined: Story = {
	args: { state: 'declined' },
}

export const WithError: Story = {
	args: { error: 'Something went wrong talking to the server. Try again.' },
}

export const HandingOff: Story = {
	args: { onDecision: () => new Promise(() => {}) },
	parameters: {
		docs: {
			description: {
				story: 'After Allow the buttons stay disabled while the browser follows the client redirect; click Allow to see it.',
			},
		},
	},
}
