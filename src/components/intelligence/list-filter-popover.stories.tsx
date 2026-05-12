import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import { withPageContainer } from '../../../.storybook/decorators'
import type { ListRef } from './__fixtures__/types'
import { GLOBAL_FILTER_ID, ListFilterPopover, type ListFilterSection } from './list-filter-popover'

function makeList(id: string, name: string, kind: 'user' | 'dependent' = 'user', subjectName = 'You'): ListRef {
	return {
		id,
		name,
		type: 'wishlist',
		isPrivate: false,
		subject: { kind, name: subjectName },
	}
}

const userLists = [makeList('list-1', 'My Wishlist'), makeList('list-2', 'Christmas 2026'), makeList('list-3', 'Birthday')]
const bobbyLists = [makeList('list-bobby-1', "Bobby's Birthday", 'dependent', 'Bobby')]
const aliceLists = [
	makeList('list-alice-1', "Alice's Wishlist", 'dependent', 'Alice'),
	makeList('list-alice-2', "Alice's Birthday", 'dependent', 'Alice'),
]

const sectionsAllShapes: Array<ListFilterSection> = [
	{ key: 'global', label: 'Global suggestions', options: [{ listId: GLOBAL_FILTER_ID, listRef: null }] },
	{ key: 'user', label: 'Your lists', options: userLists.map(l => ({ listId: l.id, listRef: l })) },
	{
		key: 'dependent:bobby',
		label: "Bobby's lists",
		dependent: { id: 'bobby', name: 'Bobby', image: null },
		options: bobbyLists.map(l => ({ listId: l.id, listRef: l })),
	},
	{
		key: 'dependent:alice',
		label: "Alice's lists",
		dependent: { id: 'alice', name: 'Alice', image: null },
		options: aliceLists.map(l => ({ listId: l.id, listRef: l })),
	},
]

const sectionsUserOnly: Array<ListFilterSection> = [
	{ key: 'user', label: 'Your lists', options: userLists.map(l => ({ listId: l.id, listRef: l })) },
]

function Wrapper({
	sections,
	initialSelected,
	iconOnly,
}: {
	sections: Array<ListFilterSection>
	initialSelected?: Set<string>
	iconOnly?: boolean
}) {
	const allIds = new Set<string>()
	for (const s of sections) for (const o of s.options) allIds.add(o.listId)
	const [selected, setSelected] = useState<Set<string>>(initialSelected ?? allIds)
	return <ListFilterPopover sections={sections} selected={selected} onChange={setSelected} iconOnly={iconOnly} />
}

const meta = {
	title: 'Intelligence/ListFilterPopover',
	component: Wrapper,
	parameters: { layout: 'fullscreen' },
	decorators: [withPageContainer],
} satisfies Meta<typeof Wrapper>

export default meta
type Story = StoryObj<typeof meta>

export const AllSectionShapes: Story = { args: { sections: sectionsAllShapes } }

export const UserListsOnly: Story = { args: { sections: sectionsUserOnly } }

export const PartiallySelected: Story = {
	args: { sections: sectionsAllShapes, initialSelected: new Set(['list-1', 'list-alice-1']) },
}

export const NothingSelected: Story = { args: { sections: sectionsAllShapes, initialSelected: new Set() } }

export const IconOnly: Story = { args: { sections: sectionsAllShapes, iconOnly: true, initialSelected: new Set(['list-1']) } }
