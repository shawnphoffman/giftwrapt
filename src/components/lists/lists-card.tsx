import * as React from 'react'
import { Slot } from 'radix-ui'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

function ListsCard({ className, ...props }: React.ComponentProps<typeof Card>) {
	return <Card data-slot="lists-card" className={cn('py-4 gap-2', className)} {...props} />
}

function ListsCardHeader({ className, ...props }: React.ComponentProps<'div'>) {
	return <CardHeader data-slot="lists-card-header" className={cn('flex flex-row items-center gap-3 px-4', className)} {...props} />
}

function ListsCardTitle({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<CardTitle
			data-slot="lists-card-title"
			className={cn('text-2xl font-semibold leading-none tracking-tight', className)}
			{...props}
		/>
	)
}

function ListsCardDescription({ className, ...props }: React.ComponentProps<'div'>) {
	return <CardDescription data-slot="lists-card-description" className={cn(className)} {...props} />
}

function ListsCardLists({ className, ...props }: React.ComponentProps<'div'>) {
	return <CardContent data-slot="lists-card-lists" className={cn('flex flex-col gap-0 px-4', className)} {...props} />
}

function ListsCardList({
	className,
	asChild = false,
	...props
}: React.ComponentProps<'div'> & {
	asChild?: boolean
}) {
	const Comp = asChild ? Slot.Root : 'div'
	return (
		<Comp
			data-slot="lists-card-list"
			className={cn('text-lg flex flex-row items-center gap-2 rounded p-2 bg-transparent hover:bg-muted', className)}
			{...props}
		/>
	)
}

export { ListsCard, ListsCardDescription, ListsCardHeader, ListsCardList, ListsCardLists, ListsCardTitle }
