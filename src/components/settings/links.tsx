import { Link, useLocation } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAppSetting } from '@/hooks/use-app-settings'
import { cn } from '@/lib/utils'

function navLinkClass(active: boolean) {
	return cn(buttonVariants({ variant: 'ghost' }), 'justify-start w-full', active && 'bg-muted text-foreground hover:bg-muted')
}

export default function SettingsLinks() {
	const { pathname } = useLocation()
	const mobileAppEnabled = useAppSetting('enableMobileApp')

	return (
		<>
			<Link to="/settings" className={navLinkClass(pathname === '/settings')}>
				Profile
			</Link>
			<Link to="/settings/security" className={navLinkClass(pathname === '/settings/security')}>
				Security
			</Link>
			<Link to="/settings/permissions" className={navLinkClass(pathname === '/settings/permissions')}>
				Permissions
			</Link>
			{mobileAppEnabled && (
				<Link to="/settings/devices" className={navLinkClass(pathname === '/settings/devices')}>
					Devices
				</Link>
			)}
			<Separator className="my-1" />
			<Link to="/sign-out" className={navLinkClass(false)}>
				<LogOut />
				Logout
			</Link>
		</>
	)
}
