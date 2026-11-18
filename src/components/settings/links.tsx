import { Link, useLocation } from '@tanstack/react-router'
import { ALargeSmall, LogOut, type LucideIcon, Plug, ShieldCheck, Smartphone, Sprout, UserCircle, UserCog } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAppSetting } from '@/hooks/use-app-settings'
import { useEmbedded } from '@/hooks/use-embedded'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

function navLinkClass(active: boolean) {
	return cn(buttonVariants({ variant: 'ghost' }), 'justify-start w-full gap-2', active && 'bg-muted text-foreground hover:bg-muted')
}

function NavIcon({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
	return <Icon className={cn('size-4', active && 'text-green-500')} />
}

export default function SettingsLinks() {
	const { pathname } = useLocation()
	const mobileAppEnabled = useAppSetting('enableMobileApp')
	const mcpEnabled = useAppSetting('enableMcp')
	// Inside the iOS web tab the native Settings tab owns sign-out: it ends
	// the server session and clears the web view's data store (plan 28).
	const embedded = useEmbedded()

	const isProfile = pathname === '/settings'
	const isSecurity = pathname === '/settings/security'
	const isPermissions = pathname === '/settings/permissions'
	const isDevices = pathname === '/settings/devices'
	const isConnectedApps = pathname === '/settings/connected-apps'
	const isDependents = pathname.startsWith('/settings/dependents')
	const isAppearance = pathname === '/settings/appearance'

	return (
		<>
			<Link to="/settings" className={navLinkClass(isProfile)}>
				<NavIcon icon={UserCircle} active={isProfile} />
				{m.settings_profile_title()}
			</Link>
			<Link to="/settings/security" className={navLinkClass(isSecurity)}>
				<NavIcon icon={ShieldCheck} active={isSecurity} />
				{m.page_security()}
			</Link>
			<Link to="/settings/permissions" className={navLinkClass(isPermissions)}>
				<NavIcon icon={UserCog} active={isPermissions} />
				{m.page_permissions()}
			</Link>
			<Link to="/settings/dependents" className={navLinkClass(isDependents)}>
				<NavIcon icon={Sprout} active={isDependents} />
				{m.page_dependents()}
			</Link>
			<Link to="/settings/appearance" className={navLinkClass(isAppearance)}>
				<NavIcon icon={ALargeSmall} active={isAppearance} />
				{m.page_appearance()}
			</Link>
			{mobileAppEnabled && (
				<Link to="/settings/devices" className={navLinkClass(isDevices)}>
					<NavIcon icon={Smartphone} active={isDevices} />
					{m.page_devices()}
				</Link>
			)}
			{mcpEnabled && (
				<Link to="/settings/connected-apps" className={navLinkClass(isConnectedApps)}>
					<NavIcon icon={Plug} active={isConnectedApps} />
					{m.page_connected_apps()}
				</Link>
			)}
			{!embedded && (
				<>
					<Separator className="my-1" />
					<Link to="/sign-out" className={navLinkClass(false)}>
						<LogOut className="size-4" />
						{m.settings_nav_logout()}
					</Link>
				</>
			)}
		</>
	)
}
