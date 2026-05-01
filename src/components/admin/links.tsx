import { Link, useLocation } from '@tanstack/react-router'
import { Bug, Database, Globe, HardDrive, KeyRound, Lock, Mail, ScanSearch, Sparkles, Users } from 'lucide-react'

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
	const oidcEnabled = useAppSetting('enableOidcProvider')

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
			<Link to="/admin/ai" className={navLinkClass(pathname === '/admin/ai')}>
				<Sparkles />
				AI
			</Link>
			<Link to="/admin/scraping" className={navLinkClass(pathname === '/admin/scraping')}>
				<Globe />
				Scraping
			</Link>
			<Link to="/admin/scrapes" className={navLinkClass(pathname === '/admin/scrapes')}>
				<ScanSearch />
				Scrapes
			</Link>
			<Link to="/admin/users" className={navLinkClass(pathname === '/admin/users' || pathname.startsWith('/admin/user/'))}>
				<Users />
				Users
			</Link>
			<Link to="/admin/data" className={navLinkClass(pathname === '/admin/data')}>
				<Database />
				Data
			</Link>
			{oidcEnabled && (
				<Link to="/admin/oidc" className={navLinkClass(pathname === '/admin/oidc')}>
					<KeyRound />
					OIDC
				</Link>
			)}
			{storageConfigured && (
				<Link to="/admin/storage" className={navLinkClass(pathname === '/admin/storage')}>
					<HardDrive />
					Storage
				</Link>
			)}
			<Link to="/admin/debug" className={navLinkClass(pathname === '/admin/debug')}>
				<Bug />
				Debug
			</Link>
		</>
	)
}
