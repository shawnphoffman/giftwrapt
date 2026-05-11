import type { Meta, StoryObj } from '@storybook/react-vite'

import { ListSettingsForm } from './list-settings-form'

const baseSession = {
	user: {
		id: 'user-1',
		name: 'Pat Example',
		email: 'pat@example.com',
		image: null,
		isChild: false,
		partnerId: null,
		role: 'user',
	},
}

const meta = {
	title: 'Lists/ListSettingsForm',
	component: ListSettingsForm,
	parameters: {
		layout: 'padded',
		session: baseSession,
	},
	decorators: [
		Story => (
			<div className="max-w-md">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof ListSettingsForm>

export default meta
type Story = StoryObj<typeof meta>

// Owner editing a public wishlist. No holiday metadata, no dependents,
// no partner. The "List is for" picker is hidden because the user has
// no dependents.
export const Wishlist: Story = {
	args: {
		listId: 1,
		name: 'My wish list',
		type: 'wishlist',
		isPrivate: false,
		description: null,
		giftIdeasTargetUserId: null,
		subjectDependentId: null,
		customHolidayId: null,

		editorUserIds: [],
		isOwner: true,
	},
}

// Owner editing a Holiday list pinned to US Thanksgiving. The country +
// holiday pickers populate from the curated catalog with the next
// occurrence date in the option label.
export const Holiday: Story = {
	args: {
		listId: 2,
		name: 'Thanksgiving 2026',
		type: 'holiday',
		isPrivate: false,
		description: null,
		giftIdeasTargetUserId: null,
		subjectDependentId: null,
		customHolidayId: null,

		editorUserIds: [],
		isOwner: true,
	},
}

// Same as Holiday, but for a UK list (verifies the Mothering Sunday
// catalog entry is distinct from US Mother's Day).
export const HolidayUK: Story = {
	args: {
		listId: 3,
		name: 'Mothering Sunday',
		type: 'holiday',
		isPrivate: false,
		description: null,
		giftIdeasTargetUserId: null,
		subjectDependentId: null,
		customHolidayId: null,

		editorUserIds: [],
		isOwner: true,
	},
}
