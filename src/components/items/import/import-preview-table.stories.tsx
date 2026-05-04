import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import type { ItemDraft } from '@/api/import'

import { ImportPreviewTable } from './import-preview-table'

const meta = {
	title: 'Items/Components/ImportPreviewTable',
	component: ImportPreviewTable,
	parameters: { layout: 'padded' },
	args: {
		drafts: [],
		onChange: () => {},
		onSubmit: () => {},
		onCancel: () => {},
		submitting: false,
		selected: new Set<number>(),
		onSelectedChange: () => {},
	},
} satisfies Meta<typeof ImportPreviewTable>

export default meta
type Story = StoryObj<typeof meta>

function Wrapper({ initial }: { initial: Array<ItemDraft> }) {
	const [drafts, setDrafts] = useState<Array<ItemDraft>>(initial)
	const [selected, setSelected] = useState<Set<number>>(new Set())
	return (
		<div className="max-w-2xl">
			<ImportPreviewTable
				drafts={drafts}
				onChange={setDrafts}
				onSubmit={() => {}}
				onCancel={() => {}}
				submitting={false}
				selected={selected}
				onSelectedChange={setSelected}
			/>
		</div>
	)
}

export const Empty: Story = {
	render: () => <Wrapper initial={[]} />,
}

export const FiveItems: Story = {
	render: () => (
		<Wrapper
			initial={[
				{ title: 'Bluetooth headphones', url: 'https://example.com/headphones', imageUrl: null },
				{ title: 'Coffee grinder', url: 'https://example.com/grinder', imageUrl: null },
				// URL-only row: surfaces the queued badge.
				{ title: null, url: 'https://shop.example.com/product/123', imageUrl: null },
				{ title: 'Gardening gloves', url: null, imageUrl: null },
				{ title: 'Plain notebook', url: null, imageUrl: null },
			]}
		/>
	),
}

export const FiftyItems: Story = {
	render: () => (
		<Wrapper
			initial={Array.from({ length: 50 }, (_, i) => ({
				title: i % 3 === 0 ? null : `Imported item ${i + 1}`,
				url: `https://example.com/item/${i + 1}`,
				imageUrl: null,
			}))}
		/>
	),
}
