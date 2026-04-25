import { useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { updateItemGroup } from '@/api/groups'
import type { GroupSummary } from '@/api/lists'
import PriorityIcon from '@/components/common/priority-icon'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { type Priority, priorityEnumValues } from '@/db/schema/enums'

const PriorityLabels: Record<Priority, string> = {
	low: 'Low',
	normal: 'Normal',
	high: 'High',
	'very-high': 'Very High',
}

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	group: GroupSummary
}

export function GroupEditDialog({ open, onOpenChange, group }: Props) {
	const router = useRouter()
	const [name, setName] = useState(group.name ?? '')
	const [priority, setPriority] = useState<Priority>(group.priority)
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		if (open) {
			setName(group.name ?? '')
			setPriority(group.priority)
		}
	}, [open, group.name, group.priority])

	const handleSave = async () => {
		setSaving(true)
		try {
			const trimmed = name.trim()
			const result = await updateItemGroup({
				data: {
					groupId: group.id,
					name: trimmed === '' ? null : trimmed,
					priority,
				},
			})
			if (result.kind === 'ok') {
				toast.success('Group updated')
				onOpenChange(false)
				await router.invalidate()
			} else {
				toast.error('Failed to update group')
			}
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Edit group</DialogTitle>
				</DialogHeader>
				<div className="grid gap-3">
					<div className="grid gap-1.5">
						<Label htmlFor={`group-name-${group.id}`}>Name (optional)</Label>
						<Input
							id={`group-name-${group.id}`}
							value={name}
							onChange={e => setName(e.target.value)}
							placeholder="Unnamed"
							maxLength={100}
							disabled={saving}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor={`group-priority-${group.id}`}>Priority</Label>
						<Select value={priority} onValueChange={v => setPriority(v as Priority)} disabled={saving}>
							<SelectTrigger id={`group-priority-${group.id}`} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{[...priorityEnumValues].reverse().map(p => (
									<SelectItem key={p} value={p}>
										<span className="flex items-center gap-2">
											<span className="inline-flex size-3.5 items-center justify-center">
												<PriorityIcon priority={p} className="size-3.5" />
											</span>
											{PriorityLabels[p]}
										</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">All items in this group inherit this priority.</p>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={saving}>
						{saving ? 'Saving…' : 'Save'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
