// A first name that is safe to put in an AI prompt. Display names fall
// back to the email address when a user never set a name, and several AI
// features promise the provider never sees an email, so anything that
// looks like one becomes the fallback instead.

export function safeFirstName(name: string | null | undefined, fallback: string): string {
	const trimmed = (name ?? '').trim()
	if (!trimmed || trimmed.includes('@')) return fallback
	return trimmed.split(/\s+/u)[0]
}
