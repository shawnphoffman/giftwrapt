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

export const LongTitlesAndUrls: Story = {
	render: () => (
		<Wrapper
			initial={[
				{
					title: 'Giant Slinkie Coil Spring Toys For Kids - 6" Jumbo Rainbow Slinkie for Gift, Big Novelty Spring Toy',
					url: 'https://www.amazon.com/dp/B07H9C6PT5/?coliid=I10LCZ9UE9UNFL&colid=3EBYHP2FOCGSV&psc=1&ref_=lv_ov_lig_dp_it',
					imageUrl: null,
				},
				{
					title: 'Just Play The Original Slinky Walking Spring Toy, 2.75-inch Diameter Metal Slinky, Fidget Toys for Kids',
					url: 'https://www.amazon.com/dp/B0DR96C5YD/?coliid=I2CCYM16ELB8J3&colid=3EBYHP2FOCGSV&psc=1&ref_=lv_ov_lig_dp_it',
					imageUrl: null,
				},
				{
					title: null,
					url: 'https://www.amazon.com/dp/B0GGQSC7HX/?coliid=I2OEKSJHHJ12FA&colid=3EBYHP2FOCGSV&psc=1&ref_=lv_ov_lig_dp_it',
					imageUrl: null,
				},
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
