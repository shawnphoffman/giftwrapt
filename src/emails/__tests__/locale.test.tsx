import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { render } from 'react-email'
import { describe, expect, it } from 'vitest'

import BirthdayEmail from '../happy-birthday-email'
import NewCommentEmail from '../new-comment-email'
import OrphanClaimCleanupReminderEmail from '../orphan-claim-cleanup-reminder-email'
import OrphanClaimEmail from '../orphan-claim-email'
import ParentsDayReminderEmail from '../parents-day-reminder-email'
import PartnerAnniversaryReminderEmail from '../partner-anniversary-reminder-email'
import PasswordResetEmail from '../password-reset-email'
import PreBirthdayReminderEmail from '../pre-birthday-reminder-email'
import PreChristmasReminderEmail from '../pre-christmas-reminder-email'
import PreCustomHolidayReminderEmail from '../pre-custom-holiday-reminder-email'
import RevealSummaryEmail from '../reveal-summary-email'
import ValentinesDayReminderEmail from '../valentines-day-reminder-email'

// An email is written for someone who is not making a request, so there is
// no request locale to fall back on: every message call in a template has to
// name the reader's locale (plan 36g).

const text = (html: string) =>
	html
		.replace(/<!--.*?-->/g, '')
		.replace(/&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/<[^>]+>/g, ' ')
		.replace(/[\u00a0\u202f]/g, ' ')
		.replace(/\s+/g, ' ')

describe('message calls under src/emails', () => {
	const dir = join(__dirname, '..')
	const files = readdirSync(dir).filter(name => name.endsWith('.tsx'))

	it('finds the templates', () => {
		expect(files.length).toBeGreaterThan(10)
	})

	for (const name of files) {
		it(`${name} passes an explicit locale to every message`, () => {
			const source = readFileSync(join(dir, name), 'utf8')
			// `m.key(` and `m.key.parts(`, up to the call's closing paren on the
			// same statement. Templates name the options object `o`.
			const calls = source.match(/\bm\.[a-z0-9_]+(?:\.parts)?\((?:[^()]|\([^()]*\))*\)/g) ?? []
			const missing = calls.filter(call => !/,\s*o\)$/.test(call))
			expect(missing).toEqual([])
			if (calls.length > 0) expect(source).toContain('const o = { locale }')
		})
	}
})

describe('templates in each locale', () => {
	const cases: Array<{ name: string; make: (locale: 'en' | 'fr') => React.ReactElement; en: string; fr: string }> = [
		{
			name: 'birthday',
			make: locale => <BirthdayEmail name="Sam" locale={locale} />,
			en: '🎉 Happy Birthday, Sam! 🎉',
			fr: '🎉 Joyeux anniversaire, Sam ! 🎉',
		},
		{
			name: 'new comment',
			make: locale => (
				<NewCommentEmail username="Sam" commenter="Kate" comment="Nice" itemTitle="Scarf" listId={1} itemId={2} locale={locale} />
			),
			en: 'Kate has left a comment on one of your items ( Scarf ).',
			fr: 'Kate a laissé un commentaire sur l’un de vos articles ( Scarf ).',
		},
		{
			name: 'orphan claim',
			make: locale => (
				<OrphanClaimEmail username="Sam" itemTitle="Scarf" recipientName="Kate" listId={1} listName="Wishes" locale={locale} />
			),
			en: "Kate removed Scarf from Wishes . You (or your partner) had already claimed it. They were never told you claimed it, so they don't know that you may have already purchased the gift.",
			fr: 'Kate a retiré Scarf de Wishes . Vous (ou votre partenaire) l’aviez déjà réservé.',
		},
		{
			name: 'orphan claim cleanup',
			make: locale => (
				<OrphanClaimCleanupReminderEmail
					username="Sam"
					itemTitle="Scarf"
					recipientName="Kate"
					eventLabel={locale === 'fr' ? 'Noël' : 'Christmas'}
					listId={1}
					listName="Wishes"
					locale={locale}
				/>
			),
			en: "a while back, and you haven't acknowledged it yet. Tomorrow (Christmas), GiftWrapt will automatically clear the claim from your view to keep things tidy.",
			fr: 'Demain (Noël), GiftWrapt retirera automatiquement cette réservation de votre vue',
		},
		{
			name: 'parents day',
			make: locale => (
				<ParentsDayReminderEmail
					holidayName={locale === 'fr' ? 'Fête des Mères' : "Mother's Day"}
					leadDays={7}
					people={[{ name: 'Mom' }, { name: 'Sandra' }]}
					locale={locale}
				/>
			),
			en: "Mother's Day is in 7 days You’ve tagged Mom and Sandra for Mother's Day. Take a peek at their lists if you’re still looking for something.",
			fr: 'Fête des Mères : plus que 7 jours Vous avez indiqué Mom et Sandra pour cette occasion (Fête des Mères).',
		},
		{
			name: 'partner anniversary',
			make: locale => <PartnerAnniversaryReminderEmail name="Sam" partnerName="Kate" leadDays={7} locale={locale} />,
			en: 'Your anniversary with Kate is in 7 days Sam, your anniversary with Kate is coming up. Take a look at their list at All Lists .',
			fr: 'Plus que 7 jours avant votre anniversaire de couple avec Kate',
		},
		{
			name: 'valentines',
			make: locale => <ValentinesDayReminderEmail name="Sam" partnerName="Kate" leadDays={14} locale={locale} />,
			en: "Valentine's Day is in 14 days Sam, Valentine's Day is coming up. Check what Kate has on their list at All Lists .",
			fr: 'La Saint-Valentin est dans 14 jours',
		},
		{
			name: 'pre-birthday',
			make: locale => <PreBirthdayReminderEmail name="Sam" leadDays={30} locale={locale} />,
			en: "Your birthday is in 30 days, Sam Now is a good time to make sure your birthday list doesn't suck. Add or remove items, set priorities, and update anything that's gone stale on your My Lists page.",
			fr: 'Sam, votre anniversaire est dans 30 jours',
		},
		{
			name: 'pre-christmas',
			make: locale => <PreChristmasReminderEmail name="Sam" leadDays={30} locale={locale} />,
			en: "Christmas is in 30 days, Sam Time to spruce up your Christmas list. Add anything new, drop what you've outgrown, and make it easier for the people shopping for you. Head to My Lists to review.",
			fr: 'Sam, Noël est dans 30 jours',
		},
		{
			name: 'pre-custom-holiday',
			make: locale => <PreCustomHolidayReminderEmail name="Sam" holidayName="Easter" leadDays={30} locale={locale} />,
			en: "Easter is in 30 days Sam, if you've got plans for Easter this year, now is a good time to make a list. Head to My Lists to create one.",
			fr: 'Easter : plus que 30 jours',
		},
		{
			name: 'password reset',
			make: locale => <PasswordResetEmail name="Sam" resetUrl="https://example.test/r" expiresInMinutes={60} locale={locale} />,
			en: 'Someone (hopefully you) asked to reset the password on your GiftWrapt account. Click the button below to choose a new password. The link is good for 60 minutes.',
			fr: 'Le lien est valable 60 minutes.',
		},
		{
			name: 'reveal summary',
			make: locale => (
				<RevealSummaryEmail
					intro="intro"
					sections={[{ listName: 'Wishes', items: [{ title: 'Jam', image_url: null, gifters: 'Kate', offList: true }] }]}
					locale={locale}
				/>
			),
			en: 'From: Kate (off-list gift)',
			fr: 'Offert par : Kate (cadeau hors liste)',
		},
	]

	for (const c of cases) {
		it(`${c.name}: English reads as it always has`, async () => {
			const html = await render(c.make('en'))
			expect(html).toContain('lang="en"')
			expect(text(html)).toContain(c.en)
		})

		it(`${c.name}: French`, async () => {
			const html = await render(c.make('fr'))
			expect(html).toContain('lang="fr"')
			expect(text(html)).toContain(c.fr)
			expect(text(html)).not.toContain(c.en)
		})
	}

	it('uses the singular for one day', async () => {
		expect(text(await render(<PreChristmasReminderEmail name="Sam" leadDays={1} locale="en" />))).toContain('Christmas is in 1 day, Sam')
		expect(text(await render(<PreChristmasReminderEmail name="Sam" leadDays={1} locale="fr" />))).toContain('Noël est dans 1 jour')
	})

	it('greets a nameless account without a stray placeholder', async () => {
		expect(text(await render(<OrphanClaimEmail username={null} itemTitle="Scarf" listName="Wishes" locale="en" />))).toContain(
			'Hello there ,'
		)
		expect(text(await render(<OrphanClaimEmail username={null} itemTitle="Scarf" listName="Wishes" locale="fr" />))).toContain('Bonjour,')
	})
})
