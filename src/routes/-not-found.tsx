import { Link, useLocation } from '@tanstack/react-router'
import { PackageOpen } from 'lucide-react'

import { Button } from '@/components/ui/button'

const QUIPS = [
	"This gift isn't on any list.",
	'Looks like someone unwrapped this URL early.',
	'We searched every list. This page was on none of them.',
	"That link's been re-gifted one too many times.",
	'Empty box. Nothing inside but a 404 and a little tissue paper.',
]

// The quip is picked from the address, not at random: a random pick differs
// between the server render and the browser, which React reports as a
// hydration error on every 404.
function quipFor(pathname: string): string {
	let hash = 0
	for (let i = 0; i < pathname.length; i++) hash = (hash * 31 + pathname.charCodeAt(i)) >>> 0
	return QUIPS[hash % QUIPS.length]
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
					<h1 className="text-2xl font-bold">Not on the List</h1>
					<p className="text-muted-foreground">{quip}</p>
				</div>
				<div className="flex gap-2 justify-center">
					<Button asChild>
						<Link to="/">Take me home</Link>
					</Button>
					<Button asChild variant="outline">
						<Link to="/me">My lists</Link>
					</Button>
				</div>
			</div>
		</div>
	)
}
