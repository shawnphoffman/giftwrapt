import { Link } from '@tanstack/react-router'

export default function NotFound() {
	return (
		<div className="flex flex-col items-center justify-center min-h-screen">
			<h1 className="text-4xl font-bold mb-4">404: Not Found</h1>
			<p className="text-muted-foreground mb-8">The page you're looking for doesn't exist.</p>
			<Link to="/" className="text-primary hover:underline">
				Go back home
			</Link>
		</div>
	)
}
