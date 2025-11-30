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
	items: NavItem[]
	className?: string
}

export type NavItem = {
	name: string
	url: string
	icon?: React.ElementType
}

export const NavItem = ({ item, className }: { item: NavItem; className?: string }) => {
	const Icon = item.icon
	return (
		<SidebarMenuItem key={item.name}>
			<SidebarMenuButton asChild className={cn(className, 'text-base font-medium')}>
				<a href={item.url}>
					{Icon && <Icon className="" />}
					<span>{item.name}</span>
				</a>
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
