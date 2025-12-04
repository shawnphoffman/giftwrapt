import { HatGlasses } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { authClient, useSession } from '@/lib/auth-client'
import { cn } from '@/lib/utils'

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
				toast.error(result.error.message || 'Failed to stop impersonation')
			} else {
				toast.success('Stopped impersonating')
				// Reload the page to reflect the new session
				window.location.href = '/'
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to stop impersonation')
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
				<span>{isStopping ? 'Stopping...' : 'Stop Impersonating'}</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	)
}
