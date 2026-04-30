import type { Decorator } from '@storybook/react-vite'

export const withPageContainer: Decorator = Story => (
	<div className="flex flex-col items-center flex-1 gap-4 px-0 py-2 sm:px-2 w-full">
		<div className="w-full max-w-3xl border border-dashed border-muted-foreground/40 rounded-lg bg-background/50 p-6">
			<Story />
		</div>
	</div>
)

// Centered boundary for full-page stories. The dashed inner box has a fixed
// min-h/min-w so you can visually verify the page content is centered and
// padded correctly inside a known viewport, regardless of how the page
// itself stretches with `min-h-screen`.
export const withCenteredBoundary: Decorator = Story => (
	<div className="flex items-center justify-center min-h-screen w-full p-12 bg-muted/20">
		<div className="relative w-full min-w-[360px] min-h-[640px] border-2 border-dashed border-muted-foreground/40 rounded-lg overflow-hidden bg-background">
			<Story />
		</div>
	</div>
)
