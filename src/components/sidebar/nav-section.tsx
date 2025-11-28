// 'use client'

// import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
// import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
// import Link from 'next/link'

// import {
// 	SidebarGroup,
// 	SidebarGroupContent,
// 	SidebarGroupLabel,
// 	SidebarMenu,
// 	SidebarMenuButton,
// 	SidebarMenuItem,
// } from '@/components/ui/sidebar'
// import { cn } from '@/lib/utils'

// type Props = {
// 	title: string
// 	items: NavItem[]
// 	className?: string
// }

// export type NavItem = {
// 	name: string
// 	url: string
// 	icon: IconDefinition
// }

// export const NavItem = ({ item, className }: { item: NavItem; className?: string }) => {
// 	return (
// 		<SidebarMenuItem key={item.name}>
// 			<SidebarMenuButton asChild className={className}>
// 				<Link href={item.url}>
// 					{item.icon && <FontAwesomeIcon className="!size-3" icon={item.icon} />}
// 					<span>{item.name}</span>
// 				</Link>
// 			</SidebarMenuButton>
// 		</SidebarMenuItem>
// 	)
// }

// export default function NavSection({ title, items, className }: Props) {
// 	return (
// 		<SidebarGroup className={cn('group-data-[collapsible=icon]:hidden', className)}>
// 			<SidebarGroupLabel className="text-sm underline underline-offset-4 decoration-dashed">{title}</SidebarGroupLabel>
// 			<SidebarGroupContent>
// 				<SidebarMenu>
// 					{items.map(item => (
// 						<NavItem key={item.name} item={item} />
// 					))}
// 				</SidebarMenu>
// 			</SidebarGroupContent>
// 		</SidebarGroup>
// 	)
// }
