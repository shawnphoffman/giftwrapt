import { Settings } from 'lucide-react'
import { useState } from 'react'

import type { AddableEditorUser, EditorOnList } from '@/api/list-editors'
import { ListEditorsSection } from '@/components/list-editors/list-editors-section'
import { ListSettingsForm } from '@/components/lists/list-settings-form'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import type { ListType } from '@/db/schema/enums'

type Props = {
	listId: number
	name: string
	type: ListType
	isPrivate: boolean
	description: string | null
	giftIdeasTargetUserId: string | null
	editors: Array<EditorOnList>
	addableUsers: Array<AddableEditorUser>
	isOwner: boolean
}

export function ListSettingsSheet({
	listId,
	name,
	type,
	isPrivate,
	description,
	giftIdeasTargetUserId,
	editors,
	addableUsers,
	isOwner,
}: Props) {
	const [open, setOpen] = useState(false)

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button variant="outline" size="icon" title="List settings" aria-label="List settings">
					<Settings className="size-4" />
				</Button>
			</SheetTrigger>
			<SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
				<SheetHeader>
					<SheetTitle>List settings</SheetTitle>
					<SheetDescription>Manage this list's details and editors.</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-6 px-4 pb-6">
					<ListSettingsForm
						listId={listId}
						name={name}
						type={type}
						isPrivate={isPrivate}
						description={description}
						giftIdeasTargetUserId={giftIdeasTargetUserId}
					/>
					{isOwner && (
						<>
							<Separator />
							<ListEditorsSection listId={listId} editors={editors} addableUsers={addableUsers} />
						</>
					)}
				</div>
			</SheetContent>
		</Sheet>
	)
}
