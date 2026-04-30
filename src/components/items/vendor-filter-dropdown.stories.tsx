import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import { VendorFilterDropdown, type VendorOption } from './vendor-filter-dropdown'

type Args = {
	options: ReadonlyArray<VendorOption>
	initialSelected?: ReadonlyArray<string>
}

function Harness({ options, initialSelected = [] }: Args) {
	const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(initialSelected))
	const toggle = (id: string) =>
		setSelected(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	return (
		<div className="flex justify-end p-4">
			<VendorFilterDropdown options={options} selected={selected} onToggle={toggle} onClear={() => setSelected(new Set())} />
		</div>
	)
}

const meta: Meta<typeof Harness> = {
	title: 'Items/VendorFilterDropdown',
	component: Harness,
	parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj<typeof Harness>

const knownAndUnknown: Array<VendorOption> = [
	{ id: 'amazon', name: 'Amazon', count: 12, isKnown: true },
	{ id: 'walmart', name: 'Walmart', count: 4, isKnown: true },
	{ id: 'etsy', name: 'Etsy', count: 1, isKnown: true },
	{ id: 'rei.com', name: 'rei.com', count: 6, isKnown: false },
	{ id: 'thewarmingstore.com', name: 'thewarmingstore.com', count: 2, isKnown: false },
	{ id: 'skida.com', name: 'skida.com', count: 1, isKnown: false },
	{ id: '__no_link__', name: 'No link', count: 3, isKnown: false },
]

export const Default: Story = {
	args: { options: knownAndUnknown },
	parameters: {
		docs: {
			description: {
				story:
					'Mix of known and unknown vendors. Known group at the top (with All vendors), unknown below the separator. Each section sorted by count descending.',
			},
		},
	},
}

export const OnlyKnown: Story = {
	args: {
		options: [
			{ id: 'amazon', name: 'Amazon', count: 9, isKnown: true },
			{ id: 'target', name: 'Target', count: 5, isKnown: true },
			{ id: 'bestbuy', name: 'Best Buy', count: 2, isKnown: true },
		],
	},
	parameters: {
		docs: {
			description: { story: 'No unknown vendors: separator and second section are omitted.' },
		},
	},
}

export const OnlyUnknown: Story = {
	args: {
		options: [
			{ id: 'biglowwoodcraft.com', name: 'biglowwoodcraft.com', count: 4, isKnown: false },
			{ id: 'kikkerland.com', name: 'kikkerland.com', count: 2, isKnown: false },
			{ id: 'tribelacrosse.com', name: 'tribelacrosse.com', count: 1, isKnown: false },
			{ id: '__no_link__', name: 'No link', count: 1, isKnown: false },
		],
	},
	parameters: {
		docs: {
			description: { story: 'Only unknown vendors. The known section just shows All vendors, then a separator and the unknowns.' },
		},
	},
}

export const SingleSelected: Story = {
	args: { options: knownAndUnknown, initialSelected: ['amazon'] },
	parameters: {
		docs: { description: { story: 'Trigger label and check mark reflect a single selected vendor.' } },
	},
}

export const MultipleSelected: Story = {
	args: { options: knownAndUnknown, initialSelected: ['amazon', 'rei.com', '__no_link__'] },
	parameters: {
		docs: { description: { story: 'Trigger label collapses to "N vendors" once more than one is selected.' } },
	},
}

export const TiesBreakAlphabetically: Story = {
	args: {
		options: [
			{ id: 'amazon', name: 'Amazon', count: 3, isKnown: true },
			{ id: 'target', name: 'Target', count: 3, isKnown: true },
			{ id: 'walmart', name: 'Walmart', count: 3, isKnown: true },
			{ id: 'a.example.com', name: 'a.example.com', count: 2, isKnown: false },
			{ id: 'b.example.com', name: 'b.example.com', count: 2, isKnown: false },
		],
	},
	parameters: {
		docs: { description: { story: 'When counts tie, entries fall back to alphabetical order within their section.' } },
	},
}

export const ManyVendors: Story = {
	args: {
		options: [
			{ id: 'amazon', name: 'Amazon', count: 47, isKnown: true },
			{ id: 'target', name: 'Target', count: 21, isKnown: true },
			{ id: 'walmart', name: 'Walmart', count: 18, isKnown: true },
			{ id: 'etsy', name: 'Etsy', count: 14, isKnown: true },
			{ id: 'bestbuy', name: 'Best Buy', count: 9, isKnown: true },
			{ id: 'apple', name: 'Apple', count: 7, isKnown: true },
			{ id: 'nike', name: 'Nike', count: 5, isKnown: true },
			{ id: 'adidas', name: 'Adidas', count: 5, isKnown: true },
			{ id: 'jcrew', name: 'J.Crew', count: 4, isKnown: true },
			{ id: 'loft', name: 'Loft', count: 3, isKnown: true },
			{ id: 'ebay', name: 'eBay', count: 3, isKnown: true },
			{ id: 'google', name: 'Google', count: 2, isKnown: true },
			{ id: 'microsoft', name: 'Microsoft', count: 2, isKnown: true },
			{ id: 'facebook', name: 'Facebook', count: 1, isKnown: true },
			{ id: 'shopify', name: 'Shopify', count: 1, isKnown: true },
			{ id: 'rei.com', name: 'rei.com', count: 12, isKnown: false },
			{ id: 'costco.com', name: 'costco.com', count: 8, isKnown: false },
			{ id: 'thewarmingstore.com', name: 'thewarmingstore.com', count: 6, isKnown: false },
			{ id: 'biglowwoodcraft.com', name: 'biglowwoodcraft.com', count: 5, isKnown: false },
			{ id: 'enlightenedequipment.com', name: 'enlightenedequipment.com', count: 5, isKnown: false },
			{ id: 'litesmith.com', name: 'litesmith.com', count: 4, isKnown: false },
			{ id: 'materialkitchen.com', name: 'materialkitchen.com', count: 4, isKnown: false },
			{ id: 'myparallelle.com', name: 'myparallelle.com', count: 3, isKnown: false },
			{ id: 'saksoff5th.com', name: 'saksoff5th.com', count: 3, isKnown: false },
			{ id: 'salesforce-sites.com', name: 'salesforce-sites.com', count: 3, isKnown: false },
			{ id: 'skida.com', name: 'skida.com', count: 2, isKnown: false },
			{ id: 'tacobell.com', name: 'tacobell.com', count: 2, isKnown: false },
			{ id: 'thriftbooks.com', name: 'thriftbooks.com', count: 2, isKnown: false },
			{ id: 'tribelacrosse.com', name: 'tribelacrosse.com', count: 2, isKnown: false },
			{ id: 'webersresupply.com', name: 'webersresupply.com', count: 1, isKnown: false },
			{ id: 'willmcphail.com', name: 'willmcphail.com', count: 1, isKnown: false },
			{ id: 'kikkerland.com', name: 'kikkerland.com', count: 1, isKnown: false },
			{ id: 'boho-magic.com', name: 'boho-magic.com', count: 1, isKnown: false },
			{ id: '__no_link__', name: 'No link', count: 4, isKnown: false },
		],
	},
	parameters: {
		docs: {
			description: {
				story: 'Stress case: many known + many unknown vendors. Menu scrolls vertically to keep the list usable.',
			},
		},
	},
}
