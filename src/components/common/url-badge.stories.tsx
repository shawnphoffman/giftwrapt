import type { Meta, StoryObj } from '@storybook/react-vite'

import UrlBadge from './url-badge'

const meta = {
	title: 'Common/Badges/UrlBadge',
	component: UrlBadge,
	parameters: { layout: 'centered' },
} satisfies Meta<typeof UrlBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Amazon: Story = {
	args: { url: 'https://www.amazon.com/dp/B0863TXGM3' },
}

export const Etsy: Story = {
	args: { url: 'https://www.etsy.com/listing/12345/handmade-mug' },
}

export const LongDomain: Story = {
	args: { url: 'https://www.bluebottlecoffee.com/us/eng/subscriptions/whole-bean-blend' },
}

export const Subdomain: Story = {
	args: { url: 'https://shop.something.co.uk/path/to/product?ref=123' },
}

export const NullUrl: Story = {
	args: { url: null },
	parameters: { docs: { description: { story: 'Renders nothing when url is null.' } } },
}

export const Constrained: Story = {
	args: { url: 'https://www.bluebottlecoffee.com/us/eng/subscriptions/whole-bean-blend' },
	render: args => (
		<div className="w-40 border border-dashed border-muted-foreground/40 rounded p-2">
			<UrlBadge {...args} />
		</div>
	),
	parameters: { docs: { description: { story: 'Domain truncates inside narrow containers (max-w-[40%] cap kicks in).' } } },
}
