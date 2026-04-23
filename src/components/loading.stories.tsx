import type { Meta, StoryObj } from '@storybook/react-vite'

import Loading from './loading'

const meta = {
	title: 'Components/Loading',
	component: Loading,
	parameters: {
		layout: 'padded',
	},
} satisfies Meta<typeof Loading>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const PrimaryColor: Story = {
	args: { className: 'text-primary' },
}

export const FullScreen: Story = {
	parameters: { layout: 'fullscreen' },
	render: args => (
		<div className="flex items-center justify-center w-full min-h-screen">
			<Loading {...args} />
		</div>
	),
}

export const ContentArea: Story = {
	parameters: { layout: 'fullscreen' },
	render: args => (
		<div className="flex flex-col items-center min-h-screen">
			<div className="flex items-center justify-center flex-1 w-full">
				<Loading {...args} />
			</div>
		</div>
	),
}
