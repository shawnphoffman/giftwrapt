import { HatGlasses } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { authClient, useSession } from '@/lib/auth-client'
import { authErrorText, errorText } from '@/lib/i18n/errors'
import { forgetSkeletonShapes } from '@/lib/skullet'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

export default function StopImpersonationLink() {
	const { data: session } = useSession()
	const [isStopping, setIsStopping] = useState(false)

	// Check if currently impersonating - session should have impersonatedBy field
	const isImpersonating = Boolean(session?.session.impersonatedBy)

	if (!isImpersonating) {
		return null
	}

	const handleStopImpersonating = async () => {
		try {
			setIsStopping(true)
			const result = await authClient.admin.stopImpersonating()

			if (result.error) {
				toast.error(authErrorText(result.error, m.impersonation_stop_failed()))
			} else {
				toast.success(m.impersonation_stopped())
				forgetSkeletonShapes()
				// Reload the page to reflect the new session
				window.location.href = '/'
			}
		} catch (error) {
			toast.error(errorText(error, m.impersonation_stop_failed()))
		} finally {
			setIsStopping(false)
		}
	}

	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				onClick={handleStopImpersonating}
				disabled={isStopping}
				className={cn('text-base font-medium bg-destructive hover:bg-destructive/75 text-destructive-foreground')}
			>
				<HatGlasses />
				<span>{isStopping ? m.impersonation_stopping() : m.impersonation_stop()}</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	)
}
