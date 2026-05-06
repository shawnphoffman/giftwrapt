// Server config readouts the iOS client uses to gate UI affordances.
// All public-readable: nothing here leaks secrets, just feature flags
// and configured/not-configured booleans.

import type { Hono } from 'hono'

import { db } from '@/db'
import { isEmailConfigured } from '@/lib/resend'
import { getAppSettings } from '@/lib/settings-loader'
import { isStorageConfigured } from '@/lib/storage/adapter'

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
				enableHolidayLists: settings.enableHolidayLists,
				enableBirthdayLists: settings.enableBirthdayLists,
				enableTodoLists: settings.enableTodoLists,
				defaultListType: settings.defaultListType,
			},
		})
	})

	// GET /v1/email/configured - whether the server has email config.
	// Lets iOS hide "send invite"-style affordances when there's no
	// relay.
	v1.get('/email/configured', async c => {
		const configured = await isEmailConfigured()
		return c.json({ configured })
	})

	// GET /v1/storage/status - whether avatar/item-image upload is
	// available. iOS hides upload controls when this is false.
	v1.get('/storage/status', c => {
		return c.json({ configured: isStorageConfigured() })
	})
}
