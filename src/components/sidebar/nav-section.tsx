import { Link } from '@tanstack/react-router'

import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

type Props = {
	title: string
	items: Array<NavItem>
	className?: string
}

export type NavItem = {
	name: string
	url: string
	icon?: React.ElementType
	hoverColor?: string
	mask?: string
	activeOptions?: React.ComponentProps<typeof Link>['activeOptions']
}

export const NavItem = ({ item, className }: { item: NavItem; className?: string }) => {
	const Icon = item.icon
	return (
		<SidebarMenuItem key={item.name}>
			<SidebarMenuButton asChild className={cn(className, 'text-base font-medium')}>
				<Link
					to={item.url}
					className="group/link"
					mask={item.mask ? { to: item.mask } : undefined}
					activeOptions={item.activeOptions ? item.activeOptions : undefined}
				>
					{Icon && <Icon className={cn(item.hoverColor, 'transition-colors duration-50 ease-linear')} />}
					<span>{item.name}</span>
				</Link>
			</SidebarMenuButton>
		</SidebarMenuItem>
	)
}

export default function NavSection({ title, items, className }: Props) {
	return (
		<SidebarGroup className={cn('group-data-[collapsible=icon]:hidden', className)}>
			<SidebarGroupLabel className="text-sm font-semibold underline underline-offset-4 decoration-dashed">{title}</SidebarGroupLabel>
			<SidebarGroupContent>
				<SidebarMenu>
					{items.map(item => (
						<NavItem key={item.name} item={item} />
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	)
}
