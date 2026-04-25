import type { Meta, StoryObj } from '@storybook/react-vite'
import { Link } from '@tanstack/react-router'

import BirthdayBadge from '@/components/common/birthday-badge'
import CountBadge from '@/components/common/count-badge'
import ListTypeIcon from '@/components/common/list-type-icon'
import UserAvatar from '@/components/common/user-avatar'
import {
	ListsCard,
	ListsCardDescription,
	ListsCardHeader,
	ListsCardList,
	ListsCardLists,
	ListsCardTitle,
} from '@/components/lists/lists-card'
import type { ListType } from '@/db/schema/enums'

type SampleList = {
	id: number
	name: string
	type: ListType
	itemsTotal: number
	itemsRemaining: number
}

const sampleLists: Array<SampleList> = [
	{ id: 1, name: 'Wish List', type: 'wishlist', itemsTotal: 10, itemsRemaining: 6 },
	{ id: 2, name: 'Christmas 2026', type: 'christmas', itemsTotal: 18, itemsRemaining: 4 },
	{ id: 3, name: 'Birthday', type: 'birthday', itemsTotal: 5, itemsRemaining: 5 },
]

const renderRow = (list: SampleList) => (
	<ListsCardList key={list.id} asChild>
		<Link to="/lists/$listId" params={{ listId: String(list.id) }}>
			<ListTypeIcon type={list.type} className="size-6" />
			<div className="font-medium leading-tight flex-1">{list.name}</div>
			<CountBadge count={list.itemsTotal} remaining={list.itemsRemaining} />
		</Link>
	</ListsCardList>
)

const meta = {
	title: 'Lists/ListsCard',
	component: ListsCard,
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
} satisfies Meta<typeof ListsCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
	render: () => (
		<ListsCard>
			<ListsCardHeader>
				<UserAvatar name="Jamie Friend" />
				<ListsCardTitle>Jamie Friend</ListsCardTitle>
				<BirthdayBadge birthMonth="may" birthDay={12} />
			</ListsCardHeader>
			<ListsCardLists>{sampleLists.map(renderRow)}</ListsCardLists>
		</ListsCard>
	),
}

export const WithDescription: Story = {
	render: () => (
		<ListsCard>
			<ListsCardHeader className="flex-col items-start gap-1">
				<ListsCardTitle>Household Lists</ListsCardTitle>
				<ListsCardDescription>Shared wish lists for the family, sorted by who's up next.</ListsCardDescription>
			</ListsCardHeader>
			<ListsCardLists>{sampleLists.map(renderRow)}</ListsCardLists>
		</ListsCard>
	),
}

export const WithAvatar: Story = {
	render: () => (
		<ListsCard>
			<ListsCardHeader>
				<UserAvatar name="Morgan Partner" image="https://i.pravatar.cc/128?img=22" />
				<ListsCardTitle>Morgan Partner</ListsCardTitle>
				<BirthdayBadge birthMonth="april" birthDay={30} />
			</ListsCardHeader>
			<ListsCardLists>{sampleLists.map(renderRow)}</ListsCardLists>
		</ListsCard>
	),
}

export const SingleList: Story = {
	render: () => (
		<ListsCard>
			<ListsCardHeader>
				<UserAvatar name="Sam Sibling" />
				<ListsCardTitle>Sam Sibling</ListsCardTitle>
			</ListsCardHeader>
			<ListsCardLists>{renderRow(sampleLists[0])}</ListsCardLists>
		</ListsCard>
	),
}

export const NoLists: Story = {
	render: () => (
		<ListsCard>
			<ListsCardHeader>
				<UserAvatar name="New User" />
				<ListsCardTitle>New User</ListsCardTitle>
			</ListsCardHeader>
			<ListsCardLists>
				<div className="text-sm text-muted-foreground bg-background/25 border border-dashed rounded px-2 py-1 italic">No lists</div>
			</ListsCardLists>
		</ListsCard>
	),
}

export const NonClickableRows: Story = {
	render: () => (
		<ListsCard>
			<ListsCardHeader className="flex-col items-start gap-1">
				<ListsCardTitle>Read-only preview</ListsCardTitle>
				<ListsCardDescription>Rows render as plain divs when no link is provided.</ListsCardDescription>
			</ListsCardHeader>
			<ListsCardLists>
				{sampleLists.map(list => (
					<ListsCardList key={list.id}>
						<ListTypeIcon type={list.type} className="size-6" />
						<div className="font-medium leading-tight flex-1">{list.name}</div>
						<CountBadge count={list.itemsTotal} remaining={list.itemsRemaining} />
					</ListsCardList>
				))}
			</ListsCardLists>
		</ListsCard>
	),
}

export const Composed: Story = {
	render: () => (
		<div className="flex flex-col gap-2">
			<ListsCard>
				<ListsCardHeader>
					<UserAvatar name="Jamie Friend" />
					<ListsCardTitle>Jamie Friend</ListsCardTitle>
					<BirthdayBadge birthMonth="may" birthDay={12} />
				</ListsCardHeader>
				<ListsCardLists>{sampleLists.map(renderRow)}</ListsCardLists>
			</ListsCard>
			<ListsCard>
				<ListsCardHeader>
					<UserAvatar name="Sam Sibling" />
					<ListsCardTitle>Sam Sibling</ListsCardTitle>
				</ListsCardHeader>
				<ListsCardLists>{renderRow(sampleLists[1])}</ListsCardLists>
			</ListsCard>
		</div>
	),
}
