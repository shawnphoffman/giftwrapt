import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Ban, Heart, KeyRound, MailCheck, MailWarning, ShieldCheck } from 'lucide-react'

import { getUsersAsAdmin } from '@/api/admin'
import UserAvatar from '@/components/common/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { User } from '@/db-collections/users'

import GuardianBadge from '../common/guardian-badge'
import UserTypeBadge from '../common/user-type-badge'

export function AdminUsersList() {
	const {
		data: users = [],
		isLoading,
		error,
	} = useQuery<Array<User>>({
		queryKey: ['admin', 'users'],
		queryFn: async () => {
			return await getUsersAsAdmin()
		},
		staleTime: 10 * 60 * 1000,
	})

	if (isLoading) {
		return (
			<div className="space-y-3">
				{[...Array(3)].map((_, i) => (
					<div key={i} className="flex items-center gap-3">
						<Skeleton className="h-10 w-10 rounded-full" />
						<div className="flex-1 space-y-2">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-3 w-48" />
						</div>
						<Skeleton className="h-5 w-16" />
					</div>
				))}
			</div>
		)
	}

	if (error) {
		return <div className="text-sm text-destructive">Error loading users: {error instanceof Error ? error.message : 'Unknown error'}</div>
	}

	if (users.length === 0) {
		return <div className="text-sm text-muted-foreground">No users found</div>
	}

	return (
		<TooltipProvider delayDuration={150}>
			<div className="grid grid-cols-1 divide-y @sm/admin-content:grid-cols-[minmax(0,2fr)_max-content] @md/admin-content:grid-cols-[minmax(0,2fr)_max-content_max-content] @xl/admin-content:grid-cols-[minmax(0,2fr)_minmax(0,1.25fr)_max-content_max-content] @3xl/admin-content:grid-cols-[minmax(0,2fr)_minmax(0,1.25fr)_max-content_max-content_max-content]">
				{users.map(user => (
					<UserRow key={user.id} user={user} />
				))}
			</div>
		</TooltipProvider>
	)
}

function UserRow({ user }: { user: User }) {
	return (
		<Link
			to={`/admin/user/$id`}
			params={{ id: user.id }}
			className="grid grid-cols-subgrid col-span-full items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
		>
			<IdentityCell user={user} />
			<BirthdayCell user={user} />
			<BadgesCell user={user} />
			<RelationshipCell user={user} />
			<EmailVerifiedCell user={user} />
		</Link>
	)
}

function IdentityCell({ user }: { user: User }) {
	return (
		<div className="flex items-center gap-3 min-w-0">
			<UserAvatar name={user.name || user.email} image={user.image} />
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="font-medium text-sm truncate">{user.name || 'No name'}</span>
				</div>
				<div className="text-xs text-muted-foreground truncate">{user.email}</div>
			</div>
		</div>
	)
}

function BirthdayCell({ user }: { user: User }) {
	if (!user.birthMonth || !user.birthDay) {
		return <div className="hidden @xl/admin-content:block" />
	}
	const monthName = user.birthMonth.charAt(0).toUpperCase() + user.birthMonth.slice(1)
	const dateLabel = `${monthName} ${user.birthDay}`
	const fullLabel = user.birthYear ? `${dateLabel}, ${user.birthYear}` : dateLabel
	return (
		<div className="hidden @xl/admin-content:flex items-center justify-start gap-1 min-w-0">
			<Tip label={`Birthday: ${fullLabel}`}>
				<Badge variant="outline">{dateLabel}</Badge>
			</Tip>
			{user.birthYear && (
				<Tip label={`Born ${user.birthYear}`}>
					<Badge variant="outline" className="hidden @3xl/admin-content:inline-flex">
						{user.birthYear}
					</Badge>
				</Tip>
			)}
		</div>
	)
}

function RelationshipCell({ user }: { user: User }) {
	const guardians = user.guardians ?? []
	const hasPartner = !!user.partner
	const hasGuardians = user.role === 'child' && guardians.length > 0
	if (!hasPartner && !hasGuardians) {
		return <div className="hidden @md/admin-content:block" />
	}
	if (hasPartner) {
		const partnerLabel = user.partner!.name || user.partner!.email
		return (
			<div className="hidden @md/admin-content:flex items-center px-3">
				<Tip label={`Partner: ${partnerLabel}`}>
					<span className="relative inline-flex">
						<UserAvatar name={partnerLabel} image={user.partner!.image} className="ring-1 ring-border" />
						<Heart className="absolute -bottom-0.5 -right-0.5 size-4 fill-pink-500 text-white dark:text-background stroke-[2.5] drop-shadow-sm" />
					</span>
				</Tip>
			</div>
		)
	}
	return (
		<div className="hidden @md/admin-content:flex items-center px-3 -space-x-2">
			{guardians.map((g, i) => {
				const label = g.name || g.email
				const isTopmost = i === guardians.length - 1
				return (
					<Tip key={g.id} label={`Guardian: ${label}`}>
						<span className="relative inline-flex">
							<UserAvatar name={label} image={g.image} size="small" className="ring-1 ring-border" />
							{isTopmost && (
								<ShieldCheck className="absolute -bottom-0.5 -right-0.5 size-3.5 fill-emerald-500 text-white dark:text-background stroke-[2.5] drop-shadow-sm" />
							)}
						</span>
					</Tip>
				)
			})}
		</div>
	)
}

function BadgesCell({ user }: { user: User }) {
	return (
		<div className="flex items-center gap-1.5 text-xs text-muted-foreground capitalize justify-start flex-wrap">
			{user.banned && (
				<Tip label="This user is banned and cannot sign in">
					<span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive uppercase tracking-wide">
						<Ban className="size-3" />
						Banned
					</span>
				</Tip>
			)}
			{user.twoFactorEnabled && (
				<Tip label="Two-factor auth enabled">
					<span className="inline-flex items-center text-emerald-600 dark:text-emerald-500">
						<KeyRound className="size-3.5" />
					</span>
				</Tip>
			)}
			<Tip label={roleTooltip(user.role)}>
				<span className="inline-flex">
					<UserTypeBadge user={user} />
				</span>
			</Tip>
			{user.isGuardian && (
				<Tip label="Guardian: can manage one or more child accounts">
					<span className="inline-flex">
						<GuardianBadge />
					</span>
				</Tip>
			)}
		</div>
	)
}

function EmailVerifiedCell({ user }: { user: User }) {
	return (
		<div className="hidden @3xl/admin-content:flex items-center justify-end">
			{user.emailVerified ? (
				<Tip label="Email verified">
					<span className="inline-flex items-center text-emerald-600 dark:text-emerald-500">
						<MailCheck className="size-4" />
					</span>
				</Tip>
			) : (
				<Tip label="Email not verified">
					<span className="inline-flex items-center text-amber-600 dark:text-amber-500">
						<MailWarning className="size-4" />
					</span>
				</Tip>
			)}
		</div>
	)
}

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	)
}

function roleTooltip(role: string): string {
	switch (role) {
		case 'admin':
			return 'Admin: full access to /admin and every user account'
		case 'child':
			return 'Child: managed by a guardian; cannot create gift-ideas lists'
		case 'user':
			return 'Standard user'
		default:
			return role.charAt(0).toUpperCase() + role.slice(1)
	}
}
