import { render } from 'react-email'
import { describe, expect, it } from 'vitest'

import GiftExchangeChangedEmail from '../gift-exchange-changed-email'
import GiftExchangeReadyEmail from '../gift-exchange-ready-email'

// The two gift exchange emails (plan 39): exchange name, budget if set, gift
// date in the reader's language, one button to /gift-exchange, and nobody's
// name but the child's on a guardian's copy.

const text = (html: string) =>
	html
		.replace(/<!--.*?-->/g, '')
		.replace(/&#x27;/g, "'")
		.replace(/<[^>]+>/g, ' ')
		.replace(/[\u00a0\u202f]/g, ' ')
		.replace(/\s+/g, ' ')

const base = { exchangeName: 'Family Swap', budget: 50, budgetCurrency: 'USD', giftDate: '2026-12-25' }

describe('GiftExchangeReadyEmail', () => {
	it('English: name, budget, date and the button', async () => {
		const html = await render(<GiftExchangeReadyEmail {...base} locale="en" />)
		const body = text(html)
		expect(html).toContain('lang="en"')
		expect(body).toContain('Your assignment is ready')
		expect(body).toContain('Names have been drawn for Family Swap.')
		expect(body).toContain('Gift date: December 25, 2026')
		expect(body).toContain('Budget: $50')
		expect(html).toContain('/gift-exchange"')
		expect(body).toContain('Open Gift Exchange')
	})

	it('French formats the date and amount for the reader', async () => {
		const html = await render(<GiftExchangeReadyEmail {...base} budget={25.5} budgetCurrency="EUR" locale="fr" />)
		const body = text(html)
		expect(html).toContain('lang="fr"')
		expect(body).toContain('Votre tirage est prêt')
		expect(body).toContain('« Family Swap »')
		expect(body).toContain('Date des cadeaux : 25 décembre 2026')
		expect(body).toContain('Budget : 25,50 €')
		expect(body).not.toContain('Your assignment')
	})

	it('leaves the budget out when there is none', async () => {
		const body = text(await render(<GiftExchangeReadyEmail {...base} budget={null} budgetCurrency={null} locale="en" />))
		expect(body).not.toContain('Budget')
	})

	it("a guardian's copy is about the child", async () => {
		expect(text(await render(<GiftExchangeReadyEmail {...base} childName="Sam" locale="en" />))).toContain("Sam's assignment is ready")
		expect(text(await render(<GiftExchangeReadyEmail {...base} childName="Sam" locale="fr" />))).toContain('Le tirage de Sam est prêt')
	})
})

describe('GiftExchangeChangedEmail', () => {
	it('English and French', async () => {
		const en = text(await render(<GiftExchangeChangedEmail {...base} locale="en" />))
		expect(en).toContain('Your assignment has changed')
		expect(en).toContain('Your assignment for Family Swap has changed.')
		const fr = text(await render(<GiftExchangeChangedEmail {...base} locale="fr" />))
		expect(fr).toContain('Votre tirage a changé')
		expect(fr).toContain('Votre tirage pour « Family Swap » a changé.')
	})

	it("a guardian's copy is about the child", async () => {
		expect(text(await render(<GiftExchangeChangedEmail {...base} childName="Sam" locale="en" />))).toContain("Sam's assignment has changed")
		expect(text(await render(<GiftExchangeChangedEmail {...base} childName="Sam" locale="fr" />))).toContain('Le tirage de Sam a changé')
	})
})
