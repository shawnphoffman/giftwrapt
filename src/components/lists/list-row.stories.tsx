import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import type { MyListRow as MyListRowType } from '@/api/lists'
import { listTypeEnumValues } from '@/db/schema/enums'
import type { UserWithLists } from '@/db-collections/lists'

import { ListRow } from './list-row'

type GifterList = UserWithLists['lists'][number]
type ListRowProps = ComponentProps<typeof ListRow>

const recipientBase: MyListRowType = {
	id: 1,
	name: 'My Wish List',
	type: 'wishlist',
	isActive: true,
	isPrivate: false,
	isPrimary: false,
	description: null,
	giftIdeasTargetUserId: null,
	giftIdeasTarget: null,
	itemCount: 12,
}

const gifterBase: GifterList = {
	id: 1,
	name: 'Their Wish List',
	type: 'wishlist',
	description: null,
	isPrimary: false,
	createdAt: '2026-01-01T00:00:00Z',
	updatedAt: '2026-01-01T00:00:00Z',
	itemsTotal: 10,
	itemsRemaining: 6,
}

const meta: Meta<ListRowProps> = {
	title: 'Lists/ListRow',
	component: ListRow,
	parameters: { layout: 'padded' },
	decorators: [
		Story => (
			<div className="max-w-xl border rounded-md bg-accent p-2">
				<Story />
			</div>
		),
	],
}

export default meta
type Story = StoryObj<ListRowProps>

export const RecipientDefault: Story = {
	args: { role: 'recipient', list: recipientBase },
	play: async ({ canvasElement, args }: { canvasElement: HTMLElement; args: ListRowProps }) => {
		const canvas = within(canvasElement)
		await expect(canvas.getByText(args.list.name)).toBeInTheDocument()
	},
}

export const RecipientMenuOpens: Story = {
	args: { role: 'recipient', list: recipientBase },
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const canvas = within(canvasElement)
		const trigger = canvas.getAllByRole('button').find(b => b.getAttribute('aria-haspopup') === 'menu')
		await expect(trigger).toBeDefined()
		await userEvent.click(trigger!)
		// Menu items render in a portal.
		await expect(await within(document.body).findByRole('menuitem', { name: /edit/i })).toBeInTheDocument()
	},
	tags: ['!autodocs'],
}

export const RecipientPrimary: Story = {
	args: { role: 'recipient', list: { ...recipientBase, isPrimary: true } },
}

export const RecipientPrivate: Story = {
	args: { role: 'recipient', list: { ...recipientBase, name: 'Private list', isPrivate: true } },
}

export const RecipientArchived: Story = {
	args: { role: 'recipient', list: { ...recipientBase, name: 'Old wish list', isActive: false, itemCount: 3 } },
}

export const RecipientGiftIdeas: Story = {
	args: {
		role: 'recipient',
		list: {
			...recipientBase,
			name: 'Ideas for Alex',
			type: 'giftideas',
			giftIdeasTargetUserId: 'user-2',
			giftIdeasTarget: { id: 'user-2', name: 'Alex Example', email: 'alex@example.com', image: null },
		},
	},
}

export const RecipientGiftIdeasWithAvatar: Story = {
	args: {
		role: 'recipient',
		list: {
			...recipientBase,
			name: 'Ideas for Morgan',
			type: 'giftideas',
			giftIdeasTargetUserId: 'user-3',
			giftIdeasTarget: {
				id: 'user-3',
				name: 'Morgan Example',
				email: 'morgan@example.com',
				image: 'https://i.pravatar.cc/128?img=22',
			},
		},
	},
}

export const RecipientEmpty: Story = {
	args: { role: 'recipient', list: { ...recipientBase, name: 'Brand new', itemCount: 0 } },
}

export const RecipientVariations: Story = {
	args: { role: 'recipient', list: recipientBase },
	render: () => {
		const carol = { id: 'u-carol', name: 'Carol', email: 'carol@example.com', image: 'https://i.pravatar.cc/128?img=47' }
		const chase = { id: 'u-chase', name: 'Chase', email: 'chase@example.com', image: 'https://i.pravatar.cc/128?img=15' }
		const shawn = { name: 'Shawn', email: 'shawn@example.com', image: 'https://i.pravatar.cc/128?img=68' }
		const noImageOwner = { name: 'Brandon', email: 'brandon@example.com', image: null }
		const editors = [
			{ name: 'Alex', email: 'alex@example.com', image: 'https://i.pravatar.cc/128?img=12' },
			{ name: 'Morgan', email: 'morgan@example.com', image: 'https://i.pravatar.cc/128?img=22' },
			{ name: 'Jamie', email: 'jamie@example.com', image: null },
		]

		const giftIdeas = (overrides: Partial<MyListRowType> & { id: number }): MyListRowType => ({
			...recipientBase,
			type: 'giftideas',
			...overrides,
		})

		return (
			<div className="flex flex-col gap-1">
				<ListRow
					role="recipient"
					list={giftIdeas({ id: 1, name: 'Ideas for Carol (mine)', giftIdeasTargetUserId: carol.id, giftIdeasTarget: carol })}
				/>
				<ListRow
					role="recipient"
					list={giftIdeas({
						id: 2,
						name: 'Ideas for Conrad (mine, free-text recipient)',
						giftIdeasTargetUserId: null,
						giftIdeasTarget: null,
					})}
				/>
				<ListRow
					role="recipient"
					list={giftIdeas({ id: 3, name: 'Ideas for Carol (Shawn owns)', giftIdeasTargetUserId: carol.id, giftIdeasTarget: carol })}
					showOwner={shawn}
				/>
				<ListRow
					role="recipient"
					list={giftIdeas({
						id: 4,
						name: 'Ideas for Brandon (Shawn owns, no avatar owner)',
						giftIdeasTargetUserId: null,
						giftIdeasTarget: null,
					})}
					showOwner={noImageOwner}
				/>
				<ListRow
					role="recipient"
					list={giftIdeas({ id: 5, name: 'Ideas for Chase (1 other editor)', giftIdeasTargetUserId: chase.id, giftIdeasTarget: chase })}
					showOwner={shawn}
					editors={editors.slice(0, 1)}
				/>
				<ListRow
					role="recipient"
					list={giftIdeas({ id: 6, name: 'Ideas for Chase (3 other editors)', giftIdeasTargetUserId: chase.id, giftIdeasTarget: chase })}
					showOwner={shawn}
					editors={editors}
				/>
				<ListRow
					role="recipient"
					list={{ ...recipientBase, id: 7, name: 'Shared family wishlist (non-gift-ideas, owner only)' }}
					showOwner={shawn}
				/>
				<ListRow
					role="recipient"
					list={{ ...recipientBase, id: 8, name: 'Shared family wishlist (non-gift-ideas, owner + editors)' }}
					showOwner={shawn}
					editors={editors}
				/>
			</div>
		)
	},
	parameters: {
		docs: {
			description: {
				story:
					'All recipient-row variations in one place: gift-ideas with linked recipient, gift-ideas with free-text recipient, lists I own vs lists with an owner badge, and editor avatars stacked behind the owner badge.',
			},
		},
	},
}

export const GifterDefault: Story = {
	args: { role: 'gifter', list: gifterBase },
}

export const GifterAllClaimed: Story = {
	args: { role: 'gifter', list: { ...gifterBase, name: 'Fully claimed list', itemsTotal: 4, itemsRemaining: 0 } },
}

export const GifterEmpty: Story = {
	args: { role: 'gifter', list: { ...gifterBase, name: 'Brand new list', itemsTotal: 0, itemsRemaining: 0 } },
}

export const GifterAllTypes: Story = {
	args: { role: 'gifter', list: gifterBase },
	render: () => (
		<div className="flex flex-col gap-1">
			{listTypeEnumValues
				.filter(type => type !== 'giftideas')
				.map((type, i) => (
					<ListRow
						key={type}
						role="gifter"
						list={{ ...gifterBase, id: i + 1, type, name: `${type} list`, itemsTotal: 8 + i, itemsRemaining: 3 + i }}
					/>
				))}
		</div>
	),
}

export const RoleFlip: Story = {
	args: { role: 'recipient', list: recipientBase },
	argTypes: {
		role: { control: 'radio', options: ['recipient', 'gifter'] },
	},
	render: ({ role }: ListRowProps) => {
		if (role === 'gifter') return <ListRow role="gifter" list={gifterBase} />
		return <ListRow role="recipient" list={recipientBase} />
	},
	parameters: {
		docs: {
			description: {
				story: 'Use the **role** control to flip between recipient (owner view with actions) and gifter (viewer with claim progress).',
			},
		},
	},
}
