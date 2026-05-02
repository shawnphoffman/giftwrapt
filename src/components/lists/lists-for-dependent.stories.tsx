import type { Meta, StoryObj } from '@storybook/react-vite'

import type { DependentWithLists } from '@/db-collections/lists'

import ListsForDependent from './lists-for-dependent'

const baseDependent: DependentWithLists = {
	id: 'dep-mochi',
	name: 'Mochi',
	image: null,
	birthMonth: 'march',
	birthDay: 12,
	guardianIds: ['user-alice', 'user-bob'],
	lastGiftedAt: null,
	lists: [
		{
			id: 1,
			name: "Mochi's Wishlist",
			type: 'wishlist',
			description: null,
			isPrimary: true,
			createdAt: '2026-01-01T00:00:00Z',
			updatedAt: '2026-01-01T00:00:00Z',
			itemsTotal: 4,
			itemsRemaining: 4,
		},
		{
			id: 2,
			name: 'Christmas 2026',
			type: 'christmas',
			description: null,
			isPrimary: false,
			createdAt: '2026-01-01T00:00:00Z',
			updatedAt: '2026-01-01T00:00:00Z',
			itemsTotal: 6,
			itemsRemaining: 2,
		},
	],
}

const meta = {
	title: 'Lists/ListsForDependent',
	component: ListsForDependent,
	parameters: {
		layout: 'padded',
	},
	decorators: [
		Story => (
			<div className="max-w-lg">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof ListsForDependent>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
	args: { dependent: baseDependent },
}

// Sprout fallback regardless of name - babies and pets read identical
// in the public feed by design.
export const BabyVsPet: Story = {
	args: { dependent: baseDependent },
	render: () => (
		<div className="grid grid-cols-1 gap-4">
			<ListsForDependent dependent={{ ...baseDependent, name: 'Mochi (cat)' }} />
			<ListsForDependent dependent={{ ...baseDependent, id: 'dep-peanut', name: 'Peanut (baby)' }} />
		</div>
	),
}

export const NoBirthday: Story = {
	args: {
		dependent: { ...baseDependent, birthMonth: null, birthDay: null },
	},
}

export const WithImage: Story = {
	args: {
		dependent: { ...baseDependent, image: 'https://i.pravatar.cc/128?img=64' },
	},
}

export const SingleList: Story = {
	args: {
		dependent: { ...baseDependent, lists: [baseDependent.lists[0]] },
	},
}

export const NoLists: Story = {
	args: {
		dependent: { ...baseDependent, name: 'New Dependent', lists: [] },
	},
}
