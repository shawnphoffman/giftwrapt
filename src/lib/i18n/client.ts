import { isLocale } from '@/lib/i18n/locales'
import { LOCALE_STRATEGY } from '@/lib/i18n/strategy'
import { defineCustomClientStrategy } from '@/paraglide/runtime.js'

let installed = false

// Browser half of the locale strategy. The server has already decided the
// locale and rendered it into `<html lang>`; the client reads it from there
// instead of repeating the decision, so the two can never disagree.
//
// Storing a choice is the server's job (`updateUserLocale` saves it on the
// account and sets the cookie), so `setLocale` here does nothing. It must
// stay a no-op: Paraglide calls it with the resolved locale on first use, and
// writing the cookie then would pin "follow my browser" to whatever language
// the first page happened to render in.
export function installClientLocaleStrategy(): void {
	if (installed || typeof document === 'undefined') return
	installed = true
	defineCustomClientStrategy(LOCALE_STRATEGY, {
		getLocale: () => {
			const lang = document.documentElement.lang
			return isLocale(lang) ? lang : undefined
		},
		setLocale: () => {},
	})
}
