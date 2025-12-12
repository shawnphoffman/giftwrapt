'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
	Eye,
	// OctagonMinus,
	SquarePen,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
	getOwnersWithRelationshipsForMe,
	getUsersWithRelationships,
	upsertUserRelationships,
	upsertViewerRelationships,
} from '@/api/permissions'
import UserAvatar from '@/components/common/user-avatar'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Button } from '@/components/ui/button'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export const Route = createFileRoute('/(core)/settings/permissions')({
	component: PermissionsPage,
})

type UserWithRelationships = {
	id: string
	email: string
	name: string | null
	image: string | null
	canView: boolean
	canEdit: boolean
	isRestricted: boolean
}

type OwnerWithViewRelationship = {
	id: string
	email: string
	name: string | null
	image: string | null
	canView: boolean
}

function PermissionsPage() {
	const queryClient = useQueryClient()
	const [isSavingOutgoing, setIsSavingOutgoing] = useState(false)
	const [isSavingIncoming, setIsSavingIncoming] = useState(false)

	const { data: users = [], isLoading: isLoadingUsers } = useQuery<Array<UserWithRelationships>>({
		queryKey: ['permissions', 'users'],
		queryFn: async () => {
			return await getUsersWithRelationships()
		},
	})

	const { data: owners = [], isLoading: isLoadingOwners } = useQuery<Array<OwnerWithViewRelationship>>({
		queryKey: ['permissions', 'owners'],
		queryFn: async () => {
			return await getOwnersWithRelationshipsForMe()
		},
	})

	const [formData, setFormData] = useState<Record<string, UserWithRelationships>>({})
	const [incomingFormData, setIncomingFormData] = useState<Record<string, OwnerWithViewRelationship>>({})

	// Update form data when users data loads
	useEffect(() => {
		if (users.length > 0) {
			setFormData(prev => {
				const initial: Record<string, UserWithRelationships> = {}
				users.forEach(user => {
					// Preserve existing form data if it exists, otherwise use user data
					initial[user.id] = prev[user.id] ?? { ...user }
				})
				return initial
			})
		}
	}, [users])

	// Update incoming form data when owners data loads
	useEffect(() => {
		if (owners.length > 0) {
			setIncomingFormData(prev => {
				const initial: Record<string, OwnerWithViewRelationship> = {}
				owners.forEach(owner => {
					initial[owner.id] = prev[owner.id] ?? { ...owner }
				})
				return initial
			})
		}
	}, [owners])

	const handleCheckboxChange = (userId: string, field: 'canView' | 'isRestricted' | 'canEdit', checked: boolean) => {
		if (field === 'canView' && checked === false) {
			setFormData(prev => ({
				...prev,
				[userId]: {
					...prev[userId],
					canView: false,
					canEdit: false,
					isRestricted: false,
				},
			}))
		} else {
			setFormData(prev => ({
				...prev,
				[userId]: {
					...prev[userId],
					[field]: checked,
				},
			}))
		}
	}

	const handleIncomingCheckboxChange = (ownerUserId: string, checked: boolean) => {
		setIncomingFormData(prev => ({
			...prev,
			[ownerUserId]: {
				...prev[ownerUserId],
				canView: checked,
			},
		}))
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setIsSavingOutgoing(true)

		try {
			const relationships = Object.values(formData).map(user => ({
				viewerUserId: user.id,
				canView: user.canView,
				canEdit: user.canEdit,
				isRestricted: user.isRestricted,
			}))

			await upsertUserRelationships({
				data: { relationships },
			})

			toast.success('Permissions updated successfully')
			queryClient.invalidateQueries({ queryKey: ['permissions', 'users'] })
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to update permissions'
			toast.error(errorMessage)
		} finally {
			setIsSavingOutgoing(false)
		}
	}

	const handleIncomingSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setIsSavingIncoming(true)

		try {
			const relationships = Object.values(incomingFormData).map(owner => ({
				ownerUserId: owner.id,
				canView: owner.canView,
			}))

			await upsertViewerRelationships({
				data: { relationships },
			})

			toast.success('View permissions updated successfully')
			queryClient.invalidateQueries({ queryKey: ['permissions', 'owners'] })
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to update view permissions'
			toast.error(errorMessage)
		} finally {
			setIsSavingIncoming(false)
		}
	}

	// TODO Refactor this to have loader without duplicating the card logic

	// if (isLoadingUsers) {
	// 	return (
	// 		<div className="animate-page-in">
	// 			<CardHeader>
	// 				<CardTitle className="text-2xl">Permissions</CardTitle>
	// 			</CardHeader>
	// 			<CardContent>
	// 				<div className="space-y-4">
	// 					{[...Array(3)].map((_, i) => (
	// 						<div key={i} className="flex items-center gap-4">
	// 							<Skeleton className="h-10 w-10 rounded-full" />
	// 							<Skeleton className="h-4 flex-1" />
	// 							<Skeleton className="h-4 w-24" />
	// 							<Skeleton className="h-4 w-24" />
	// 							<Skeleton className="h-4 w-24" />
	// 						</div>
	// 					))}
	// 				</div>
	// 			</CardContent>
	// 		</div>
	// 	)
	// }

	// if (error) {
	// 	return (
	// 		<div className="animate-page-in">
	// 			<CardHeader>
	// 				<CardTitle className="text-2xl">Permissions</CardTitle>
	// 			</CardHeader>
	// 			<CardContent>
	// 				<div className="text-sm text-destructive">Error loading users: {error instanceof Error ? error.message : 'Unknown error'}</div>
	// 			</CardContent>
	// 		</div>
	// 	)
	// }

	return (
		<div className="animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">Permissions</CardTitle>
				<CardDescription>
					Manage permissions for other users. Specifically, who can see your lists and also administrate your lists on your behalf.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{(isLoadingUsers || isLoadingOwners) && <LoadingSkeleton />}
				{users.length === 0 && owners.length === 0 ? (
					<div className="text-sm text-muted-foreground">No other users found</div>
				) : (
					<div className="space-y-10">
						{users.length === 0 || Object.keys(formData).length === 0 ? (
							<div className="text-sm text-muted-foreground">Loading permissions...</div>
						) : (
							<form onSubmit={handleSubmit} className="space-y-4">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Who can view & edit your lists?</TableHead>
											<TableHead className="text-center">
												<Tooltip>
													<TooltipTrigger asChild>
														<Eye className="size-5 mx-auto" />
													</TooltipTrigger>
													<TooltipContent>Can this user view your list and make purchases?</TooltipContent>
												</Tooltip>
											</TableHead>
											<TableHead className="text-center">
												<Tooltip>
													<TooltipTrigger asChild>
														<SquarePen className="size-5 mx-auto text-muted-foreground" />
													</TooltipTrigger>
													<TooltipContent>Can this user create/edit public lists on your behalf?</TooltipContent>
												</Tooltip>
											</TableHead>
											{/* <TableHead className="text-center">
												<Tooltip>
													<TooltipTrigger asChild>
														<OctagonMinus className="size-5 mx-auto text-muted-foreground" />
													</TooltipTrigger>
													<TooltipContent>Can this user only view unpurchased items on your lists?</TooltipContent>
												</Tooltip>
											</TableHead> */}
										</TableRow>
									</TableHeader>
									<TableBody>
										{users.map(user => {
											const userFormData = formData[user.id]
											return (
												<TableRow key={user.id}>
													<TableCell className="py-1">
														<div className="flex items-center gap-2">
															<UserAvatar name={user.name || user.email} image={user.image} size="small" />
															<div className="font-medium">{user.name || 'Unnamed'}</div>
														</div>
													</TableCell>
													<TableCell className="text-center pr-2! py-1">
														<Checkbox
															className="size-5"
															checked={userFormData.canView}
															onCheckedChange={checked => handleCheckboxChange(user.id, 'canView', checked === true)}
															disabled={isSavingOutgoing}
														/>
													</TableCell>
													<TableCell className="text-center pr-2! py-1">
														<Checkbox
															className="size-5"
															checked={userFormData.canEdit}
															onCheckedChange={checked => handleCheckboxChange(user.id, 'canEdit', checked === true)}
															disabled={isSavingOutgoing || !userFormData.canView}
														/>
													</TableCell>
													{/* <TableCell className="text-center pr-2!">
														<Checkbox
															className="size-7 [&_svg]:size-5"
															checked={userFormData.isRestricted}
															onCheckedChange={checked => handleCheckboxChange(user.id, 'isRestricted', checked === true)}
															disabled={isLoading || !userFormData.canView}
														/>
													</TableCell> */}
												</TableRow>
											)
										})}
									</TableBody>
								</Table>
								<div className="flex">
									<Button type="submit" disabled={isSavingOutgoing}>
										{isSavingOutgoing ? 'Saving...' : 'Save'}
									</Button>
								</div>
							</form>
						)}

						{owners.length === 0 || Object.keys(incomingFormData).length === 0 ? (
							<div className="text-sm text-muted-foreground">Loading view permissions...</div>
						) : (
							<form onSubmit={handleIncomingSubmit} className="space-y-4">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Whose lists are you allowed to view?</TableHead>
											<TableHead className="text-center">
												<Tooltip>
													<TooltipTrigger asChild>
														<Eye className="size-5 mx-auto" />
													</TooltipTrigger>
													<TooltipContent>Can you view this user's lists?</TooltipContent>
												</Tooltip>
											</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{owners.map(owner => {
											const ownerFormData = incomingFormData[owner.id]
											return (
												<TableRow key={owner.id}>
													<TableCell className="py-1">
														<div className="flex items-center gap-2">
															<UserAvatar name={owner.name || owner.email} image={owner.image} size="small" />
															<div className="font-medium">{owner.name || 'Unnamed'}</div>
														</div>
													</TableCell>
													<TableCell className="text-center pr-2! py-1">
														<Checkbox
															className="size-5"
															checked={ownerFormData.canView}
															onCheckedChange={checked => handleIncomingCheckboxChange(owner.id, checked === true)}
															disabled={isSavingIncoming}
														/>
													</TableCell>
												</TableRow>
											)
										})}
									</TableBody>
								</Table>
								<div className="flex">
									<Button type="submit" disabled={isSavingIncoming}>
										{isSavingIncoming ? 'Saving...' : 'Save'}
									</Button>
								</div>
							</form>
						)}
					</div>
				)}
			</CardContent>
		</div>
	)
}
