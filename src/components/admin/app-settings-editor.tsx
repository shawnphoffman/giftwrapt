import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { updateAppSettings } from '@/api/settings'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ListTypes } from '@/db/schema'
import { appSettingsQueryKey, useAppSettings } from '@/hooks/use-app-settings'
import type { AppSettings } from '@/lib/settings'

export function AppSettingsEditor() {
	const { data: settings, isLoading } = useAppSettings()
	const queryClient = useQueryClient()

	const mutation = useMutation({
		mutationFn: async (newSettings: Partial<AppSettings>) => {
			return await updateAppSettings({ data: newSettings } as Parameters<typeof updateAppSettings>[0])
		},
		onMutate: async newSettings => {
			// Cancel any outgoing refetches so they don't overwrite our optimistic update
			await queryClient.cancelQueries({ queryKey: appSettingsQueryKey })

			// Snapshot the previous value
			const previousSettings = queryClient.getQueryData<AppSettings>(appSettingsQueryKey)

			// Optimistically update to the new value
			queryClient.setQueryData<AppSettings>(appSettingsQueryKey, old => ({
				...old!,
				...newSettings,
			}))

			// Return a context with the previous settings and the keys we changed
			const changedKeys = Object.keys(newSettings) as Array<keyof AppSettings>
			return { previousSettings, changedKeys }
		},
		onError: (error, _newSettings, context) => {
			// Roll back to the previous value on error
			if (context?.previousSettings) {
				queryClient.setQueryData(appSettingsQueryKey, context.previousSettings)
			}
			const message = error instanceof Error ? error.message : 'Failed to update setting'
			toast.error(message)
		},
		onSuccess: (data, _variables, context) => {
			// Only update the specific keys this mutation changed
			// This prevents overwriting other pending optimistic updates
			queryClient.setQueryData<AppSettings>(appSettingsQueryKey, old => {
				const updated = { ...old! }
				for (const key of context.changedKeys) {
					// Use type assertion since we know the keys are valid
					;(updated as Record<string, unknown>)[key] = data[key]
				}
				return updated
			})
			toast.success('Setting updated')
		},
		// Note: We intentionally don't invalidate here to avoid race conditions
		// with concurrent mutations. The onSuccess handler updates the cache directly.
	})

	const handleSettingChange = <T extends keyof AppSettings>(key: T, value: AppSettings[T]) => {
		mutation.mutate({ [key]: value })
	}

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
							if (type === 'todo' && !settings.enableTodoLists) return null
							return (
								<SelectItem key={type} value={type}>
									{label}
								</SelectItem>
							)
						})}
					</SelectContent>
				</Select>
			</div>
		</div>
	)
}
