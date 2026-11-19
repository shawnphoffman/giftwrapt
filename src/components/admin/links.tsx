import { Link, useLocation } from '@tanstack/react-router'
import { Barcode, Bug, CalendarClock, Database, Eye, Globe, HardDrive, Lock, Mail, Plug, ShieldCheck, Sparkles, Users } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { useAppSetting } from '@/hooks/use-app-settings'
import { useStorageStatus } from '@/hooks/use-storage-status'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

function navLinkClass(active: boolean) {
	// A label longer than the column wraps onto a second line, tight to the
	// first, instead of spilling over the page beside it (French labels do).
	return cn(
		buttonVariants({ variant: 'ghost' }),
		'justify-start w-full h-auto min-h-9 py-1.5 text-left leading-tight whitespace-normal',
		active && 'bg-muted text-foreground hover:bg-muted'
	)
}

export default function AdminLinks() {
	const { pathname } = useLocation()
	const { configured: storageConfigured } = useStorageStatus()
	// Barcode lookup is consumed exclusively by the mobile companion
	// app. Hide the admin page when the deployment doesn't ship that
	// feature; the page itself also redirects (see route file).
	const mobileAppEnabled = useAppSetting('enableMobileApp')
	// Same pattern for the MCP server: hidden until an admin turns it on;
	// the route file redirects as the backstop.
	const mcpEnabled = useAppSetting('enableMcp')

	return (
		<>
			<Link to="/admin" className={navLinkClass(pathname === '/admin')}>
				<Lock />
				{m.admin_nav_general()}
			</Link>
			<Link to="/admin/email" className={navLinkClass(pathname === '/admin/email')}>
				<Mail />
				{m.admin_nav_email()}
			</Link>
			<Link to="/admin/auth" className={navLinkClass(pathname === '/admin/auth')}>
				<ShieldCheck />
				{m.admin_nav_auth()}
			</Link>
			<Link to="/admin/users" className={navLinkClass(pathname === '/admin/users' || pathname.startsWith('/admin/user/'))}>
				<Users />
				{m.admin_nav_users()}
			</Link>
			{storageConfigured && (
				<Link to="/admin/storage" className={navLinkClass(pathname === '/admin/storage')}>
					<HardDrive />
					{m.admin_nav_storage()}
				</Link>
			)}
			<Link to="/admin/scraping" className={navLinkClass(pathname === '/admin/scraping')}>
				<Globe />
				{m.admin_nav_scraping()}
			</Link>
			<Link to="/admin/ai" className={navLinkClass(pathname === '/admin/ai')}>
				<Sparkles />
				{m.admin_nav_ai()}
			</Link>
			<Link to="/admin/data" className={navLinkClass(pathname === '/admin/data')}>
				<Database />
				{m.admin_nav_data()}
			</Link>
			<Link to="/admin/reveals" className={navLinkClass(pathname === '/admin/reveals')}>
				<Eye />
				{m.admin_nav_reveals()}
			</Link>
			<Link to="/admin/scheduling" className={navLinkClass(pathname === '/admin/scheduling')}>
				<CalendarClock />
				{m.admin_nav_scheduling()}
			</Link>
			{mobileAppEnabled && (
				<Link to="/admin/barcode" className={navLinkClass(pathname === '/admin/barcode')}>
					<Barcode />
					{m.admin_nav_barcode()}
				</Link>
			)}
			{mcpEnabled && (
				<Link to="/admin/mcp" className={navLinkClass(pathname === '/admin/mcp')}>
					<Plug />
					{m.admin_nav_mcp()}
				</Link>
			)}
			<Link to="/admin/debug" className={navLinkClass(pathname === '/admin/debug')}>
				<Bug />
				{m.admin_nav_debug()}
			</Link>
		</>
	)
}
