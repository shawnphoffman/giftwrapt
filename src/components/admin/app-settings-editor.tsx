import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { updateAppSettings } from '@/api/settings'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ListTypes } from '@/db/schema'
import { appSettingsQueryKey, useAppSettings } from '@/hooks/use-app-settings'
import type { AppSettings } from '@/lib/settings'

const IS_DEV = import.meta.env.DEV

function useSettingsMutation() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (newSettings: Partial<AppSettings>) => {
			return await updateAppSettings({ data: newSettings } as Parameters<typeof updateAppSettings>[0])
		},
		onMutate: async newSettings => {
			await queryClient.cancelQueries({ queryKey: appSettingsQueryKey })
			const previousSettings = queryClient.getQueryData<AppSettings>(appSettingsQueryKey)
			queryClient.setQueryData<AppSettings>(appSettingsQueryKey, old => ({
				...old!,
				...newSettings,
			}))
			const changedKeys = Object.keys(newSettings) as Array<keyof AppSettings>
			return { previousSettings, changedKeys }
		},
		onError: (error, _newSettings, context) => {
			if (context?.previousSettings) {
				queryClient.setQueryData(appSettingsQueryKey, context.previousSettings)
			}
			const message = error instanceof Error ? error.message : 'Failed to update setting'
			toast.error(message)
		},
		onSuccess: (data, _variables, context) => {
			queryClient.setQueryData<AppSettings>(appSettingsQueryKey, old => {
				const updated = { ...old! }
				for (const key of context.changedKeys) {
					;(updated as Record<string, unknown>)[key] = data[key]
				}
				return updated
			})
			toast.success('Setting updated')
		},
	})
}

function useSettingsEditor() {
	const { data: settings, isLoading } = useAppSettings()
	const mutation = useSettingsMutation()

	const handleSettingChange = <T extends keyof AppSettings>(key: T, value: AppSettings[T]) => {
		mutation.mutate({ [key]: value })
	}

	return { settings, isLoading, handleSettingChange }
}

export function AppSettingsEditor() {
	const { settings, isLoading, handleSettingChange } = useSettingsEditor()

	if (isLoading) return <div className="text-sm text-muted-foreground">Loading settings...</div>
	if (!settings) return <div className="text-sm text-muted-foreground">No settings found</div>

	return (
		<div className="space-y-6">
			{/* Default List Type */}
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="defaultListType" className="text-base">
						Default List Type
					</Label>
					<p className="text-sm text-muted-foreground">The default type when creating new lists</p>
				</div>
				<Select
					value={settings.defaultListType}
					onValueChange={value => handleSettingChange('defaultListType', value as AppSettings['defaultListType'])}
				>
					<SelectTrigger id="defaultListType" className="w-[140px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{(Object.entries(ListTypes) as Array<[keyof typeof ListTypes, string]>).map(([type, label]) => {
							if (type === 'christmas' && !settings.enableHolidayLists) return null
							if (type === 'birthday' && !settings.enableBirthdayLists) return null
							if (type === 'todos' && !settings.enableTodoLists) return null
							if (type === 'test' && !IS_DEV) return null
							return (
								<SelectItem key={type} value={type}>
									{label}
								</SelectItem>
							)
						})}
					</SelectContent>
				</Select>
			</div>

			{/* Enable Christmas Lists */}
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="enableHolidayLists" className="text-base">
						Enable Christmas Lists
					</Label>
					<p className="text-sm text-muted-foreground">Allow users to create Christmas-themed lists</p>
				</div>
				<Switch
					id="enableHolidayLists"
					checked={settings.enableHolidayLists}
					onCheckedChange={checked => handleSettingChange('enableHolidayLists', checked)}
				/>
			</div>

			{/* Archive after Christmas (dependent on Enable Christmas Lists) */}
			<div
				className={`flex items-center justify-between gap-4 pl-6 ${settings.enableHolidayLists ? '' : 'opacity-50'}`}
			>
				<DaysSetting
					id="archiveDaysAfterChristmas"
					label="Archive after Christmas"
					description="Days after Dec 25 to automatically archive claimed items on Christmas lists"
					value={settings.archiveDaysAfterChristmas}
					disabled={!settings.enableHolidayLists}
					onCommit={value => handleSettingChange('archiveDaysAfterChristmas', value)}
				/>
			</div>

			{/* Enable Christmas emails (dependent on Enable Christmas Lists) */}
			<div
				className={`flex items-center justify-between gap-4 pl-6 ${settings.enableHolidayLists ? '' : 'opacity-50'}`}
			>
				<div className="space-y-0.5">
					<Label htmlFor="enableChristmasEmails" className="text-base">
						Enable Christmas emails
					</Label>
					<p className="text-sm text-muted-foreground">Send Christmas-related emails to users</p>
				</div>
				<Switch
					id="enableChristmasEmails"
					checked={settings.enableChristmasEmails}
					disabled={!settings.enableHolidayLists}
					onCheckedChange={checked => handleSettingChange('enableChristmasEmails', checked)}
				/>
			</div>

			{/* Enable Birthday Lists */}
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="enableBirthdayLists" className="text-base">
						Enable Birthday Lists
					</Label>
					<p className="text-sm text-muted-foreground">Allow users to create birthday lists</p>
				</div>
				<Switch
					id="enableBirthdayLists"
					checked={settings.enableBirthdayLists}
					onCheckedChange={checked => handleSettingChange('enableBirthdayLists', checked)}
				/>
			</div>

			{/* Archive after birthday (dependent on Enable Birthday Lists) */}
			<div
				className={`flex items-center justify-between gap-4 pl-6 ${settings.enableBirthdayLists ? '' : 'opacity-50'}`}
			>
				<DaysSetting
					id="archiveDaysAfterBirthday"
					label="Archive after birthday"
					description="Days after a birthday to automatically archive claimed items on birthday/wishlist lists"
					value={settings.archiveDaysAfterBirthday}
					disabled={!settings.enableBirthdayLists}
					onCommit={value => handleSettingChange('archiveDaysAfterBirthday', value)}
				/>
			</div>

			{/* Enable birthday emails (dependent on Enable Birthday Lists) */}
			<div
				className={`flex items-center justify-between gap-4 pl-6 ${settings.enableBirthdayLists ? '' : 'opacity-50'}`}
			>
				<div className="space-y-0.5">
					<Label htmlFor="enableBirthdayEmails" className="text-base">
						Enable birthday emails
					</Label>
					<p className="text-sm text-muted-foreground">
						Send day-of birthday greetings and the post-birthday gift summary
					</p>
				</div>
				<Switch
					id="enableBirthdayEmails"
					checked={settings.enableBirthdayEmails}
					disabled={!settings.enableBirthdayLists}
					onCheckedChange={checked => handleSettingChange('enableBirthdayEmails', checked)}
				/>
			</div>

			{/* Enable Todo Lists */}
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="enableTodoLists" className="text-base">
						Enable Todo Lists
					</Label>
					<p className="text-sm text-muted-foreground">Allow users to create todo lists</p>
				</div>
				<Switch
					id="enableTodoLists"
					checked={settings.enableTodoLists}
					onCheckedChange={checked => handleSettingChange('enableTodoLists', checked)}
				/>
			</div>

			{/* Enable Comments */}
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="enableComments" className="text-base">
						Enable Comments
					</Label>
					<p className="text-sm text-muted-foreground">Allow users to post comments on items</p>
				</div>
				<Switch
					id="enableComments"
					checked={settings.enableComments}
					onCheckedChange={checked => handleSettingChange('enableComments', checked)}
				/>
			</div>

			{/* Enable Comment Emails (dependent on Enable Comments) */}
			<div
				className={`flex items-center justify-between gap-4 pl-6 ${settings.enableComments ? '' : 'opacity-50'}`}
			>
				<div className="space-y-0.5">
					<Label htmlFor="enableCommentEmails" className="text-base">
						Enable Comment Emails
					</Label>
					<p className="text-sm text-muted-foreground">
						Email the list owner when someone comments on one of their items
					</p>
				</div>
				<Switch
					id="enableCommentEmails"
					checked={settings.enableCommentEmails}
					disabled={!settings.enableComments}
					onCheckedChange={checked => handleSettingChange('enableCommentEmails', checked)}
				/>
			</div>
		</div>
	)
}

type DaysSettingProps = {
	id: string
	label: string
	description: string
	value: number
	disabled?: boolean
	onCommit: (value: number) => void
}

function DaysSetting({ id, label, description, value, disabled, onCommit }: DaysSettingProps) {
	const [draft, setDraft] = useState(String(value))

	// Keep local draft in sync if the server value changes (after a successful save).
	useEffect(() => {
		setDraft(String(value))
	}, [value])

	const handleCommit = () => {
		const parsed = parseInt(draft, 10)
		if (!Number.isFinite(parsed) || parsed < 1) {
			setDraft(String(value)) // Reject invalid input, snap back to current value.
			return
		}
		if (parsed === value) return
		onCommit(parsed)
	}

	return (
		<>
			<div className="space-y-0.5">
				<Label htmlFor={id} className="text-base">
					{label}
				</Label>
				<p className="text-sm text-muted-foreground">{description}</p>
			</div>
			<div className="flex items-center gap-2">
				<Input
					id={id}
					type="number"
					min={1}
					max={365}
					value={draft}
					disabled={disabled}
					onChange={e => setDraft(e.target.value)}
					onBlur={handleCommit}
					onKeyDown={e => {
						if (e.key === 'Enter') {
							e.currentTarget.blur()
						}
					}}
					className="w-20 text-right"
				/>
				<span className="text-sm text-muted-foreground">days</span>
			</div>
		</>
	)
}
