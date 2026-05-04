import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import { Button } from '@/components/ui/button'

import { ImportDialogAmazon } from './import-dialog-amazon'

const meta = {
	title: 'Items/Components/ImportDialogAmazon',
	component: ImportDialogAmazon,
	parameters: { layout: 'padded' },
	args: {
		listId: 1,
		open: true,
		onOpenChange: () => {},
	},
} satisfies Meta<typeof ImportDialogAmazon>

export default meta
type Story = StoryObj<typeof meta>

export const Closed: Story = {
	args: { open: false },
	render: () => {
		const [open, setOpen] = useState(false)
		return (
			<>
				<Button onClick={() => setOpen(true)}>Open dialog</Button>
				<ImportDialogAmazon listId={1} open={open} onOpenChange={setOpen} />
			</>
		)
	},
}

export const UrlStep: Story = {
	args: { open: true },
}
