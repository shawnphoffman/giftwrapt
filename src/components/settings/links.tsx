import { Link, useLocation } from '@tanstack/react-router'
import { Gift, LogOut, Receipt } from 'lucide-react'

import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export default function SettingsLinks() {
	const location = useLocation()
	const pathname = location.pathname

	const passiveClasses = ''
	const activeClasses = 'font-semibold text-primary'
	const iconClasses = 'flex flex-row items-center gap-1'

	return (
		<>
			<Link to="/settings" className={pathname === '/settings' ? activeClasses : ''}>
				Profile
			</Link>
			<Link to="/settings/security" className={pathname === '/settings/security' ? activeClasses : ''}>
				Security
			</Link>
			<Link to="/settings/permissions" className={pathname === '/settings/permissions' ? activeClasses : ''}>
				Permissions
			</Link>
			<Link to="/settings/connections" className={pathname === '/settings/connections' ? activeClasses : ''}>
				Connections
			</Link>
			<Separator />
			<Link to="/settings/purchases" className={cn(pathname === '/settings/purchases' ? activeClasses : '', passiveClasses, iconClasses)}>
				<Receipt size={16} />
				Purchases
			</Link>
			<Link to="/settings/received" className={cn(pathname === '/settings/received' ? activeClasses : '', passiveClasses, iconClasses)}>
				<Gift size={16} />
				Received Gifts
			</Link>
			<Separator />
			<Link to="/sign-out" className={iconClasses}>
				<LogOut size={16} />
				Logout
			</Link>
		</>
	)
}
