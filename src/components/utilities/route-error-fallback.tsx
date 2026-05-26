import { Link } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { formatErrorForUser } from '@/lib/format-error'

interface RouteErrorFallbackProps {
	error: unknown
	reset?: () => void
	title?: string
	className?: string
}

export function RouteErrorFallback({ error, reset, title, className }: RouteErrorFallbackProps) {
	const formatted = formatErrorForUser(error)
	const heading = title ?? formatted.title

	return (
		<div className={className ?? 'flex flex-col items-center justify-center min-h-[400px] p-4 w-full'}>
			<div className="max-w-md space-y-4 text-center">
				<h2 className="text-lg font-semibold text-destructive">{heading}</h2>
				<p className="text-sm text-muted-foreground">{formatted.body}</p>
				{process.env.NODE_ENV === 'development' && error instanceof Error && error.stack ? (
					<details className="text-left text-xs text-muted-foreground/70">
						<summary className="cursor-pointer">Stack (dev only)</summary>
						<pre className="overflow-auto whitespace-pre-wrap break-all">{error.stack}</pre>
					</details>
				) : null}
				<div className="flex gap-2 justify-center">
					{reset ? (
						<Button onClick={reset} size="sm">
							Try again
						</Button>
					) : null}
					<Button asChild variant="outline" size="sm">
						<Link to="/" onClick={reset}>
							Go home
						</Link>
					</Button>
				</div>
			</div>
		</div>
	)
}
