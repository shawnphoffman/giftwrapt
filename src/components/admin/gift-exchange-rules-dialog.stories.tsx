import type { Meta, StoryObj } from '@storybook/react-vite'

import type { AdminExchangeMember } from '@/api/_gift-exchanges-impl'

import { exchange, MEMBERS, withExchangeQueries } from './_stories/gift-exchange-fixtures'
import { GiftExchangeRulesDialog } from './gift-exchange-rules-dialog'

/**
 * The Yes / No dialog for one person. A pair a fixed limit forbids is a
 * disabled No with the reason under the name and as a tooltip. After the
 * draw, the note says saving redraws, the button is Save and Redraw, and a
 * change that would leave no valid draw can't be saved. On a phone each name
 * sits on its own line with the answers under the two pinned headers.
 */
const meta = {
	title: 'Admin/Gift Exchanges/Yes No Dialog',
	component: GiftExchangeRulesDialog,
	parameters: { layout: 'centered' },
	decorators: [withExchangeQueries],
} satisfies Meta<typeof GiftExchangeRulesDialog>

export default meta
type Story = StoryObj<typeof meta>

export const BeforeTheDraw: Story = {
	args: { exchange: exchange(), memberId: 'nora', onOpenChange: () => {} },
}

export const ChildWithGuardians: Story = {
	args: { exchange: exchange(), memberId: 'maya', onOpenChange: () => {} },
}

export const AfterTheDraw: Story = {
	args: {
		exchange: exchange({ state: 'drawn', drawnAt: new Date('2026-11-24T18:00:00Z'), anyoneHasLooked: true }),
		memberId: 'nora',
		onOpenChange: () => {},
	},
}

// Enough people that the table scrolls under its pinned headers.
const many: Array<AdminExchangeMember> = [
	...MEMBERS,
	...Array.from({ length: 14 }, (_, i) => ({
		id: `extra-${i}`,
		userId: `u-extra-${i}`,
		name: `Cousin Number ${i + 1}`,
		email: `cousin${i + 1}@example.test`,
		image: null,
		role: 'user' as const,
		banned: false,
	})),
]

export const LongList: Story = {
	args: { exchange: exchange({ members: many }), memberId: 'nora', onOpenChange: () => {} },
}
