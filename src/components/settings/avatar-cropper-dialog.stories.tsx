import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import { AvatarCropperDialog } from './avatar-cropper-dialog'

// Inline SVG so the cropper has a real image with explicit natural
// dimensions without depending on a network host. The face circle gives
// a visible focal point so the pan/zoom interactions read naturally.
const SAMPLE_LANDSCAPE = `data:image/svg+xml,${encodeURIComponent(
	[
		'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600">',
		'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
		'<stop offset="0" stop-color="#0ea5e9"/>',
		'<stop offset="1" stop-color="#a855f7"/>',
		'</linearGradient></defs>',
		'<rect width="100%" height="100%" fill="url(#g)"/>',
		'<circle cx="800" cy="300" r="180" fill="white" opacity="0.55"/>',
		'<text x="800" y="320" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="64" fill="#1e293b">1200×600</text>',
		'</svg>',
	].join('')
)}`

const SAMPLE_PORTRAIT = `data:image/svg+xml,${encodeURIComponent(
	[
		'<svg xmlns="http://www.w3.org/2000/svg" width="500" height="900" viewBox="0 0 500 900">',
		'<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">',
		'<stop offset="0" stop-color="#f59e0b"/>',
		'<stop offset="1" stop-color="#ef4444"/>',
		'</linearGradient></defs>',
		'<rect width="100%" height="100%" fill="url(#g)"/>',
		'<circle cx="250" cy="320" r="120" fill="white" opacity="0.6"/>',
		'<text x="250" y="340" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="48" fill="#1e293b">500×900</text>',
		'</svg>',
	].join('')
)}`

function CropperHarness({ imageSrc, simulateError }: { imageSrc: string | null; simulateError?: boolean }) {
	const [open, setOpen] = useState(true)
	const onCropped = async (_file: File) => {
		if (simulateError) {
			// Simulate a server error keeping the dialog open so the user can retry.
			await new Promise(resolve => setTimeout(resolve, 600))
			throw new Error('Simulated server failure')
		}
		await new Promise(resolve => setTimeout(resolve, 400))
		setOpen(false)
	}
	return <AvatarCropperDialog open={open} onOpenChange={setOpen} imageSrc={imageSrc} fileName="sample.png" onCropped={onCropped} />
}

const meta = {
	title: 'Settings/AvatarCropperDialog',
	component: CropperHarness,
	parameters: { layout: 'centered' },
} satisfies Meta<typeof CropperHarness>

export default meta
type Story = StoryObj<typeof meta>

// Wide image: the cropper should letterbox horizontally so the user can
// pan side-to-side to pick which slice the circle frames.
export const Landscape: Story = {
	args: { imageSrc: SAMPLE_LANDSCAPE },
}

// Tall image: the symmetric case — vertical pan should be available
// while horizontal pan is locked at the cover bound.
export const Portrait: Story = {
	args: { imageSrc: SAMPLE_PORTRAIT },
}

// Broken image src: the dialog should show its "couldn't preview"
// fallback instead of a spinner that never resolves.
export const LoadError: Story = {
	args: { imageSrc: 'data:image/png;base64,not-a-real-image' },
}
