import { Link } from '@tanstack/react-router'

import { BUILD_INFO } from '@/lib/build-info'

// Quiet footer link to the changelog, labelled with the running version.
export default function NavVersionLink() {
	return (
		<Link
			to="/changelog"
			className="px-2 text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-4 group-data-[collapsible=icon]:hidden"
		>
			<span className="tabular-nums">v{BUILD_INFO.version}</span> · What's new
		</Link>
	)
}
