import { Link, useLocation } from '@tanstack/react-router'
import { PackageOpen } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { m } from '@/paraglide/messages.js'

// Functions, not strings: the array is built at module level, before any
// request has a language.
const QUIPS: ReadonlyArray<() => string> = [
	() => m.not_found_quip_1(),
	() => m.not_found_quip_2(),
	() => m.not_found_quip_3(),
	() => m.not_found_quip_4(),
	() => m.not_found_quip_5(),
]

// The quip is picked from the address, not at random: a random pick differs
// between the server render and the browser, which React reports as a
// hydration error on every 404.
function quipFor(pathname: string): string {
	let hash = 0
	for (let i = 0; i < pathname.length; i++) hash = (hash * 31 + pathname.charCodeAt(i)) >>> 0
	return QUIPS[hash % QUIPS.length]()
}

export default function NotFound() {
	const quip = quipFor(useLocation().pathname)

	return (
		<div className="flex flex-1 flex-col items-center justify-center self-stretch min-h-[60vh] p-4">
			<div className="max-w-md space-y-6 text-center">
				<div className="flex items-center justify-center gap-4">
					<PackageOpen className="size-16 text-muted-foreground shrink-0" strokeWidth={1.5} />
					<span className="text-6xl font-extrabold tracking-tight text-destructive select-none">404</span>
				</div>
				<div className="space-y-2">
					<h1 className="text-2xl font-bold">{m.not_found_title()}</h1>
					<p className="text-muted-foreground">{quip}</p>
				</div>
				<div className="flex gap-2 justify-center">
					<Button asChild>
						<Link to="/">{m.not_found_home()}</Link>
					</Button>
					<Button asChild variant="outline">
						<Link to="/me">{m.nav_my_lists()}</Link>
					</Button>
				</div>
			</div>
		</div>
	)
}
