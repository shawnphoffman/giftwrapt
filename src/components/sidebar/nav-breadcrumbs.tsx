'use client'

import { Link, useLocation, useRouterState } from '@tanstack/react-router'

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb'

export default function NavBreadcrumbs() {
	const location = useLocation()

	const isAdminIntelligence = location.pathname === '/admin/intelligence' || location.pathname.startsWith('/admin/intelligence/')
	const isDeepAdmin = location.pathname.includes('/admin/') && !isAdminIntelligence
	const isAdminUserEdit = location.pathname.startsWith('/admin/user/')
	const isAdminIntelligenceSubpage = location.pathname.startsWith('/admin/intelligence/') && location.pathname !== '/admin/intelligence/'

	const isOrganizing = location.pathname.includes('/organize')
	const isBeyondEditing = location.pathname.includes('/select') || isOrganizing
	const isEditingList = location.pathname.includes('/edit') || isBeyondEditing
	const isViewingList = location.pathname.includes('/lists/')

	const editedListName = useRouterState({
		select: s => {
			if (!isBeyondEditing) return null
			for (const m of s.matches) {
				const data = m.loaderData as { list?: { name?: string } } | undefined
				if (data?.list?.name) return data.list.name
			}
			return null
		},
	})

	const parentCrumb = isAdminIntelligenceSubpage
		? { href: '/admin/intelligence', label: 'Back to Intelligence' }
		: isDeepAdmin
			? { href: '/admin', label: 'Back to Admin' }
			: isEditingList
				? {
						href: '/me',
						label: 'My Lists',
					}
				: isViewingList
					? {
							href: '/',
							label: 'All Lists',
						}
					: null

	if (!parentCrumb) return null
	const editHref = location.pathname.replace('/organize', '/edit').replace('/select', '/edit')
	return (
		<Breadcrumb>
			<BreadcrumbList>
				<BreadcrumbSeparator />
				<BreadcrumbItem>
					<BreadcrumbLink asChild>
						<Link to={parentCrumb.href}>{parentCrumb.label}</Link>
					</BreadcrumbLink>
				</BreadcrumbItem>
				{isAdminUserEdit && (
					<>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbLink asChild>
								<Link to="/admin/users">Users</Link>
							</BreadcrumbLink>
						</BreadcrumbItem>
					</>
				)}
				{isBeyondEditing && (
					<>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbLink asChild>
								<Link to={editHref}>{editedListName ?? 'Current List'}</Link>
							</BreadcrumbLink>
						</BreadcrumbItem>
					</>
				)}
			</BreadcrumbList>
		</Breadcrumb>
	)
}
