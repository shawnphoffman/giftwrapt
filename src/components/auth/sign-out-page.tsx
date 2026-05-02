import Loading from '@/components/loading'

export type SignOutPageContentProps = {
	error?: string | null
}

export function SignOutPageContent({ error = null }: SignOutPageContentProps) {
	if (error) {
		return (
			<div className="flex items-center justify-center min-h-[calc(100vh-3rem)] p-4">
				<div className="text-center space-y-4">
					<p className="text-destructive">{error}</p>
					<p className="text-sm text-muted-foreground">Redirecting to sign in...</p>
				</div>
			</div>
		)
	}

	return (
		<div className="flex items-center justify-center min-h-[calc(100vh-3rem)] p-4">
			<div className="text-center space-y-4">
				<Loading className="mx-auto text-primary" />
				<p className="text-muted-foreground">Signing out...</p>
			</div>
		</div>
	)
}
