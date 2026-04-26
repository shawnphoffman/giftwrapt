import type { Meta, StoryObj } from '@storybook/react-vite'

import { AVATAR_COLORS } from '@/lib/avatar-color'
import { cn } from '@/lib/utils'

import { Avatar, AvatarFallback } from '../ui/avatar'
import UserAvatar from './user-avatar'

const meta = {
	title: 'Common/UserAvatar',
	component: UserAvatar,
	parameters: {
		layout: 'padded',
	},
	args: {
		name: 'Jamie Friend',
	},
} satisfies Meta<typeof UserAvatar>

export default meta
type Story = StoryObj<typeof meta>

export const AllSizes: Story = {
	render: args => (
		<div className="flex items-end gap-4">
			<UserAvatar {...args} size="small" />
			<UserAvatar {...args} size="medium" />
			<UserAvatar {...args} size="large" />
			<UserAvatar {...args} size="huge" />
		</div>
	),
}

export const WithImage: Story = {
	args: {
		size: 'large',
		image: 'https://i.pravatar.cc/128?img=12',
	},
}

export const AllColors: Story = {
	render: () => (
		<div className="grid grid-cols-6 gap-4">
			{AVATAR_COLORS.map((bgClass, i) => {
				const label = bgClass.split(' ')[0].replace('bg-', '')
				return (
					<div key={bgClass} className="flex flex-col items-center gap-2">
						<Avatar className="size-18">
							<AvatarFallback className={cn('font-bold text-white leading-none text-4xl', bgClass)}>
								{String.fromCharCode(65 + i)}
							</AvatarFallback>
						</Avatar>
						<span className="text-xs">{label}</span>
					</div>
				)
			})}
		</div>
	),
}

export const ColorVariety: Story = {
	render: () => {
		const names = [
			'Jamie Friend',
			'Avery Stone',
			'Morgan Lee',
			'Riley Park',
			'Casey Quinn',
			'Sam Rivera',
			'Devon Kim',
			'Jordan Blake',
			'Taylor West',
			'Reese Holt',
			'Skyler Day',
			'Quinn Vega',
		]
		return (
			<div className="grid grid-cols-6 gap-4">
				{names.map(n => (
					<div key={n} className="flex flex-col items-center gap-2">
						<UserAvatar name={n} size="large" />
						<span className="text-xs">{n}</span>
					</div>
				))}
			</div>
		)
	},
}
