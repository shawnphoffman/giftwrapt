import type { Meta, StoryObj } from '@storybook/react-vite'

import DependentAvatar from './dependent-avatar'

const meta = {
	title: 'Common/DependentAvatar',
	component: DependentAvatar,
	parameters: {
		layout: 'padded',
	},
	args: {
		name: 'Mochi',
	},
} satisfies Meta<typeof DependentAvatar>

export default meta
type Story = StoryObj<typeof meta>

export const AllSizes: Story = {
	render: args => (
		<div className="flex items-end gap-4">
			<DependentAvatar {...args} size="small" />
			<DependentAvatar {...args} size="medium" />
			<DependentAvatar {...args} size="large" />
			<DependentAvatar {...args} size="huge" />
		</div>
	),
}

// Sprout fallback applies the same way regardless of name. Babies and
// pets read identical, by design - one icon for every dependent.
export const NeutralAcrossKinds: Story = {
	render: () => (
		<div className="grid grid-cols-3 gap-6">
			{[{ name: 'Mochi (cat)' }, { name: 'Peanut (baby)' }, { name: 'Maple (dog)' }].map(d => (
				<div key={d.name} className="flex flex-col items-center gap-2">
					<DependentAvatar name={d.name} size="large" />
					<span className="text-xs">{d.name}</span>
				</div>
			))}
		</div>
	),
}

export const WithImage: Story = {
	args: {
		size: 'large',
		image: 'https://i.pravatar.cc/128?img=64',
	},
}
