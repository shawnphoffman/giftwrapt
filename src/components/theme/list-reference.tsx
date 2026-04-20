import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import BirthdayBadge from '../common/birthday-badge'
import UserAvatar from '../common/user-avatar'

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
	return (
		<section className="flex flex-col gap-3">
			<div>
				<h4 className="font-semibold">{title}</h4>
				{description && <p className="text-sm text-muted-foreground">{description}</p>}
			</div>
			{children}
		</section>
	)
}

export default function ListReference() {
	return (
		<div className="flex flex-col gap-10">
			<Section title="Card + Lists" description="TBD">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<Card className="py-4 gap-2 flex flex-col">
						<CardHeader className="px-4 flex items-center gap-3">
							<UserAvatar name="Test" />
							<CardTitle className="text-2xl font-semibold leading-none tracking-tight">Test</CardTitle>
							<BirthdayBadge birthMonth={'april'} birthDay={15} />
						</CardHeader>
						<CardContent className="px-4">
							<div className="text-sm text-muted-foreground bg-background/25 border border-dashed rounded px-2 py-1 italic">No lists</div>
						</CardContent>
					</Card>
				</div>
			</Section>
		</div>
	)
}
