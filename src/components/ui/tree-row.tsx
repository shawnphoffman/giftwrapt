import * as React from 'react'

import { cn } from '@/lib/utils'

import { Label } from './label'

function TreeGroup({ className, children }: { className?: string; children: React.ReactNode }) {
	return <div className={cn('space-y-6', className)}>{children}</div>
}

function TreeBranch({ className, children }: { className?: string; children: React.ReactNode }) {
	return <div className={cn('space-y-6 pl-6', className)}>{children}</div>
}

type TreeRowProps = {
	label: React.ReactNode
	description?: React.ReactNode
	control: React.ReactNode
	htmlFor?: string
	disabled?: boolean
	children?: React.ReactNode
	className?: string
}

function TreeRow({ label, description, control, htmlFor, disabled, children, className }: TreeRowProps) {
	return (
		<div className={cn('group/tr space-y-6', className)}>
			<div className="relative">
				<span aria-hidden className="pointer-events-none absolute -left-6 -top-6 h-8 w-4 border-b border-l border-border" />
				<span aria-hidden className="pointer-events-none absolute bottom-0 -left-6 top-2 w-0 border-l border-border group-last/tr:hidden" />
				<div className={cn('flex items-center justify-between gap-4', disabled && 'opacity-50')}>
					<div className="space-y-0.5">
						<Label htmlFor={htmlFor} className="text-base">
							{label}
						</Label>
						{description && <p className="text-sm text-muted-foreground">{description}</p>}
					</div>
					{control}
				</div>
			</div>
			{children}
		</div>
	)
}

export { TreeBranch, TreeGroup, TreeRow }
