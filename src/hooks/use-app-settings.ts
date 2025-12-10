import { queryOptions, useQuery, useSuspenseQuery } from '@tanstack/react-query'

import { fetchAppSettings } from '@/api/settings'
import { DEFAULT_APP_SETTINGS, type AppSettings } from '@/lib/settings'

/**
 * Query key for app settings
 */
export const appSettingsQueryKey = ['appSettings'] as const

/**
 * Query options for app settings - can be used for prefetching
 */
export const appSettingsQueryOptions = queryOptions({
	queryKey: appSettingsQueryKey,
	queryFn: () => fetchAppSettings(),
	// Settings rarely change, so we can cache them for a while
	staleTime: 1000 * 60 * 5, // 5 minutes
	gcTime: 1000 * 60 * 30, // 30 minutes
})

/**
 * Hook to access app settings with loading/error states
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { data: settings, isLoading } = useAppSettings()
 *   if (isLoading) return <Loading />
 *   return <div>{settings.enableHolidayLists ? 'Holiday Lists Enabled' : 'Disabled'}</div>
 * }
 * ```
 */
export function useAppSettings() {
	return useQuery(appSettingsQueryOptions)
}

/**
 * Suspense-enabled hook for app settings
 * Use this when you want to suspend while loading (e.g., with <Suspense>)
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { data: settings } = useAppSettingsSuspense()
 *   // settings is guaranteed to be defined here
 *   return <div>{settings.enableHolidayLists ? 'Enabled' : 'Disabled'}</div>
 * }
 * ```
 */
export function useAppSettingsSuspense() {
	return useSuspenseQuery(appSettingsQueryOptions)
}

/**
 * Get a specific setting value with a fallback
 * Useful for quick access to a single setting
 */
export function useAppSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
	const { data } = useAppSettings()
	return data?.[key] ?? DEFAULT_APP_SETTINGS[key]
}
