import { Link } from '@tanstack/react-router'
import { Cake } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

// Shown on the edit view of a birthday or wishlist list whose recipient has
// no birthday: the owner (their profile has none) or the dependent the list
// is for. Those lists reveal on the recipient's birthday, so without one the
// reveal (and its email) never happens. Driven by
// `archiveInfo.notApplicableReason`.
export function AddBirthdayBanner({ dependentName = null }: { dependentName?: string | null }) {
	const who = dependentName ? `${dependentName}'s` : 'your'
	return (
		<Alert>
			<Cake />
			<AlertTitle>Add {who} birthday to reveal gifts automatically</AlertTitle>
			<AlertDescription>
				<p>
					Claimed gifts on this list are revealed shortly after {who} birthday.{' '}
					{dependentName ? `${dependentName} has no birthday set yet` : 'Your profile has no birthday yet'}, so they will stay hidden.{' '}
					{dependentName ? (
						<Link to="/settings/dependents">Add {dependentName}&apos;s birthday</Link>
					) : (
						<Link to="/settings">Add your birthday</Link>
					)}
				</p>
			</AlertDescription>
		</Alert>
	)
}
