import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { MobileAppEditor } from './mobile-app-editor'

type MobileAppConfig = { redirectUris: Array<string> }

/**
 * Admin form for the mobile-app redirect-URI whitelist. Lives inside the
 * /admin/auth page (below the passkey toggle, separated by a divider) and
 * gates BOTH passkey and OIDC sign-in from the mobile API.
 *
 * **Save-pattern convention (page-wide):**
 *
 * - `<Switch>` ALWAYS auto-saves. Any change fires the mutation and emits
 *   a `'Setting updated'` sonner toast on success. The "Enable Passkeys"
 *   toggle on /admin/auth is the canonical example.
 * - Batched forms (this one, plus OIDC) use textareas / inputs /
 *   `<Checkbox>`. They only persist on Save. This avoids a class of bug
 *   where users flip a switch and don't realise the change wasn't saved.
 *
 * Don't introduce a batched Switch.
 */
const meta = {
	title: 'Admin/MobileAppEditor',
	component: MobileAppEditor,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof MobileAppEditor>

export default meta
type Story = StoryObj<typeof meta>

function withConfig(config: MobileAppConfig): Decorator {
	return Story => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
		client.setQueryData(['admin', 'mobile-app'], config)
		return (
			<QueryClientProvider client={client}>
				<div className="max-w-xl">
					<Story />
				</div>
			</QueryClientProvider>
		)
	}
}

export const Default: Story = {
	decorators: [withConfig({ redirectUris: ['wishlists://oauth'] })],
	parameters: {
		docs: {
			description: {
				story:
					'Fresh deployment: the canonical iOS app scheme `wishlists://oauth` is the default. Empty list disables passkey + OIDC on mobile.',
			},
		},
	},
}

export const MultipleSchemes: Story = {
	decorators: [withConfig({ redirectUris: ['wishlists://oauth', 'wishlists-staging://oauth', 'custom-fork://oauth'] })],
	parameters: {
		docs: { description: { story: 'A forked / staging build that ships an additional URL scheme alongside the canonical one.' } },
	},
}

export const EmptyList: Story = {
	decorators: [withConfig({ redirectUris: [] })],
	parameters: {
		docs: {
			description: {
				story: 'Admin deliberately cleared the list. Passkey + OIDC from the iOS app are disabled until at least one scheme is added.',
			},
		},
	},
}
