import type { Meta, StoryObj } from '@storybook/react-vite'

import { listTypeEnumValues } from '@/db/schema/enums'

import ListTypeIcon from './list-type-icon'

const meta = {
	title: 'Common/Icons/ListTypeIcon',
	component: ListTypeIcon,
	parameters: {
		layout: 'padded',
	},
} satisfies Meta<typeof ListTypeIcon>

export default meta
type Story = StoryObj<typeof meta>

export const AllTypes: Story = {
	args: { type: 'wishlist' },
	render: () => (
		<div className="flex gap-4 items-center">
			{listTypeEnumValues.map(type => (
				<div key={type} className="flex flex-col items-center gap-1 text-xs">
					<ListTypeIcon type={type} className="size-8" />
					<span className="text-muted-foreground">{type}</span>
				</div>
			))}
		</div>
	),
}
