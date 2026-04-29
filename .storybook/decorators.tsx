import type { Decorator } from '@storybook/react-vite'

export const withPageContainer: Decorator = Story => (
	<div className="flex flex-col items-center flex-1 gap-4 px-0 py-2 sm:px-2 w-full">
		<div className="w-full max-w-3xl border border-dashed border-muted-foreground/40 rounded-lg bg-background/50 p-6">
			<Story />
		</div>
	</div>
)
