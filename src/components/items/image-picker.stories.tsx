import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import { ImagePicker } from './image-picker'

/**
 * Image candidate picker shown next to the URL field after a scrape. When
 * the scrape filter leaves more than one viable image we render thumbnails
 * so the user can swap the auto-selected default. Renders nothing when the
 * candidate list has 0 or 1 image (those cases are handled silently by
 * the parent form).
 */
const meta = {
	title: 'Items/Image Picker',
	component: ImagePicker,
	parameters: { layout: 'padded' },
	args: {
		onChange: () => undefined,
	},
	argTypes: {
		onChange: { action: 'changed' },
	},
} satisfies Meta<typeof ImagePicker>

export default meta
type Story = StoryObj<typeof meta>

const sampleImages = [
	'https://picsum.photos/seed/widget-1/200',
	'https://picsum.photos/seed/widget-2/200',
	'https://picsum.photos/seed/widget-3/200',
	'https://picsum.photos/seed/widget-4/200',
]

// Tiny stateful wrapper so the click-to-swap interaction works in the
// docs page; production usage is fully controlled via props.
function Interactive({ initial, images }: { initial: string; images: ReadonlyArray<string> }) {
	const [value, setValue] = useState(initial)
	return <ImagePicker images={images} value={value} onChange={setValue} />
}

export const SingleImage: Story = {
	args: {
		images: [sampleImages[0]],
		value: sampleImages[0],
	},
	parameters: {
		docs: {
			description: {
				story: 'Only one candidate survives filtering. The picker renders nothing - the parent uses the single image directly.',
			},
		},
	},
}

export const TwoImages: Story = {
	args: {
		images: sampleImages.slice(0, 2),
		value: sampleImages[0],
	},
	render: (_args: { images: ReadonlyArray<string>; value: string }) => (
		<Interactive initial={sampleImages[0]} images={sampleImages.slice(0, 2)} />
	),
}

export const FourImages: Story = {
	args: {
		images: sampleImages,
		value: sampleImages[0],
	},
	render: () => <Interactive initial={sampleImages[0]} images={sampleImages} />,
}

export const NonFirstSelected: Story = {
	args: {
		images: sampleImages,
		value: sampleImages[2],
	},
	parameters: {
		docs: { description: { story: 'The third image is the active selection. Useful for showing the highlight ring.' } },
	},
}

export const Empty: Story = {
	args: {
		images: [],
		value: '',
	},
	parameters: {
		docs: { description: { story: 'No candidates at all (entire list got filtered out). The picker renders nothing.' } },
	},
}

export const Disabled: Story = {
	args: {
		images: sampleImages,
		value: sampleImages[0],
		disabled: true,
	},
}
