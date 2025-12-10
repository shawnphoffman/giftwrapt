import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { updateAppSettings } from '@/api/settings'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { appSettingsQueryKey, useAppSettings } from '@/hooks/use-app-settings'
import type { AppSettings } from '@/lib/settings'

export function AppSettingsEditor() {
	const { data: settings, isLoading } = useAppSettings()
	const queryClient = useQueryClient()
	const [updating, setUpdating] = useState<string | null>(null)

	const handleSettingChange = useCallback(
		async <T extends keyof AppSettings>(key: T, value: AppSettings[T]) => {
			setUpdating(key)
			try {
				await updateAppSettings({ data: { [key]: value } } as Parameters<typeof updateAppSettings>[0])
				await queryClient.invalidateQueries({ queryKey: appSettingsQueryKey })
				toast.success(`Setting "${key}" updated`)
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to update setting'
				toast.error(message)
			} finally {
				setUpdating(null)
			}
		},
		[queryClient]
	)

	if (isLoading) {
		return <div className="text-sm text-muted-foreground">Loading settings...</div>
	}

	if (!settings) {
		return <div className="text-sm text-muted-foreground">No settings found</div>
	}

	return (
		<div className="space-y-6">
			{/* Enable Holiday Lists */}
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="enableHolidayLists" className="text-base">
						Enable Holiday Lists
					</Label>
					<p className="text-sm text-muted-foreground">Allow users to create holiday-themed lists</p>
				</div>
				<Switch
					id="enableHolidayLists"
					checked={settings.enableHolidayLists}
					disabled={updating === 'enableHolidayLists'}
					onCheckedChange={checked => handleSettingChange('enableHolidayLists', checked)}
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
					disabled={updating === 'enableTodoLists'}
					onCheckedChange={checked => handleSettingChange('enableTodoLists', checked)}
				/>
			</div>

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
					disabled={updating === 'defaultListType'}
					onValueChange={value => handleSettingChange('defaultListType', value as AppSettings['defaultListType'])}
				>
					<SelectTrigger id="defaultListType" className="w-[140px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="wishlist">Wishlist</SelectItem>
						<SelectItem value="todo">Todo</SelectItem>
						<SelectItem value="holiday">Holiday</SelectItem>
					</SelectContent>
				</Select>
			</div>
		</div>
	)
}
