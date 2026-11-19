import { useHydrated } from '@tanstack/react-router'
import { useState } from 'react'

import { updateUserLocale } from '@/api/user'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { type Locale, localeDisplayName, matchLocale, offeredLocales, readLocaleCookie } from '@/lib/i18n/locales'
import { m } from '@/paraglide/messages.js'

// What the picker holds: a locale, or 'auto' for "follow my browser".
export type LanguageChoice = Locale | 'auto'

const AUTO = 'auto' as const

type LanguageSettingsContentProps = {
	locales: ReadonlyArray<Locale>
	// Null until the stored choice is known (it lives in a cookie, which the
	// server render does not look at).
	value: LanguageChoice | null
	onChange: (choice: LanguageChoice) => void
	busy?: boolean
	error?: string | null
}

export function LanguageSettingsContent({ locales, value, onChange, busy = false, error = null }: LanguageSettingsContentProps) {
	return (
		<section className="space-y-3">
			<div>
				<h2 id="language-label" className="text-lg font-semibold">
					{m.settings_language_title()}
				</h2>
				<p className="text-sm text-muted-foreground">{m.settings_language_description()}</p>
			</div>
			<Select value={value ?? undefined} onValueChange={next => onChange(next as LanguageChoice)} disabled={busy || value === null}>
				<SelectTrigger aria-labelledby="language-label" className="w-56">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={AUTO}>{m.settings_language_automatic()}</SelectItem>
					{locales.map(locale => (
						// A language is listed under its own name, whatever the
						// current language is, so it can always be found.
						<SelectItem key={locale} value={locale} lang={locale}>
							{localeDisplayName(locale)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{error && <p className="text-sm text-destructive">{error}</p>}
		</section>
	)
}

/**
 * The language picker (plan 36b). The choice is saved on the account, because
 * emails are written in it, and mirrored in the `gw-locale` cookie the server
 * reads on every request; the page then reloads in the new language. With no
 * choice stored ("Match My Browser") there is no cookie at all.
 *
 * Renders nothing while only one language is offered.
 */
export function LanguageSettings() {
	const hydrated = useHydrated()
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	if (offeredLocales().length < 2) return null

	const stored = hydrated ? (matchLocale(readLocaleCookie(document.cookie)) ?? AUTO) : null

	async function choose(choice: LanguageChoice) {
		setBusy(true)
		setError(null)
		try {
			const result = await updateUserLocale({ data: { locale: choice === AUTO ? null : choice } })
			if (result.kind === 'error') throw new Error(result.reason)
			// The server saved the choice and updated the cookie it reads on
			// every request; a reload renders the page in the new language.
			window.location.reload()
		} catch {
			setError(m.settings_language_error())
			setBusy(false)
		}
	}

	return (
		<LanguageSettingsContent locales={offeredLocales()} value={stored} onChange={choice => void choose(choice)} busy={busy} error={error} />
	)
}
