'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Eye, OctagonMinus, SquarePen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { getUsersWithRelationships, upsertUserRelationships } from '@/api/permissions'
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

function PermissionsPage() {
	const queryClient = useQueryClient()
	const [isLoading, setIsLoading] = useState(false)

	const { data: users = [], isLoading: isLoadingUsers } = useQuery<Array<UserWithRelationships>>({
		queryKey: ['permissions', 'users'],
		queryFn: async () => {
			return await getUsersWithRelationships()
		},
	})

	const [formData, setFormData] = useState<Record<string, UserWithRelationships>>({})

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

	const handleCheckboxChange = (userId: string, field: 'canView' | 'isRestricted' | 'canEdit', checked: boolean) => {
		if (field === 'canView' && checked === false) {
			setFormData(prev => ({
				...prev,
				[userId]: {
					...prev[userId],
					canView: false,
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

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setIsLoading(true)

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
			setIsLoading(false)
		}
	}

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
				<CardDescription>Manage permissions for other users.</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoadingUsers && <LoadingSkeleton />}
				{users.length === 0 ? (
					<div className="text-sm text-muted-foreground">No other users found</div>
				) : Object.keys(formData).length === 0 ? (
					<div className="text-sm text-muted-foreground">Loading permissions...</div>
				) : (
					<form onSubmit={handleSubmit} className="space-y-4">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead></TableHead>
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
									<TableHead className="text-center">
										<Tooltip>
											<TooltipTrigger asChild>
												<OctagonMinus className="size-5 mx-auto text-muted-foreground" />
											</TooltipTrigger>
											<TooltipContent>Can this user only view unpurchased items on your lists?</TooltipContent>
										</Tooltip>
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{users.map(user => {
									const userFormData = formData[user.id]
									return (
										<TableRow key={user.id}>
											<TableCell>
												<div className="flex items-center gap-3">
													<UserAvatar name={user.name || user.email} image={user.image} />
													<div className="font-medium">{user.name || 'Unnamed'}</div>
												</div>
											</TableCell>
											<TableCell className="text-center pr-2!">
												<Checkbox
													className="size-7 [&_svg]:size-5"
													checked={userFormData.canView}
													onCheckedChange={checked => handleCheckboxChange(user.id, 'canView', checked === true)}
													disabled={isLoading}
												/>
											</TableCell>
											<TableCell className="text-center pr-2!">
												<Checkbox
													className="size-7 [&_svg]:size-5"
													checked={userFormData.canEdit}
													onCheckedChange={checked => handleCheckboxChange(user.id, 'canEdit', checked === true)}
													disabled={isLoading}
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
							<Button type="submit" disabled={isLoading}>
								{isLoading ? 'Saving...' : 'Save'}
							</Button>
						</div>
					</form>
				)}
			</CardContent>
		</div>
	)
}
