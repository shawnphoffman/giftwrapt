import { Link } from '@tanstack/react-router'

import { SidebarMenuButton } from '@/components/ui/sidebar'
import { BUILD_INFO } from '@/lib/build-info'
import { m } from '@/paraglide/messages.js'

// Quiet link to the changelog, labelled with the running version. Uses the
// sidebar button for a full-row tap target but keeps the small muted text.
export default function NavVersionLink() {
	return (
		<SidebarMenuButton asChild className="h-9 text-xs text-muted-foreground hover:text-foreground data-[status=active]:text-foreground">
			<Link to="/changelog">
				<span>
					{/* eslint-disable-next-line i18next/no-literal-string -- the "v" of a version number */}
					<span className="tabular-nums">v{BUILD_INFO.version}</span> · {m.nav_whats_new()}
				</span>
			</Link>
		</SidebarMenuButton>
	)
}
