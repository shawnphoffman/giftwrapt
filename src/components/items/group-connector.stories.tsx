import type { Meta, StoryObj } from '@storybook/react-vite'
import { Fragment } from 'react'

import type { GroupType } from '@/db/schema/enums'

import { GroupConnector } from './group-connector'

/**
 * Small pill between items of the same group. OR for pick-one groups, a down
 * arrow for ordered groups. Rendered with h-0 so the pill overlaps the
 * boundary between rows instead of occupying its own vertical slot.
 */

type StoryArgs = {
	type: GroupType
	rows: number
}

const meta: Meta<StoryArgs> = {
	title: 'Items/Components/GroupConnector',
	component: GroupConnector,
	parameters: { layout: 'padded' },
	argTypes: {
		type: {
			control: 'inline-radio',
			options: ['or', 'order'] satisfies Array<StoryArgs['type']>,
		},
		rows: { control: { type: 'number', min: 1, max: 10, step: 1 } },
	},
	args: { type: 'or', rows: 3 },
	render: ({ type, rows }) => (
		<div className="max-w-sm">
			{Array.from({ length: rows }, (_, index) => (
				<Fragment key={index}>
					{index > 0 && <GroupConnector type={type} />}
					<div className="p-3 border rounded bg-muted/40">Item {index + 1}</div>
				</Fragment>
			))}
		</div>
	),
}

export default meta
type Story = StoryObj<StoryArgs>

export const PickOne: Story = {
	args: { type: 'or' },
}

export const Ordered: Story = {
	args: { type: 'order' },
}
