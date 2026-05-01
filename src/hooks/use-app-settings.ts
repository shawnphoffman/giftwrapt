import { type QueryClient, queryOptions, useQuery, useSuspenseQuery } from '@tanstack/react-query'

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

/**
 * BroadcastChannel name for cross-tab app-settings change notifications.
 *
 * Admin mutations only update `adminAppSettingsQueryKey` in their own tab.
 * The public `appSettingsQueryKey` powers feature gates (sidebar links,
 * toggle visibility) across every tab, so we broadcast a "changed" signal
 * after a successful admin update and have other tabs invalidate their
 * public cache. Same-tab invalidation happens directly via the helper.
 */
const APP_SETTINGS_BROADCAST = 'app-settings-changed'

// Per-tab id so the BroadcastChannel listener can skip messages this tab
// posted itself. Without this, `notifyAppSettingsChanged` would invalidate
// once locally, then again when its own broadcast looped back through the
// listener wired in this same tab (two refetches per toggle).
const TAB_ID = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

type AppSettingsBroadcastMessage = { type: 'changed'; tabId: string }

function getBroadcastChannel(): BroadcastChannel | null {
	if (typeof window === 'undefined') return null
	if (typeof BroadcastChannel === 'undefined') return null
	return new BroadcastChannel(APP_SETTINGS_BROADCAST)
}

/**
 * Call after a successful admin app-settings mutation. Invalidates the
 * public settings cache in this tab and notifies other tabs in the same
 * browser to do the same.
 */
export function notifyAppSettingsChanged(queryClient: QueryClient): void {
	queryClient.invalidateQueries({ queryKey: appSettingsQueryKey })
	const ch = getBroadcastChannel()
	if (!ch) return
	try {
		const msg: AppSettingsBroadcastMessage = { type: 'changed', tabId: TAB_ID }
		ch.postMessage(msg)
	} finally {
		ch.close()
	}
}

/**
 * Wire up the cross-tab listener. Returns a cleanup function. Safe to call
 * multiple times; the caller is responsible for calling cleanup.
 */
export function setupAppSettingsBroadcastListener(queryClient: QueryClient): () => void {
	const ch = getBroadcastChannel()
	if (!ch) return () => {}
	ch.onmessage = event => {
		const data = event.data as AppSettingsBroadcastMessage | undefined
		if (data?.type !== 'changed') return
		if (data.tabId === TAB_ID) return
		queryClient.invalidateQueries({ queryKey: appSettingsQueryKey })
	}
	return () => ch.close()
}
