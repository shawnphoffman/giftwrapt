import type { Meta, StoryObj } from '@storybook/react-vite'

import { priorityEnumValues } from '@/db/schema/enums'

import PriorityIcon from './priority-icon'

const meta = {
	title: 'Common/PriorityIcon',
	component: PriorityIcon,
	parameters: {
		layout: 'padded',
	},
} satisfies Meta<typeof PriorityIcon>

export default meta
type Story = StoryObj<typeof meta>

export const AllPriorities: Story = {
	args: { priority: 'normal' },
	render: () => (
		<div className="flex gap-6 items-center">
			{priorityEnumValues.map(priority => (
				<div key={priority} className="flex flex-col items-center gap-1 text-xs w-16">
					<div className="h-5 flex items-center">
						<PriorityIcon priority={priority} />
					</div>
					<span className="text-muted-foreground">{priority}</span>
				</div>
			))}
		</div>
	),
}
