import { createFileRoute, redirect } from '@tanstack/react-router'

type ImportSearch = { url?: string }

const isHttpUrlString = (raw: unknown): raw is string => {
	if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2000) return false
	try {
		const parsed = new URL(raw)
		return parsed.protocol === 'http:' || parsed.protocol === 'https:'
	} catch {
		return false
	}
}

export const Route = createFileRoute('/(core)/import')({
	validateSearch: (search: Record<string, unknown>): ImportSearch => {
		return isHttpUrlString(search.url) ? { url: search.url } : {}
	},
	beforeLoad: ({ search }) => {
		throw redirect({ to: '/me', search: search.url ? { url: search.url } : {} })
	},
})
