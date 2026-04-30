import { Link, useLocation } from '@tanstack/react-router'
import { LogOut, type LucideIcon, ShieldCheck, Smartphone, UserCircle, UserCog } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAppSetting } from '@/hooks/use-app-settings'
import { cn } from '@/lib/utils'

function navLinkClass(active: boolean) {
	return cn(buttonVariants({ variant: 'ghost' }), 'justify-start w-full gap-2', active && 'bg-muted text-foreground hover:bg-muted')
}

function NavIcon({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
	return <Icon className={cn('size-4', active && 'text-green-500')} />
}

export default function SettingsLinks() {
	const { pathname } = useLocation()
	const mobileAppEnabled = useAppSetting('enableMobileApp')

	const isProfile = pathname === '/settings'
	const isSecurity = pathname === '/settings/security'
	const isPermissions = pathname === '/settings/permissions'
	const isDevices = pathname === '/settings/devices'

	return (
		<>
			<Link to="/settings" className={navLinkClass(isProfile)}>
				<NavIcon icon={UserCircle} active={isProfile} />
				Profile
			</Link>
			<Link to="/settings/security" className={navLinkClass(isSecurity)}>
				<NavIcon icon={ShieldCheck} active={isSecurity} />
				Security
			</Link>
			<Link to="/settings/permissions" className={navLinkClass(isPermissions)}>
				<NavIcon icon={UserCog} active={isPermissions} />
				Permissions
			</Link>
			{mobileAppEnabled && (
				<Link to="/settings/devices" className={navLinkClass(isDevices)}>
					<NavIcon icon={Smartphone} active={isDevices} />
					Devices
				</Link>
			)}
			<Separator className="my-1" />
			<Link to="/sign-out" className={navLinkClass(false)}>
				<LogOut className="size-4" />
				Logout
			</Link>
		</>
	)
}
