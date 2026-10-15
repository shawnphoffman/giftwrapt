// Text size setting (plan 30c).
//
// One root font size scales the whole app, because every size is in rem.
// The chosen step lives in a per-device cookie, never on the account: a phone
// and a desktop want different sizes. The root loader reads it on the server
// and the shell applies it as an inline style on <html>, so the first paint is
// already at the chosen size, with or without JavaScript.

/** The cookie holding the step's percentage, e.g. `112.5`. */
export const TEXT_SIZE_COOKIE = 'gw-text-size'

/** One year; the setting is a device preference, not a session. */
export const TEXT_SIZE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** The slider's steps, as a percent of the browser's own font size. */
export const TEXT_SIZE_STEPS = [90, 95, 100, 112.5, 125] as const

export type TextSize = (typeof TEXT_SIZE_STEPS)[number]

export const DEFAULT_TEXT_SIZE: TextSize = 100

/** What the slider shows under itself for each step. */
export const TEXT_SIZE_NAMES: Record<TextSize, string> = {
	90: 'Smaller',
	95: 'Small',
	100: 'Default',
	112.5: 'Large',
	125: 'Larger',
}

/** A cookie value to a step. Anything that is not exactly a step reads as 100. */
export function parseTextSize(value: string | null | undefined): TextSize {
	if (value == null) return DEFAULT_TEXT_SIZE
	const trimmed = value.trim()
	if (!/^\d+(\.\d+)?$/.test(trimmed)) return DEFAULT_TEXT_SIZE
	const n = Number(trimmed)
	return TEXT_SIZE_STEPS.find(step => step === n) ?? DEFAULT_TEXT_SIZE
}

/**
 * The size a request renders at. The only input today is the cookie; this is
 * the seam where the iOS web tab's Dynamic Type mapping (30d) will take over
 * when `embedded` is true.
 */
export function resolveTextSize({ cookie }: { cookie: string | null | undefined; embedded: boolean }): TextSize {
	return parseTextSize(cookie)
}

/**
 * The inline style for <html>. Nothing at the default, so the page renders
 * exactly as it did before the setting existed.
 */
export function textSizeStyle(size: TextSize): { fontSize: string } | undefined {
	return size === DEFAULT_TEXT_SIZE ? undefined : { fontSize: `${size}%` }
}

/** The cookie's value in `document.cookie`, or null. */
export function readTextSizeCookie(cookieHeader: string): string | null {
	for (const part of cookieHeader.split(';')) {
		const [name, ...rest] = part.trim().split('=')
		if (name === TEXT_SIZE_COOKIE) return decodeURIComponent(rest.join('='))
	}
	return null
}

/** Store the step on this device and apply it to the open page. */
export function applyTextSize(size: TextSize): void {
	const secure = window.location.protocol === 'https:' ? '; Secure' : ''
	if (size === DEFAULT_TEXT_SIZE) {
		document.cookie = `${TEXT_SIZE_COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`
	} else {
		document.cookie = `${TEXT_SIZE_COOKIE}=${size}; path=/; max-age=${TEXT_SIZE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`
	}
	document.documentElement.style.fontSize = textSizeStyle(size)?.fontSize ?? ''
}
