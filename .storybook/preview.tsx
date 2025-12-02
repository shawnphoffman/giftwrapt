import type { Preview } from '@storybook/react-vite'
import { withThemeByClassName } from '@storybook/addon-themes'
// import { Title, Subtitle, Description, Primary, Controls, Stories } from '@storybook/addon-docs/blocks'

import '../src/styles.css'
import './storybook.css'

const preview: Preview = {
	parameters: {
		//
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
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
