import { createFileRoute } from '@tanstack/react-router'

import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import ThemeReference from '@/components/theme/theme-reference'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

export const Route = createFileRoute('/(core)/admin/test')({
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<Card className="animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">Theme Reference</CardTitle>
				<p className="text-sm text-muted-foreground">
					Every semantic color token, radius, and common component rendered side-by-side. Swap light and dark mode to verify contrast.
				</p>
			</CardHeader>
			<CardContent className="flex flex-col gap-10">
				<ThemeReference />
				<Separator />
				<section className="flex flex-col gap-3">
					<div>
						<h4 className="font-semibold">App loading skeleton</h4>
						<p className="text-sm text-muted-foreground">The full-page loading placeholder used during route transitions.</p>
					</div>
					<LoadingSkeleton />
				</section>
			</CardContent>
		</Card>
	)
}
