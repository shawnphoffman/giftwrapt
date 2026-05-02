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
					<span className="font-semibold text-foreground">User</span> &mdash; the default. Has lists, can claim gifts on others' lists,
					manages their own profile.
				</div>
				<div>
					<span className="font-semibold text-foreground">Admin</span> &mdash; everything a User can do, plus access to this admin area:
					create users and dependents, change permissions, impersonate, run the import / export tools.
				</div>
				<div>
					<span className="font-semibold text-foreground">Child</span> &mdash; a user-controlled account managed by one or more guardians.
					They can own lists but can't claim gifts on others' lists, can't be a partner, and can't be a guardian themselves.
				</div>
			</CollapsibleContent>
		</Collapsible>
	)
}
