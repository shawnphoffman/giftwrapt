// import { Title, Subtitle, Description, Primary, Controls, Stories } from '@storybook/addon-docs/blocks'
import '../src/styles.css'
import './storybook.css'

import { withThemeByClassName } from '@storybook/addon-themes'
import type { Decorator, Preview } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { MotionProvider } from '@/components/motion-provider'
import { TooltipProvider } from '@/components/ui/tooltip'

import { __setStorybookSession } from './mocks/auth-client'
import { MockRouterProvider } from './mocks/router'

const queryClient = new QueryClient({
	defaultOptions: {
		queries: { retry: false, staleTime: Infinity },
	},
})

const withProviders: Decorator = (Story, ctx) => {
	__setStorybookSession(ctx.parameters.session ?? null)
	return (
		<QueryClientProvider client={queryClient}>
			<MockRouterProvider>
				<TooltipProvider>
					<MotionProvider>
						<Story />
					</MotionProvider>
				</TooltipProvider>
			</MockRouterProvider>
		</QueryClientProvider>
	)
}

const preview: Preview = {
	parameters: {
		//
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
		options: {
			storySort: {
				order: [
					'Items',
					['Item Gallery', 'Item Playground', 'Item as Buyer', 'Item as Recipient', 'Grouped Items', 'Components', 'Other'],
					'Lists',
					'Pages',
					['Purchases', 'Recent Items', 'Recent Comments'],
					'Common',
					'Utilities',
					'Animations',
				],
			},
		},
		//
		// docs: {
		// 	page: () => (
		// 		<>
		// 			<style>{`
		// 				.docs-story {
		// 					background-color: hsl(var(--background)) !important;
		// 				}
		// 			`}</style>
		// 			<div className="dark ">
		// 				<Title />
		// 				<Subtitle />
		// 				<Description />
		// 				<Primary />
		// 				<Controls />
		// 				<Stories />
		// 			</div>
		// 		</>
		// 	),
		// },
		//
		a11y: {
			// 'todo' - show a11y violations in the test UI only
			// 'error' - fail CI on a11y violations
			// 'off' - skip a11y checks entirely
			test: 'todo',
		},
	},
	decorators: [
		withProviders,
		withThemeByClassName({
			themes: {
				// nameOfTheme: 'classNameForTheme',
				light: '',
				dark: 'dark',
			},
			defaultTheme: 'dark',
		}),
	],
}

export default preview
