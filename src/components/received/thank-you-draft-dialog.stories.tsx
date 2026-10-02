import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { ThankYouDraftDialog } from './thank-you-draft-dialog'

/**
 * The thank-you draft opened from a giver's section on the Received page.
 * The note is editable and can only be copied; nothing is sent from here.
 */
const meta = {
	title: 'Received/ThankYouDraftDialog',
	component: ThankYouDraftDialog,
	parameters: { layout: 'padded' },
	args: {
		open: true,
		onOpenChange: fn(),
		giverLabel: 'Kate & Jeff',
		state: {
			phase: 'ready',
			note: 'Dear Kate and Jeff,\n\nThank you so much for the merino scarf and the trail map poster. The scarf is exactly the kind I wanted, and the poster already has a spot picked out on the wall.\n\nWith love,\nSam',
		},
		onNoteChange: fn(),
		onRetry: fn(),
	},
} satisfies Meta<typeof ThankYouDraftDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Ready: Story = {}

export const Writing: Story = { args: { state: { phase: 'loading' } } }

export const Failed: Story = { args: { state: { phase: 'error', message: 'Could not write a draft just now. Try again.' } } }
