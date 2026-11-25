import type { Meta, StoryObj } from '@storybook/react-vite'

import {
	exchange,
	MEMBERS,
	PAIRINGS,
	RUTH_STUCK,
	THREE_FOR_TWO,
	withAdminColumn,
	withExchangeQueries,
} from './_stories/gift-exchange-fixtures'
import { GiftExchangePage } from './gift-exchange-page'

/**
 * One exchange as a page of stacked cards: details with the actions, People,
 * and Who Can Gift to Whom. Clicking a person in the list, the table or a
 * warning opens the Yes / No dialog. Archived exchanges show who gifted to
 * whom instead.
 */
const meta = {
	title: 'Admin/Gift Exchanges/Exchange Page',
	component: GiftExchangePage,
	parameters: { layout: 'padded' },
	decorators: [withAdminColumn, withExchangeQueries],
} satisfies Meta<typeof GiftExchangePage>

export default meta
type Story = StoryObj<typeof meta>

export const NotDrawn: Story = {
	args: { exchange: exchange() },
}

export const SomeoneHasNoOptions: Story = {
	args: { exchange: exchange({ blocked: RUTH_STUCK }) },
}

export const NamesCannotBeDrawn: Story = {
	args: { exchange: exchange({ blocked: THREE_FOR_TWO }) },
}

export const TooFewPeople: Story = {
	args: { exchange: exchange({ members: MEMBERS.slice(0, 2), blocked: [], locked: [] }) },
}

export const NobodyYet: Story = {
	args: { exchange: exchange({ name: 'Office Party', budget: null, budgetCurrency: null, members: [], blocked: [], locked: [] }) },
}

const LAST_YEAR = { id: 'ex-2025', name: 'Christmas 2025' }

/** An archived exchange shares people with this one, so the draw avoids its pairs. */
export const AvoidsRepeats: Story = {
	args: { exchange: exchange({ avoidsRepeatsFrom: LAST_YEAR }) },
}

/** The rules leave no draw where everyone gets someone new. */
export const RepeatExpected: Story = {
	args: { exchange: exchange({ avoidsRepeatsFrom: LAST_YEAR, repeatExpected: true }) },
}

export const Drawn: Story = {
	args: { exchange: exchange({ state: 'drawn', drawnAt: new Date('2026-11-24T18:00:00Z') }) },
}

export const DrawnAvoidsRepeats: Story = {
	args: { exchange: exchange({ state: 'drawn', drawnAt: new Date('2026-11-24T18:00:00Z'), avoidsRepeatsFrom: LAST_YEAR }) },
}

export const DrawnAndSomeoneLooked: Story = {
	args: { exchange: exchange({ state: 'drawn', drawnAt: new Date('2026-11-24T18:00:00Z'), anyoneHasLooked: true }) },
}

const DRAWN = { state: 'drawn', drawnAt: new Date('2026-11-24T18:00:00Z') } as const

/** Send Emails shows while anyone hasn't been emailed; the line names the one left. */
export const DrawnOneNotEmailed: Story = {
	args: { exchange: exchange({ ...DRAWN, notEmailedCount: 1, notEmailedMemberId: 'dana' }) },
}

export const DrawnSomeNotEmailed: Story = {
	args: { exchange: exchange({ ...DRAWN, notEmailedCount: 3 }) },
}

/** Everyone has been emailed: no Send Emails button. */
export const DrawnAllEmailed: Story = {
	args: { exchange: exchange({ ...DRAWN, notEmailedCount: 0 }) },
}

export const DrawnEmailNotSetUp: Story = {
	args: { exchange: exchange({ ...DRAWN, emailStatus: 'not-configured' }) },
}

export const DrawnEmailsSwitchedOff: Story = {
	args: { exchange: exchange({ ...DRAWN, emailStatus: 'switched-off' }) },
}

export const Archived: Story = {
	args: {
		exchange: exchange({
			name: 'Christmas 2025',
			giftDate: '2025-12-25',
			state: 'archived',
			drawnAt: new Date('2025-11-20T18:00:00Z'),
			archivedAt: new Date('2026-01-05T18:00:00Z'),
			drawCheck: null,
			members: MEMBERS.map(x => (x.id === 'omar' ? { ...x, userId: null, name: null, email: null, role: null } : x)),
			pairings: PAIRINGS,
		}),
	},
}

export const LongNames: Story = {
	args: {
		exchange: exchange({
			name: 'Cousins Gift Swap at the Lake House Summer Reunion Weekend Extravaganza 2026',
			members: MEMBERS.map(x =>
				x.id === 'alex' ? { ...x, name: 'Alexandra Bartholomew-Montgomery-Fitzgerald the Third of Westchester', banned: true } : x
			),
		}),
	},
}
