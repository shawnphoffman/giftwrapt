import type { Meta, StoryObj } from '@storybook/react-vite'

import { listTypeEnumValues } from '@/db/schema/enums'

import ListTypeTile from './list-type-tile'

const meta = {
	title: 'Common/Icons/ListTypeTile',
	component: ListTypeTile,
	parameters: {
		layout: 'padded',
	},
} satisfies Meta<typeof ListTypeTile>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Page-heading variant of the list-type icon: a colored bg square with the
 * type glyph in white. Used in the list detail and list edit page headers
 * so they match the pattern shared by every other top-level page.
 */
export const AllTypes: Story = {
	args: { type: 'wishlist' },
	render: () => (
		<div className="flex flex-wrap gap-4 items-start">
			{listTypeEnumValues.map(type => (
				<div key={type} className="flex flex-col items-center gap-2">
					<ListTypeTile type={type} />
					<span className="text-xs text-muted-foreground">{type}</span>
				</div>
			))}
		</div>
	),
}

export const Wishlist: Story = { args: { type: 'wishlist' } }
export const Christmas: Story = { args: { type: 'christmas' } }
export const Birthday: Story = { args: { type: 'birthday' } }
export const GiftIdeas: Story = { args: { type: 'giftideas' } }
