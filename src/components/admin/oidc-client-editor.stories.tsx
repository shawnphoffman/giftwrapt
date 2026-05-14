import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { OidcClientEditor } from './oidc-client-editor'

// Shape mirrors `OidcClientConfigResponse` from `@/api/admin-oidc-client`.
// Keeping it local avoids dragging the server module into stories.
type OidcClientConfig = {
	enabled: boolean
	issuerUrl: string
	authorizationUrl: string
	tokenUrl: string
	userinfoUrl: string
	jwksUrl: string
	logoutUrl: string
	clientId: string
	hasClientSecret: boolean
	scopes: Array<string>
	buttonText: string
	matchExistingUsersBy: 'none' | 'email'
	autoRegister: boolean
}

/**
 * Admin form for the single OIDC sign-in provider. Lives below the Auth
 * + Mobile-app card on /admin/auth.
 *
 * **Save-pattern convention (page-wide):** see the MobileAppEditor story
 * for the rule. Summary: `<Switch>` is reserved for auto-saving toggles;
 * batched controls are checkboxes / inputs.
 *
 * What these stories pin down for this editor specifically:
 *
 * - Every toggle in this card is a `<Checkbox>` (master "OpenID Connect
 *   Authentication" enable, "Link Existing Accounts by Email", and
 *   "Auto Register"). OIDC settings only persist on Save and only take
 *   effect after a server restart.
 * - All form labels render as `text-base` for consistency across the page.
 * - Dirty state surfaces a yellow `<Alert variant="warning">` titled
 *   "Restart Required". The `DirtyShowsRestartAlert` play test toggles
 *   a checkbox and asserts the alert mounts.
 */
const meta = {
	title: 'Admin/OidcClientEditor',
	component: OidcClientEditor,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof OidcClientEditor>

export default meta
type Story = StoryObj<typeof meta>

const baseConfig: OidcClientConfig = {
	enabled: false,
	issuerUrl: '',
	authorizationUrl: '',
	tokenUrl: '',
	userinfoUrl: '',
	jwksUrl: '',
	logoutUrl: '',
	clientId: '',
	hasClientSecret: false,
	scopes: [],
	buttonText: '',
	matchExistingUsersBy: 'none',
	autoRegister: true,
}

function withConfig(config: OidcClientConfig): Decorator {
	return Story => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
		client.setQueryData(['admin', 'oidc-client'], config)
		return (
			<QueryClientProvider client={client}>
				<div className="max-w-xl">
					<Story />
				</div>
			</QueryClientProvider>
		)
	}
}

export const Disabled: Story = {
	decorators: [withConfig({ ...baseConfig })],
	parameters: {
		docs: {
			description: {
				story:
					'Default state. The master "OpenID Connect Authentication" checkbox is off and the rest of the form is dimmed + non-interactive.',
			},
		},
	},
}

export const EnabledClean: Story = {
	decorators: [
		withConfig({
			...baseConfig,
			enabled: true,
			issuerUrl: 'https://auth.example.com',
			clientId: 'giftwrapt',
			hasClientSecret: true,
			scopes: ['openid', 'email', 'profile'],
			buttonText: 'Sign in with Example',
		}),
	],
	parameters: {
		docs: {
			description: {
				story: 'Configured provider in its persisted state. No "Restart Required" alert because nothing is dirty.',
			},
		},
	},
}

export const EnabledLinkByEmail: Story = {
	decorators: [
		withConfig({
			...baseConfig,
			enabled: true,
			issuerUrl: 'https://auth.example.com',
			clientId: 'giftwrapt',
			hasClientSecret: true,
			scopes: ['openid', 'email', 'profile'],
			buttonText: 'Sign in with Example',
			matchExistingUsersBy: 'email',
			autoRegister: false,
		}),
	],
	parameters: {
		docs: {
			description: {
				story:
					'"Link Existing Accounts by Email" toggled on and "Auto Register" toggled off. Useful when a deployment was bootstrapped with email + password and admins now want to swap to OIDC without duplicating users.',
			},
		},
	},
}

export const DirtyShowsRestartAlert: Story = {
	decorators: [
		withConfig({
			...baseConfig,
			enabled: true,
			issuerUrl: 'https://auth.example.com',
			clientId: 'giftwrapt',
			hasClientSecret: true,
			scopes: ['openid', 'email', 'profile'],
			buttonText: 'Sign in with Example',
		}),
	],
	parameters: {
		docs: {
			description: {
				story:
					'Pending change makes the form dirty; the yellow "Restart Required" warning alert appears above the Save button. OIDC providers are loaded once at server boot, so changes only take effect after a restart.',
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		// Flip "Link Existing Accounts by Email" so dirty becomes true and the
		// warning Alert mounts.
		await userEvent.click(canvas.getByLabelText(/Link Existing Accounts by Email/i))
		await waitFor(() => {
			expect(canvas.getByText(/Restart Required/i)).toBeInTheDocument()
			expect(canvas.getByText(/OIDC providers are loaded on boot/i)).toBeInTheDocument()
		})
	},
}
