import { render } from 'react-email'
import { describe, expect, it } from 'vitest'

import ParentsDayReminderEmail from '../parents-day-reminder-email'
import PartnerAnniversaryReminderEmail from '../partner-anniversary-reminder-email'
import ValentinesDayReminderEmail from '../valentines-day-reminder-email'

const text = (html: string) => html.replace(/<!--\s*-->/g, '')

const picks = [
	{
		personName: 'Alex',
		items: [
			{ title: 'Merino Scarf', price: '$35', path: '/lists/1#item-2', imageUrl: 'https://img.example/scarf.jpg' },
			{ title: 'Enamel Mug', price: null, path: '/lists/1#item-3', imageUrl: null },
		],
	},
]

describe('reminder emails with picks', () => {
	it('lists what is still open, linked to the item, and says nothing about claims', async () => {
		const html = text(await render(<ValentinesDayReminderEmail name="Blair" partnerName="Alex" leadDays={7} picks={picks} />))
		expect(html).toContain('Still open on Alex’s list')
		expect(html).toContain('Merino Scarf')
		expect(html).toContain('$35')
		expect(html).toContain('/lists/1#item-2')
		expect(html).toContain('https://img.example/scarf.jpg')
		// No image falls back to the placeholder: email has no onerror.
		expect(html).toContain('/images/email/gift.png')
		expect(html.toLowerCase()).not.toMatch(/claimed|bought|purchased| left\b/u)
	})

	it('reads exactly as before without picks', async () => {
		const withNone = text(await render(<ValentinesDayReminderEmail name="Blair" partnerName="Alex" leadDays={7} />))
		const withEmpty = text(await render(<ValentinesDayReminderEmail name="Blair" partnerName="Alex" leadDays={7} picks={[]} />))
		expect(withNone).not.toContain('Still open')
		expect(withEmpty).toBe(withNone)
	})

	it('the parents-day and anniversary emails carry the same block', async () => {
		const parents = text(
			await render(<ParentsDayReminderEmail holidayName="Mother's Day" leadDays={7} people={[{ name: 'Alex' }]} picks={picks} />)
		)
		const anniversary = text(await render(<PartnerAnniversaryReminderEmail name="Blair" partnerName="Alex" leadDays={7} picks={picks} />))
		expect(parents).toContain('Still open on Alex’s list')
		expect(anniversary).toContain('Enamel Mug')
	})
})
