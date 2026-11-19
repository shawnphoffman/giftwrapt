import { ChevronDown } from 'lucide-react'

import { RichMessage } from '@/components/common/rich-message'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { m } from '@/paraglide/messages.js'

// The name of a role as a person reads it.
export function roleLabel(role: string): string {
	switch (role) {
		case 'admin':
			return m.shared_role_admin()
		case 'user':
			return m.shared_role_user()
		case 'child':
			return m.shared_role_child()
		default:
			return role.charAt(0).toUpperCase() + role.slice(1)
	}
}

// Replaces the inline role tooltip from create/edit user forms - tooltips
// were getting clipped by the dialog content overflow. A collapsible
// legend lives in the form flow itself, so it can't escape the layout.
export function RoleLegend() {
	return (
		<Collapsible className="-mt-1">
			<CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
				<ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" />
				{m.admin_perms_role_legend_trigger()}
			</CollapsibleTrigger>
			<CollapsibleContent className="text-xs text-muted-foreground pt-2 space-y-2">
				<div>
					<RichMessage
						parts={m.admin_perms_role_legend_user.parts()}
						tags={{ strong: c => <span className="font-semibold text-foreground">{c}</span> }}
					/>
				</div>
				<div>
					<RichMessage
						parts={m.admin_perms_role_legend_admin.parts()}
						tags={{ strong: c => <span className="font-semibold text-foreground">{c}</span> }}
					/>
				</div>
				<div>
					<RichMessage
						parts={m.admin_perms_role_legend_child.parts()}
						tags={{ strong: c => <span className="font-semibold text-foreground">{c}</span> }}
					/>
				</div>
			</CollapsibleContent>
		</Collapsible>
	)
}
