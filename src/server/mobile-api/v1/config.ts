// Server config readouts the iOS client and MCP use to gate UI
// affordances. Public-readable: nothing here leaks secrets, just
// feature flags.

import type { Hono } from 'hono'

import { db } from '@/db'
import { getAppSettings } from '@/lib/settings-loader'

import type { MobileAuthContext } from '../auth'

type App = Hono<MobileAuthContext>

export function registerConfigRoutes(v1: App): void {
	// GET /v1/app-settings - public-readable subset of admin-managed
	// app settings. iOS uses these to hide/show feature toggles.
	//
	// Wrapped under `settings` to match the rest of the mobile-API
	// envelope convention (`{ resource: ... }`). iOS's
	// `AppSettingsResponse` decodes `{ settings: AppSettings }`.
	v1.get('/app-settings', async c => {
		const settings = await getAppSettings(db)
		return c.json({
			settings: {
				appTitle: settings.appTitle,
				enableComments: settings.enableComments,
				enableCommentEmails: settings.enableCommentEmails,
				enableMobileApp: settings.enableMobileApp,
				enableChristmasLists: settings.enableChristmasLists,
				enableBirthdayLists: settings.enableBirthdayLists,
				enableGenericHolidayLists: settings.enableGenericHolidayLists,
				enableTodoLists: settings.enableTodoLists,
				enableMothersDayReminders: settings.enableMothersDayReminders,
				enableFathersDayReminders: settings.enableFathersDayReminders,
				enableValentinesDayReminders: settings.enableValentinesDayReminders,
				enableAnniversaryReminders: settings.enableAnniversaryReminders,
				defaultListType: settings.defaultListType,
			},
		})
	})
}
