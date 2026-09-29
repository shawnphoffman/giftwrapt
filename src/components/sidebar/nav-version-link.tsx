import { Link } from '@tanstack/react-router'

import { SidebarMenuButton } from '@/components/ui/sidebar'
import { BUILD_INFO } from '@/lib/build-info'

// Quiet link to the changelog, labelled with the running version. Uses the
// sidebar button for a full-row tap target but keeps the small muted text.
export default function NavVersionLink() {
	return (
		<SidebarMenuButton asChild className="h-9 text-xs text-muted-foreground hover:text-foreground data-[status=active]:text-foreground">
			<Link to="/changelog">
				<span>
					<span className="tabular-nums">v{BUILD_INFO.version}</span> · What's new
				</span>
			</Link>
		</SidebarMenuButton>
	)
}
