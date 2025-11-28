'use client'

import { useLocation } from '@tanstack/react-router'

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb'

export default function NavBreadcrumbs() {
	const location = useLocation()

	const isBeyondEditing = location.pathname.includes('/select')
	const isEditingList = location.pathname.includes('/edit') || isBeyondEditing
	const isViewingList = location.pathname.includes('/lists/')

	const parentCrumb = isEditingList
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
						<a href={parentCrumb.href}>{parentCrumb.label}</a>
					</BreadcrumbLink>
				</BreadcrumbItem>
				{isBeyondEditing && (
					<>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbLink asChild>
								<a href={location.pathname.replace('/select', '/edit')}>Current List</a>
							</BreadcrumbLink>
						</BreadcrumbItem>
					</>
				)}
			</BreadcrumbList>
		</Breadcrumb>
	)
}
