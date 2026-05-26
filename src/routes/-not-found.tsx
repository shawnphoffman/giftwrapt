import { Link } from '@tanstack/react-router'
import { PackageOpen } from 'lucide-react'

import { Button } from '@/components/ui/button'

const QUIPS = [
	"This gift isn't on any list.",
	'Looks like someone unwrapped this URL early.',
	'We searched every list. This page was on none of them.',
	"That link's been re-gifted one too many times.",
	'Empty box. Nothing inside but a 404 and a little tissue paper.',
]

export default function NotFound() {
	const quip = QUIPS[Math.floor(Math.random() * QUIPS.length)]

	return (
		<div className="flex flex-1 flex-col items-center justify-center self-stretch min-h-[60vh] p-4">
			<div className="max-w-md space-y-6 text-center">
				<div className="flex items-center justify-center gap-4">
					<PackageOpen className="size-16 text-muted-foreground shrink-0" strokeWidth={1.5} />
					<span className="text-6xl font-extrabold tracking-tight text-destructive select-none">404</span>
				</div>
				<div className="space-y-2">
					<h1 className="text-2xl font-bold">Not on the list</h1>
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
