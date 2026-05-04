import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import { Button } from '@/components/ui/button'

import { ImportDialogAppleNotes } from './import-dialog-apple-notes'

const meta = {
	title: 'Items/Components/ImportDialogAppleNotes',
	component: ImportDialogAppleNotes,
	parameters: { layout: 'padded' },
	args: {
		listId: 1,
		open: true,
		onOpenChange: () => {},
	},
} satisfies Meta<typeof ImportDialogAppleNotes>

export default meta
type Story = StoryObj<typeof meta>

export const Closed: Story = {
	args: { open: false },
	render: () => {
		const [open, setOpen] = useState(false)
		return (
			<>
				<Button onClick={() => setOpen(true)}>Open dialog</Button>
				<ImportDialogAppleNotes listId={1} open={open} onOpenChange={setOpen} />
			</>
		)
	},
}

export const InputStep: Story = {
	args: { open: true },
}
