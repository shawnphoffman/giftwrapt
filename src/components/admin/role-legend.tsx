import { ChevronDown } from 'lucide-react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

// Replaces the inline role tooltip from create/edit user forms - tooltips
// were getting clipped by the dialog content overflow. A collapsible
// legend lives in the form flow itself, so it can't escape the layout.
export function RoleLegend() {
	return (
		<Collapsible className="-mt-1">
			<CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
				<ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" />
				What do these roles mean?
			</CollapsibleTrigger>
			<CollapsibleContent className="text-xs text-muted-foreground pt-2 space-y-2">
				<div>
					<span className="font-semibold text-foreground">User:</span> the default role. Has their own lists, can claim gifts on others'
					lists, and manages their own profile.
				</div>
				<div>
					<span className="font-semibold text-foreground">Admin:</span> everything a User can do, plus access to this admin area. Admins can
					create users and dependents, change permissions, impersonate other users, and run the import and export tools.
				</div>
				<div>
					<span className="font-semibold text-foreground">Child:</span> an account the child signs in to themselves, managed by one or more
					guardians. They can own lists but can't claim gifts on others' lists, can't be a partner, and can't be a guardian themselves.
				</div>
			</CollapsibleContent>
		</Collapsible>
	)
}
