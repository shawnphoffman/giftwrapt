import type { Decorator } from '@storybook/react-vite'

/**
 * Centers story content in a bordered, padded frame so it's easy to see the
 * bounding box of each item variation while scanning through stories.
 */
export const withItemFrame: Decorator = Story => (
	<div className="min-h-full w-full flex justify-center p-4">
		<div className="w-full max-w-2xl border border-dashed border-muted-foreground/40 rounded-lg py-4 px-8 bg-background/50">
			<Story />
		</div>
	</div>
)

/**
 * Wider frame for gallery-style stories that show many rows at once.
 */
export const withGalleryFrame: Decorator = Story => (
	<div className="min-h-full w-full flex justify-center p-4">
		<div className="w-full max-w-3xl border border-dashed border-muted-foreground/40 rounded-lg py-4 px-8 bg-background/50">
			<Story />
		</div>
	</div>
)
