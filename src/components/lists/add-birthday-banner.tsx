import { Link } from '@tanstack/react-router'
import { Cake } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

// Shown to the owner of a birthday or wishlist list when their profile has
// no birthday. Those lists reveal on the owner's birthday, so without one
// the reveal (and its email) never happens. Driven by
// `archiveInfo.notApplicableReason === 'owner-no-birthday'`.
export function AddBirthdayBanner() {
	return (
		<Alert>
			<Cake />
			<AlertTitle>Add your birthday to reveal gifts automatically</AlertTitle>
			<AlertDescription>
				<p>
					Claimed gifts on this list are revealed shortly after your birthday. Your profile has no birthday yet, so they will stay hidden.{' '}
					<Link to="/settings">Add your birthday</Link>
				</p>
			</AlertDescription>
		</Alert>
	)
}
