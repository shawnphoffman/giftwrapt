'use client'

import { Link, useLocation } from '@tanstack/react-router'

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb'

export default function NavBreadcrumbs() {
	const location = useLocation()

	const isDeepAdmin = location.pathname.includes('/admin/')

	const isBeyondEditing = location.pathname.includes('/select')
	const isEditingList = location.pathname.includes('/edit') || isBeyondEditing
	const isViewingList = location.pathname.includes('/lists/')

	const parentCrumb = isDeepAdmin
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
	return (
		<Breadcrumb>
			<BreadcrumbList>
				<BreadcrumbSeparator />
				<BreadcrumbItem>
					<BreadcrumbLink asChild>
						<Link to={parentCrumb.href}>{parentCrumb.label}</Link>
					</BreadcrumbLink>
				</BreadcrumbItem>
				{isBeyondEditing && (
					<>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbLink asChild>
								<Link to={location.pathname.replace('/select', '/edit')}>Current List</Link>
							</BreadcrumbLink>
						</BreadcrumbItem>
					</>
				)}
			</BreadcrumbList>
		</Breadcrumb>
	)
}
