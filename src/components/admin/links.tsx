import { Link, useLocation } from '@tanstack/react-router'
import { Barcode, Bug, CalendarClock, Database, Globe, HardDrive, Lock, Mail, ShieldCheck, Sparkles, Users } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { useAppSetting } from '@/hooks/use-app-settings'
import { useStorageStatus } from '@/hooks/use-storage-status'
import { cn } from '@/lib/utils'

function navLinkClass(active: boolean) {
	return cn(buttonVariants({ variant: 'ghost' }), 'justify-start w-full', active && 'bg-muted text-foreground hover:bg-muted')
}

export default function AdminLinks() {
	const { pathname } = useLocation()
	const { configured: storageConfigured } = useStorageStatus()
	// Barcode lookup is consumed exclusively by the mobile companion
	// app. Hide the admin page when the deployment doesn't ship that
	// feature; the page itself also redirects (see route file).
	const mobileAppEnabled = useAppSetting('enableMobileApp')

	return (
		<>
			<Link to="/admin" className={navLinkClass(pathname === '/admin')}>
				<Lock />
				General
			</Link>
			<Link to="/admin/email" className={navLinkClass(pathname === '/admin/email')}>
				<Mail />
				Email
			</Link>
			<Link to="/admin/auth" className={navLinkClass(pathname === '/admin/auth')}>
				<ShieldCheck />
				Auth
			</Link>
			<Link to="/admin/users" className={navLinkClass(pathname === '/admin/users' || pathname.startsWith('/admin/user/'))}>
				<Users />
				Users
			</Link>
			{storageConfigured && (
				<Link to="/admin/storage" className={navLinkClass(pathname === '/admin/storage')}>
					<HardDrive />
					Storage
				</Link>
			)}
			<Link to="/admin/scraping" className={navLinkClass(pathname === '/admin/scraping')}>
				<Globe />
				Scraping
			</Link>
			<Link to="/admin/ai" className={navLinkClass(pathname === '/admin/ai')}>
				<Sparkles />
				AI
			</Link>
			<Link to="/admin/data" className={navLinkClass(pathname === '/admin/data')}>
				<Database />
				Import / Export
			</Link>
			<Link to="/admin/scheduling" className={navLinkClass(pathname === '/admin/scheduling')}>
				<CalendarClock />
				Scheduling
			</Link>
			{mobileAppEnabled && (
				<Link to="/admin/barcode" className={navLinkClass(pathname === '/admin/barcode')}>
					<Barcode />
					Barcode
				</Link>
			)}
			<Link to="/admin/debug" className={navLinkClass(pathname === '/admin/debug')}>
				<Bug />
				Debug
			</Link>
		</>
	)
}
