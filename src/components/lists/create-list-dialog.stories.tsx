import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'

import { __setStorybookDependents, __setStorybookGiftIdeasRecipients } from '../../../.storybook/mocks/api'
import { CreateListDialog } from './create-list-dialog'

function DialogHarness({ session }: { session?: 'with-partner' | 'with-dependents' | 'plain' }) {
	const [open, setOpen] = useState(true)

	useEffect(() => {
		if (session === 'with-dependents') {
			__setStorybookDependents([
				{
					id: 'dep-1',
					name: 'Pico',
					image: null,
					birthMonth: 'march',
					birthDay: 14,
					birthYear: 2021,
					isArchived: false,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					guardianIds: ['user-1'],
				},
				{
					id: 'dep-2',
					name: 'Avery',
					image: null,
					birthMonth: 'july',
					birthDay: 2,
					birthYear: 2024,
					isArchived: false,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					guardianIds: ['user-1'],
				},
			])
		} else {
			__setStorybookDependents([])
		}
		if (session === 'with-partner') {
			__setStorybookGiftIdeasRecipients([{ id: 'partner-1', name: 'Alex Partner', email: 'alex@example.com', image: null }])
		} else {
			__setStorybookGiftIdeasRecipients([])
		}
		return () => {
			__setStorybookDependents([])
			__setStorybookGiftIdeasRecipients([])
		}
	}, [session])

	return <CreateListDialog open={open} onOpenChange={setOpen} />
}

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
	title: 'Lists/CreateListDialog',
	component: DialogHarness,
	parameters: {
		layout: 'centered',
		session: baseSession,
	},
} satisfies Meta<typeof DialogHarness>

export default meta
type Story = StoryObj<typeof meta>

// Default state: signed-in user with no dependents and no partner. The
// dialog opens with the wishlist type pre-selected and the privacy
// switch off (will be public). Switching the type dropdown to "Holiday"
// reveals the country + holiday pickers below the existing 2-col grid.
export const Default: Story = {
	args: { session: 'plain' },
}

// User has a partner. With a public wishlist, the dialog surfaces the
// "Add [partner] as an editor" affordance below the privacy switch.
export const WithPartner: Story = {
	args: { session: 'with-partner' },
	parameters: {
		session: { user: { ...baseSession.user, partnerId: 'partner-1' } },
	},
}

// User is a guardian of two dependents. The "List is for (optional)"
// picker appears in the 2-col grid alongside the type select.
export const WithDependents: Story = {
	args: { session: 'with-dependents' },
}
