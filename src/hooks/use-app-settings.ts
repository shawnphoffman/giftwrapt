import { queryOptions, useQuery, useSuspenseQuery } from '@tanstack/react-query'

import { fetchAppSettings, fetchAppSettingsAsAdmin } from '@/api/settings'
import { type AppSettings, DEFAULT_APP_SETTINGS } from '@/lib/settings'

/**
 * Query key for the public app-settings read.
 *
 * The public read returns the full `AppSettings` shape but with
 * `scrapeProviders` always set to `[]`, since those entries carry
 * decrypted secrets (see sec-review C1). Admin pages that need the real
 * provider list use `adminAppSettingsQueryKey` / `useAdminAppSettings`.
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
 * Hook to access public app settings with loading/error states.
 *
 * `scrapeProviders` is always `[]` here. Admin UI that needs decrypted
 * provider credentials should use `useAdminAppSettings` instead.
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
export function useAppSetting<T extends keyof AppSettings>(key: T): AppSettings[T] {
	const { data } = useAppSettings()
	return data?.[key] ?? DEFAULT_APP_SETTINGS[key]
}

/**
 * Query key for the admin (full) app-settings read.
 *
 * This includes decrypted `scrapeProviders` and is gated by
 * `adminAuthMiddleware` server-side. Components that show or edit
 * scrape provider credentials must use this hook, not `useAppSettings`.
 */
export const adminAppSettingsQueryKey = ['appSettings', 'admin'] as const

/**
 * Query options for admin app settings (full payload).
 */
export const adminAppSettingsQueryOptions = queryOptions({
	queryKey: adminAppSettingsQueryKey,
	queryFn: () => fetchAppSettingsAsAdmin(),
	staleTime: 1000 * 60 * 5,
	gcTime: 1000 * 60 * 30,
})

/**
 * Admin-only hook returning the full app settings, including decrypted
 * scrape provider credentials. Will trigger a redirect to /sign-in if
 * the caller isn't an authenticated admin.
 */
export function useAdminAppSettings() {
	return useQuery(adminAppSettingsQueryOptions)
}

/**
 * Suspense variant of `useAdminAppSettings`.
 */
export function useAdminAppSettingsSuspense() {
	return useSuspenseQuery(adminAppSettingsQueryOptions)
}
