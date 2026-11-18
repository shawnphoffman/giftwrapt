import { Link } from '@tanstack/react-router'
import { Cake } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { m } from '@/paraglide/messages.js'

// Shown on the edit view of a birthday or wishlist list whose recipient has
// no birthday: the owner (their profile has none) or the dependent the list
// is for. Those lists reveal on the recipient's birthday, so without one the
// reveal (and its email) never happens. Driven by
// `archiveInfo.notApplicableReason`.
export function AddBirthdayBanner({ dependentName = null }: { dependentName?: string | null }) {
	return (
		<Alert>
			<Cake />
			<AlertTitle>
				{dependentName ? m.lists_birthday_banner_title_dependent({ name: dependentName }) : m.lists_birthday_banner_title_own()}
			</AlertTitle>
			<AlertDescription>
				<p>
					{dependentName ? m.lists_birthday_banner_body_dependent({ name: dependentName }) : m.lists_birthday_banner_body_own()}{' '}
					{dependentName ? (
						<Link to="/settings/dependents">{m.lists_birthday_banner_link_dependent({ name: dependentName })}</Link>
					) : (
						<Link to="/settings">{m.lists_birthday_banner_link_own()}</Link>
					)}
				</p>
			</AlertDescription>
		</Alert>
	)
}
