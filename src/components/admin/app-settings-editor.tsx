import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { updateAppSettings } from '@/api/settings'
import { SendSentryTestErrorButton } from '@/components/admin/send-sentry-test-error'
import { TimeZonePicker } from '@/components/admin/time-zone-picker'
import { RichMessage } from '@/components/common/rich-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { listTypeEnumValues } from '@/db/schema/enums'
import { adminAppSettingsQueryKey, notifyAppSettingsChanged, useAdminAppSettings } from '@/hooks/use-app-settings'
import { useIsEmailConfigured } from '@/hooks/use-is-email-configured'
import { useObservabilityStatus } from '@/hooks/use-observability-status'
import { useStorageStatus } from '@/hooks/use-storage-status'
import { SUPPORTED_COUNTRIES } from '@/lib/holidays-countries'
import { COMMON_CURRENCIES } from '@/lib/i18n/currency'
import { currencySymbol } from '@/lib/i18n/format'
import { listTypeLabel } from '@/lib/i18n/labels'
import { fallbackLocale, localeDisplayName, matchLocale, offeredLocales } from '@/lib/i18n/locales'
import type { AppSettings } from '@/lib/settings'
import { m } from '@/paraglide/messages.js'

const IS_DEV = import.meta.env.DEV

const codeTag = (children: ReactNode) => <code>{children}</code>
const observabilityDocsLink = (children: ReactNode) => (
	<a href="https://giftwrapt.dev/configuration/observability/" className="underline" target="_blank" rel="noreferrer">
		{children}
	</a>
)

function useSettingsMutation() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (newSettings: Partial<AppSettings>) => {
			return await updateAppSettings({ data: newSettings } as Parameters<typeof updateAppSettings>[0])
		},
		onMutate: async newSettings => {
			await queryClient.cancelQueries({ queryKey: adminAppSettingsQueryKey })
			const previousSettings = queryClient.getQueryData<AppSettings>(adminAppSettingsQueryKey)
			queryClient.setQueryData<AppSettings>(adminAppSettingsQueryKey, old => ({
				...old!,
				...newSettings,
			}))
			const changedKeys = Object.keys(newSettings) as Array<keyof AppSettings>
			return { previousSettings, changedKeys }
		},
		onError: (error, _newSettings, context) => {
			if (context?.previousSettings) {
				queryClient.setQueryData(adminAppSettingsQueryKey, context.previousSettings)
			}
			const message = error instanceof Error ? error.message : m.admin_settings_update_failed()
			toast.error(message)
		},
		onSuccess: (data, _variables, context) => {
			queryClient.setQueryData<AppSettings>(adminAppSettingsQueryKey, old => {
				const updated = { ...old! }
				for (const key of context.changedKeys) {
					;(updated as Record<string, unknown>)[key] = data[key]
				}
				return updated
			})
			notifyAppSettingsChanged(queryClient)
			toast.success(m.admin_settings_updated())
		},
	})
}

function useSettingsEditor() {
	const { data: settings, isLoading } = useAdminAppSettings()
	const mutation = useSettingsMutation()

	const handleSettingChange = <T extends keyof AppSettings>(key: T, value: AppSettings[T]) => {
		mutation.mutate({ [key]: value })
	}

	return { settings, isLoading, handleSettingChange }
}

function LoadingOrEmpty({ isLoading, settings }: { isLoading: boolean; settings: AppSettings | undefined }) {
	if (isLoading) return <div className="text-sm text-muted-foreground">{m.admin_settings_app_loading()}</div>
	if (!settings) return <div className="text-sm text-muted-foreground">{m.admin_settings_app_empty()}</div>
	return null
}

// The short list, plus the current value when it was set to something else
// (any ISO 4217 code is valid; see `lib/i18n/currency.ts`).
function currencyChoices(current: string): Array<string> {
	const common: ReadonlyArray<string> = COMMON_CURRENCIES
	return common.includes(current) ? [...common] : [current, ...common]
}

export function CoreSettingsSection() {
	const { settings, isLoading, handleSettingChange } = useSettingsEditor()

	if (!settings) return <LoadingOrEmpty isLoading={isLoading} settings={settings} />

	return (
		<div className="space-y-6">
			<AppTitleField currentValue={settings.appTitle} onSave={value => handleSettingChange('appTitle', value)} />

			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="defaultListType" className="text-base">
						{m.admin_settings_app_default_list_type_label()}
					</Label>
					<p className="text-sm text-muted-foreground">{m.admin_settings_app_default_list_type_description()}</p>
				</div>
				<Select
					value={settings.defaultListType}
					onValueChange={value => handleSettingChange('defaultListType', value as AppSettings['defaultListType'])}
				>
					<SelectTrigger id="defaultListType" className="w-auto min-w-35 shrink-0">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{listTypeEnumValues.map(type => {
							if (type === 'christmas' && !settings.enableChristmasLists) return null
							if (type === 'birthday' && !settings.enableBirthdayLists) return null
							if (type === 'holiday' && !settings.enableGenericHolidayLists) return null
							if (type === 'todos' && !settings.enableTodoLists) return null
							if (type === 'test' && !IS_DEV) return null
							return (
								<SelectItem key={type} value={type}>
									{listTypeLabel(type)}
								</SelectItem>
							)
						})}
					</SelectContent>
				</Select>
			</div>

			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="timeZone" className="text-base">
						{m.admin_settings_app_time_zone_label()}
					</Label>
					<p className="text-sm text-muted-foreground">{m.admin_settings_app_time_zone_description()}</p>
				</div>
				<TimeZonePicker id="timeZone" value={settings.timeZone} onChange={value => handleSettingChange('timeZone', value)} />
			</div>

			{/* Only when the deployment offers more than one language (APP_LOCALES).
			    Until an admin picks, the default is the first one listed. */}
			{offeredLocales().length > 1 && (
				<div className="flex items-center justify-between gap-4">
					<div className="space-y-0.5">
						<Label htmlFor="defaultLocale" className="text-base">
							{m.admin_settings_app_default_locale_label()}
						</Label>
						<p className="text-sm text-muted-foreground">{m.admin_settings_app_default_locale_description()}</p>
					</div>
					<Select
						value={matchLocale(settings.defaultLocale) ?? fallbackLocale()}
						onValueChange={value => handleSettingChange('defaultLocale', value)}
					>
						<SelectTrigger id="defaultLocale" className="w-auto min-w-35 shrink-0">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{offeredLocales().map(locale => (
								<SelectItem key={locale} value={locale} lang={locale}>
									{localeDisplayName(locale)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}

			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="defaultCurrency" className="text-base">
						{m.admin_settings_app_default_currency_label()}
					</Label>
					<p className="text-sm text-muted-foreground">{m.admin_settings_app_default_currency_description()}</p>
				</div>
				<Select value={settings.defaultCurrency} onValueChange={value => handleSettingChange('defaultCurrency', value)}>
					<SelectTrigger id="defaultCurrency" className="w-auto min-w-35 shrink-0">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{currencyChoices(settings.defaultCurrency).map(code => (
							<SelectItem key={code} value={code}>
								{code} ({currencySymbol(code)})
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="enableMobileApp" className="text-base">
						{m.admin_settings_app_mobile_app_label()}
					</Label>
					<p className="text-sm text-muted-foreground">{m.admin_settings_app_mobile_app_description()}</p>
				</div>
				<Switch
					id="enableMobileApp"
					checked={settings.enableMobileApp}
					onCheckedChange={checked => handleSettingChange('enableMobileApp', checked)}
				/>
			</div>

			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="enableMcp" className="text-base">
						{m.admin_settings_app_mcp_label()}
					</Label>
					<p className="text-sm text-muted-foreground">{m.admin_settings_app_mcp_description()}</p>
				</div>
				<Switch id="enableMcp" checked={settings.enableMcp} onCheckedChange={checked => handleSettingChange('enableMcp', checked)} />
			</div>
		</div>
	)
}

export function ChristmasSettingsSection() {
	const { settings, isLoading, handleSettingChange } = useSettingsEditor()
	const { data: emailConfigured } = useIsEmailConfigured()

	if (!settings) return <LoadingOrEmpty isLoading={isLoading} settings={settings} />

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="enableChristmasLists" className="text-base">
						{m.admin_settings_app_christmas_lists_label()}
					</Label>
					<p className="text-sm text-muted-foreground">{m.admin_settings_app_christmas_lists_description()}</p>
				</div>
				<Switch
					id="enableChristmasLists"
					checked={settings.enableChristmasLists}
					onCheckedChange={checked => handleSettingChange('enableChristmasLists', checked)}
				/>
			</div>

			<div className={`flex items-center justify-between gap-4 pl-6 ${settings.enableChristmasLists ? '' : 'opacity-50'}`}>
				<DaysSetting
					id="archiveDaysAfterChristmas"
					label={m.admin_settings_app_christmas_archive_label()}
					description={m.admin_settings_app_christmas_archive_description()}
					value={settings.archiveDaysAfterChristmas}
					disabled={!settings.enableChristmasLists}
					onCommit={value => handleSettingChange('archiveDaysAfterChristmas', value)}
				/>
			</div>

			{emailConfigured && (
				<div className={`flex items-center justify-between gap-4 pl-6 ${settings.enableChristmasLists ? '' : 'opacity-50'}`}>
					<div className="space-y-0.5">
						<Label htmlFor="enableChristmasEmails" className="text-base">
							{m.admin_settings_app_christmas_emails_label()}
						</Label>
						<p className="text-sm text-muted-foreground">{m.admin_settings_app_christmas_emails_description()}</p>
					</div>
					<Switch
						id="enableChristmasEmails"
						checked={settings.enableChristmasEmails}
						disabled={!settings.enableChristmasLists}
						onCheckedChange={checked => handleSettingChange('enableChristmasEmails', checked)}
					/>
				</div>
			)}

			{emailConfigured && (
				<div className={`flex items-center justify-between gap-4 pl-6 ${settings.enableChristmasLists ? '' : 'opacity-50'}`}>
					<div className="space-y-0.5">
						<Label htmlFor="enableChristmasReminderEmails" className="text-base">
							{m.admin_settings_app_christmas_reminder_emails_label()}
						</Label>
						<p className="text-sm text-muted-foreground">{m.admin_settings_app_christmas_reminder_emails_description()}</p>
					</div>
					<Switch
						id="enableChristmasReminderEmails"
						checked={settings.enableChristmasReminderEmails}
						disabled={!settings.enableChristmasLists}
						onCheckedChange={checked => handleSettingChange('enableChristmasReminderEmails', checked)}
					/>
				</div>
			)}

			{emailConfigured && (
				<div
					className={`flex items-center justify-between gap-4 pl-12 ${settings.enableChristmasReminderEmails && settings.enableChristmasLists ? '' : 'opacity-50'}`}
				>
					<DaysSetting
						id="christmasReminderLeadDays"
						label={m.admin_settings_app_christmas_reminder_lead_label()}
						description={m.admin_settings_app_christmas_reminder_lead_description()}
						value={settings.christmasReminderLeadDays}
						disabled={!settings.enableChristmasReminderEmails || !settings.enableChristmasLists}
						onCommit={value => handleSettingChange('christmasReminderLeadDays', value)}
					/>
				</div>
			)}
		</div>
	)
}

export function GenericHolidaySettingsSection() {
	const { settings, isLoading, handleSettingChange } = useSettingsEditor()
	const { data: emailConfigured } = useIsEmailConfigured()

	if (!settings) return <LoadingOrEmpty isLoading={isLoading} settings={settings} />

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="enableGenericHolidayLists" className="text-base">
						{m.admin_settings_app_holiday_lists_label()}
					</Label>
					<p className="text-sm text-muted-foreground">{m.admin_settings_app_holiday_lists_description()}</p>
				</div>
				<Switch
					id="enableGenericHolidayLists"
					checked={settings.enableGenericHolidayLists}
					onCheckedChange={checked => handleSettingChange('enableGenericHolidayLists', checked)}
				/>
			</div>

			<div className={`flex items-center justify-between gap-4 pl-6 ${settings.enableGenericHolidayLists ? '' : 'opacity-50'}`}>
				<DaysSetting
					id="archiveDaysAfterHoliday"
					label={m.admin_settings_app_holiday_archive_label()}
					description={m.admin_settings_app_holiday_archive_description()}
					value={settings.archiveDaysAfterHoliday}
					disabled={!settings.enableGenericHolidayLists}
					onCommit={value => handleSettingChange('archiveDaysAfterHoliday', value)}
				/>
			</div>

			<div className="flex items-center justify-between gap-4">
				<DaysSetting
					id="maxArchiveDeferDays"
					label={m.admin_settings_app_max_archive_defer_label()}
					description={m.admin_settings_app_max_archive_defer_description()}
					value={settings.maxArchiveDeferDays}
					onCommit={value => handleSettingChange('maxArchiveDeferDays', value)}
				/>
			</div>

			{emailConfigured && (
				<div className={`flex items-center justify-between gap-4 pl-6 ${settings.enableGenericHolidayLists ? '' : 'opacity-50'}`}>
					<div className="space-y-0.5">
						<Label htmlFor="enableGenericHolidayEmails" className="text-base">
							{m.admin_settings_app_holiday_emails_label()}
						</Label>
						<p className="text-sm text-muted-foreground">{m.admin_settings_app_holiday_emails_description()}</p>
					</div>
					<Switch
						id="enableGenericHolidayEmails"
						checked={settings.enableGenericHolidayEmails}
						disabled={!settings.enableGenericHolidayLists}
						onCheckedChange={checked => handleSettingChange('enableGenericHolidayEmails', checked)}
					/>
				</div>
			)}

			{emailConfigured && (
				<div className={`flex items-center justify-between gap-4 pl-6 ${settings.enableGenericHolidayLists ? '' : 'opacity-50'}`}>
					<div className="space-y-0.5">
						<Label htmlFor="enableHolidayReminderEmails" className="text-base">
							{m.admin_settings_app_holiday_reminder_emails_label()}
						</Label>
						<p className="text-sm text-muted-foreground">{m.admin_settings_app_holiday_reminder_emails_description()}</p>
					</div>
					<Switch
						id="enableHolidayReminderEmails"
						checked={settings.enableHolidayReminderEmails}
						disabled={!settings.enableGenericHolidayLists}
						onCheckedChange={checked => handleSettingChange('enableHolidayReminderEmails', checked)}
					/>
				</div>
			)}

			{emailConfigured && (
				<div
					className={`flex items-center justify-between gap-4 pl-12 ${settings.enableHolidayReminderEmails && settings.enableGenericHolidayLists ? '' : 'opacity-50'}`}
				>
					<DaysSetting
						id="holidayReminderLeadDays"
						label={m.admin_settings_app_holiday_reminder_lead_label()}
						description={m.admin_settings_app_holiday_reminder_lead_description()}
						value={settings.holidayReminderLeadDays}
						disabled={!settings.enableHolidayReminderEmails || !settings.enableGenericHolidayLists}
						onCommit={value => handleSettingChange('holidayReminderLeadDays', value)}
					/>
				</div>
			)}
		</div>
	)
}

export function BirthdaySettingsSection() {
	const { settings, isLoading, handleSettingChange } = useSettingsEditor()
	const { data: emailConfigured } = useIsEmailConfigured()

	if (!settings) return <LoadingOrEmpty isLoading={isLoading} settings={settings} />

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="enableBirthdayLists" className="text-base">
						{m.admin_settings_app_birthday_lists_label()}
					</Label>
					<p className="text-sm text-muted-foreground">{m.admin_settings_app_birthday_lists_description()}</p>
				</div>
				<Switch
					id="enableBirthdayLists"
					checked={settings.enableBirthdayLists}
					onCheckedChange={checked => handleSettingChange('enableBirthdayLists', checked)}
				/>
			</div>

			<div className={`flex items-center justify-between gap-4 pl-6 ${settings.enableBirthdayLists ? '' : 'opacity-50'}`}>
				<DaysSetting
					id="archiveDaysAfterBirthday"
					label={m.admin_settings_app_birthday_archive_label()}
					description={m.admin_settings_app_birthday_archive_description()}
					value={settings.archiveDaysAfterBirthday}
					disabled={!settings.enableBirthdayLists}
					onCommit={value => handleSettingChange('archiveDaysAfterBirthday', value)}
				/>
			</div>

			{emailConfigured && (
				<div className={`flex items-center justify-between gap-4 pl-6 ${settings.enableBirthdayLists ? '' : 'opacity-50'}`}>
					<div className="space-y-0.5">
						<Label htmlFor="enableBirthdayEmails" className="text-base">
							{m.admin_settings_app_birthday_emails_label()}
						</Label>
						<p className="text-sm text-muted-foreground">{m.admin_settings_app_birthday_emails_description()}</p>
					</div>
					<Switch
						id="enableBirthdayEmails"
						checked={settings.enableBirthdayEmails}
						disabled={!settings.enableBirthdayLists}
						onCheckedChange={checked => handleSettingChange('enableBirthdayEmails', checked)}
					/>
				</div>
			)}

			{emailConfigured && (
				<div className={`flex items-center justify-between gap-4 pl-6 ${settings.enableBirthdayLists ? '' : 'opacity-50'}`}>
					<div className="space-y-0.5">
						<Label htmlFor="enableBirthdayReminderEmails" className="text-base">
							{m.admin_settings_app_birthday_reminder_emails_label()}
						</Label>
						<p className="text-sm text-muted-foreground">{m.admin_settings_app_birthday_reminder_emails_description()}</p>
					</div>
					<Switch
						id="enableBirthdayReminderEmails"
						checked={settings.enableBirthdayReminderEmails}
						disabled={!settings.enableBirthdayLists}
						onCheckedChange={checked => handleSettingChange('enableBirthdayReminderEmails', checked)}
					/>
				</div>
			)}

			{emailConfigured && (
				<div
					className={`flex items-center justify-between gap-4 pl-12 ${settings.enableBirthdayReminderEmails && settings.enableBirthdayLists ? '' : 'opacity-50'}`}
				>
					<DaysSetting
						id="birthdayReminderLeadDays"
						label={m.admin_settings_app_birthday_reminder_lead_label()}
						description={m.admin_settings_app_birthday_reminder_lead_description()}
						value={settings.birthdayReminderLeadDays}
						disabled={!settings.enableBirthdayReminderEmails || !settings.enableBirthdayLists}
						onCommit={value => handleSettingChange('birthdayReminderLeadDays', value)}
					/>
				</div>
			)}
		</div>
	)
}

type ReminderFamilyArgs = {
	settings: AppSettings
	emailConfigured: boolean
	handleSettingChange: <T extends keyof AppSettings>(key: T, value: AppSettings[T]) => void
	masterKey: keyof AppSettings
	leadDaysKey: keyof AppSettings
	emailKey: keyof AppSettings
	title: string
	description: string
	leadDescription: string
	emailLabel: string
}

function ReminderFamilyBlock({
	settings,
	emailConfigured,
	handleSettingChange,
	masterKey,
	leadDaysKey,
	emailKey,
	title,
	description,
	leadDescription,
	emailLabel,
}: ReminderFamilyArgs) {
	const masterOn = settings[masterKey] as boolean
	const emailOn = settings[emailKey] as boolean
	const leadDays = settings[leadDaysKey] as number
	return (
		<div className="space-y-4 border-t pt-4 first:border-t-0 first:pt-0">
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor={masterKey as string} className="text-base">
						{title}
					</Label>
					<p className="text-sm text-muted-foreground">{description}</p>
				</div>
				<Switch
					id={masterKey as string}
					checked={masterOn}
					onCheckedChange={checked => handleSettingChange(masterKey, checked as AppSettings[typeof masterKey])}
				/>
			</div>
			<div className={`flex items-center justify-between gap-4 pl-6 ${masterOn ? '' : 'opacity-50'}`}>
				<DaysSetting
					id={leadDaysKey as string}
					label={m.admin_settings_app_reminder_lead_label()}
					description={leadDescription}
					value={leadDays}
					disabled={!masterOn}
					onCommit={value => handleSettingChange(leadDaysKey, value as AppSettings[typeof leadDaysKey])}
				/>
			</div>
			{emailConfigured && (
				<div className={`flex items-center justify-between gap-4 pl-6 ${masterOn ? '' : 'opacity-50'}`}>
					<div className="space-y-0.5">
						<Label htmlFor={emailKey as string} className="text-base">
							{emailLabel}
						</Label>
						<p className="text-sm text-muted-foreground">{m.admin_settings_app_reminder_emails_description()}</p>
					</div>
					<Switch
						id={emailKey as string}
						checked={emailOn}
						disabled={!masterOn}
						onCheckedChange={checked => handleSettingChange(emailKey, checked as AppSettings[typeof emailKey])}
					/>
				</div>
			)}
		</div>
	)
}

export function ParentalRelationsSettingsSection() {
	const { settings, isLoading, handleSettingChange } = useSettingsEditor()
	const { data: emailConfigured } = useIsEmailConfigured()

	if (!settings) return <LoadingOrEmpty isLoading={isLoading} settings={settings} />

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="relationshipRemindersCountry" className="text-base">
						{m.admin_settings_app_reminders_country_label()}
					</Label>
					<p className="text-sm text-muted-foreground">{m.admin_settings_app_reminders_country_description()}</p>
				</div>
				<Select
					value={settings.relationshipRemindersCountry}
					onValueChange={value => handleSettingChange('relationshipRemindersCountry', value)}
				>
					<SelectTrigger id="relationshipRemindersCountry" className="w-50">
						<SelectValue />
					</SelectTrigger>
					{/*
					 * Sourced from SUPPORTED_COUNTRIES so adding a country to
					 * the helper there flows through to the admin picker
					 * automatically. The list intentionally tracks the catalog
					 * seed - new entries to one without the other surface
					 * users with no resolvable Mother's / Father's Day.
					 */}
					<SelectContent>
						{SUPPORTED_COUNTRIES.map(c => (
							<SelectItem key={c.code} value={c.code}>
								{c.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<ReminderFamilyBlock
				settings={settings}
				emailConfigured={!!emailConfigured}
				handleSettingChange={handleSettingChange}
				masterKey="enableMothersDayReminders"
				leadDaysKey="mothersDayReminderLeadDays"
				emailKey="enableMothersDayReminderEmails"
				title={m.admin_settings_app_mothers_day_title()}
				description={m.admin_settings_app_mothers_day_description()}
				leadDescription={m.admin_settings_app_mothers_day_lead_description()}
				emailLabel={m.admin_settings_app_mothers_day_emails_label()}
			/>
			<ReminderFamilyBlock
				settings={settings}
				emailConfigured={!!emailConfigured}
				handleSettingChange={handleSettingChange}
				masterKey="enableFathersDayReminders"
				leadDaysKey="fathersDayReminderLeadDays"
				emailKey="enableFathersDayReminderEmails"
				title={m.admin_settings_app_fathers_day_title()}
				description={m.admin_settings_app_fathers_day_description()}
				leadDescription={m.admin_settings_app_fathers_day_lead_description()}
				emailLabel={m.admin_settings_app_fathers_day_emails_label()}
			/>
			<ReminderFamilyBlock
				settings={settings}
				emailConfigured={!!emailConfigured}
				handleSettingChange={handleSettingChange}
				masterKey="enableValentinesDayReminders"
				leadDaysKey="valentinesDayReminderLeadDays"
				emailKey="enableValentinesDayReminderEmails"
				title={m.admin_settings_app_valentines_day_title()}
				description={m.admin_settings_app_valentines_day_description()}
				leadDescription={m.admin_settings_app_valentines_day_lead_description()}
				emailLabel={m.admin_settings_app_valentines_day_emails_label()}
			/>
			<ReminderFamilyBlock
				settings={settings}
				emailConfigured={!!emailConfigured}
				handleSettingChange={handleSettingChange}
				masterKey="enableAnniversaryReminders"
				leadDaysKey="anniversaryReminderLeadDays"
				emailKey="enableAnniversaryReminderEmails"
				title={m.admin_settings_app_anniversary_title()}
				description={m.admin_settings_app_anniversary_description()}
				leadDescription={m.admin_settings_app_anniversary_lead_description()}
				emailLabel={m.admin_settings_app_anniversary_emails_label()}
			/>
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="enableReminderPicks" className="text-base">
						{m.admin_settings_app_reminder_picks_label()}
					</Label>
					<p className="text-sm text-muted-foreground">{m.admin_settings_app_reminder_picks_description()}</p>
				</div>
				<Switch
					id="enableReminderPicks"
					checked={settings.enableReminderPicks}
					disabled={!emailConfigured}
					onCheckedChange={checked => handleSettingChange('enableReminderPicks', checked)}
				/>
			</div>
		</div>
	)
}

export function TodoSettingsSection() {
	const { settings, isLoading, handleSettingChange } = useSettingsEditor()

	if (!settings) return <LoadingOrEmpty isLoading={isLoading} settings={settings} />

	return (
		<div className="flex items-center justify-between gap-4">
			<div className="space-y-0.5">
				<Label htmlFor="enableTodoLists" className="text-base">
					{m.admin_settings_app_todo_lists_label()}
				</Label>
				<p className="text-sm text-muted-foreground">{m.admin_settings_app_todo_lists_description()}</p>
			</div>
			<Switch
				id="enableTodoLists"
				checked={settings.enableTodoLists}
				onCheckedChange={checked => handleSettingChange('enableTodoLists', checked)}
			/>
		</div>
	)
}

export function CommentsSettingsSection() {
	const { settings, isLoading, handleSettingChange } = useSettingsEditor()
	const { data: emailConfigured } = useIsEmailConfigured()

	if (!settings) return <LoadingOrEmpty isLoading={isLoading} settings={settings} />

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="enableComments" className="text-base">
						{m.admin_settings_app_comments_label()}
					</Label>
					<p className="text-sm text-muted-foreground">{m.admin_settings_app_comments_description()}</p>
				</div>
				<Switch
					id="enableComments"
					checked={settings.enableComments}
					onCheckedChange={checked => handleSettingChange('enableComments', checked)}
				/>
			</div>

			{emailConfigured && (
				<div className={`flex items-center justify-between gap-4 pl-6 ${settings.enableComments ? '' : 'opacity-50'}`}>
					<div className="space-y-0.5">
						<Label htmlFor="enableCommentEmails" className="text-base">
							{m.admin_settings_app_comment_emails_label()}
						</Label>
						<p className="text-sm text-muted-foreground">{m.admin_settings_app_comment_emails_description()}</p>
					</div>
					<Switch
						id="enableCommentEmails"
						checked={settings.enableCommentEmails}
						disabled={!settings.enableComments}
						onCheckedChange={checked => handleSettingChange('enableCommentEmails', checked)}
					/>
				</div>
			)}
		</div>
	)
}

// On the Email page (plan 39). Read at send time; off stops both gift
// exchange emails and nothing else.
export function GiftExchangeEmailSettingsSection() {
	const { settings, isLoading, handleSettingChange } = useSettingsEditor()

	if (!settings) return <LoadingOrEmpty isLoading={isLoading} settings={settings} />

	return (
		<div className="flex items-center justify-between gap-4">
			<div className="space-y-0.5">
				<Label htmlFor="enableGiftExchangeEmails" className="text-base">
					{m.admin_settings_email_gift_exchange_label()}
				</Label>
				<p className="text-sm text-muted-foreground">{m.admin_settings_email_gift_exchange_description()}</p>
			</div>
			<Switch
				id="enableGiftExchangeEmails"
				checked={settings.enableGiftExchangeEmails}
				onCheckedChange={checked => handleSettingChange('enableGiftExchangeEmails', checked)}
			/>
		</div>
	)
}

export function AuthSettingsSection() {
	const { settings, isLoading, handleSettingChange } = useSettingsEditor()

	if (!settings) return <LoadingOrEmpty isLoading={isLoading} settings={settings} />

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="enableSignUps" className="text-base">
						{m.admin_settings_app_sign_ups_label()}
					</Label>
					<p className="text-sm text-muted-foreground">{m.admin_settings_app_sign_ups_description()}</p>
				</div>
				<Switch
					id="enableSignUps"
					checked={settings.enableSignUps}
					onCheckedChange={checked => handleSettingChange('enableSignUps', checked)}
				/>
			</div>

			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="enablePasskeys" className="text-base">
						{m.admin_settings_app_passkeys_label()}
					</Label>
					<p className="text-sm text-muted-foreground">{m.admin_settings_app_passkeys_description()}</p>
				</div>
				<Switch
					id="enablePasskeys"
					checked={settings.enablePasskeys}
					onCheckedChange={checked => handleSettingChange('enablePasskeys', checked)}
				/>
			</div>
		</div>
	)
}

export function ObservabilitySettingsSection() {
	const { settings, isLoading, handleSettingChange } = useSettingsEditor()
	const { data: status } = useObservabilityStatus()

	if (!settings) return <LoadingOrEmpty isLoading={isLoading} settings={settings} />

	const sentryEnvMissing = status ? !status.sentry.enabled && status.sentry.reason === 'env-missing' : false
	// Follows the live toggle rather than status.sentry.enabled, which is only
	// refetched on page load.
	const canSendSentryTest = status !== undefined && !sentryEnvMissing && settings.enableSentry
	const metricsEnvMissing = status ? !status.metrics.enabled && status.metrics.reason === 'env-missing' : false

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="enableSentry" className="text-base">
						{m.admin_settings_app_sentry_label()}
					</Label>
					<p className="text-sm text-muted-foreground">
						<RichMessage parts={m.admin_settings_app_sentry_description.parts()} tags={{ code: codeTag, link: observabilityDocsLink }} />
					</p>
					{sentryEnvMissing && (
						<p className="text-sm text-amber-500">
							<RichMessage parts={m.admin_settings_app_sentry_env_missing.parts()} tags={{ code: codeTag }} />
						</p>
					)}
					{canSendSentryTest && (
						<div className="pt-2">
							<SendSentryTestErrorButton />
						</div>
					)}
				</div>
				<Switch
					id="enableSentry"
					checked={settings.enableSentry}
					disabled={sentryEnvMissing}
					onCheckedChange={checked => handleSettingChange('enableSentry', checked)}
				/>
			</div>

			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="enableMetrics" className="text-base">
						{m.admin_settings_app_metrics_label()}
					</Label>
					<p className="text-sm text-muted-foreground">
						<RichMessage parts={m.admin_settings_app_metrics_description.parts()} tags={{ code: codeTag, link: observabilityDocsLink }} />
					</p>
					{metricsEnvMissing && (
						<p className="text-sm text-amber-500">
							<RichMessage parts={m.admin_settings_app_metrics_env_missing.parts()} tags={{ code: codeTag }} />
						</p>
					)}
				</div>
				<Switch
					id="enableMetrics"
					checked={settings.enableMetrics}
					disabled={metricsEnvMissing}
					onCheckedChange={checked => handleSettingChange('enableMetrics', checked)}
				/>
			</div>
		</div>
	)
}

export function StorageMirrorSection() {
	const { settings, isLoading, handleSettingChange } = useSettingsEditor()
	const { configured: storageConfigured } = useStorageStatus()

	if (!settings) return <LoadingOrEmpty isLoading={isLoading} settings={settings} />

	return (
		<div className={`flex items-center justify-between gap-4 ${storageConfigured ? '' : 'opacity-50'}`}>
			<div className="space-y-0.5">
				<Label htmlFor="mirrorExternalImagesOnSave" className="text-base">
					{m.admin_settings_app_mirror_images_label()}
				</Label>
				<p className="text-sm text-muted-foreground">{m.admin_settings_app_mirror_images_description()}</p>
			</div>
			<Switch
				id="mirrorExternalImagesOnSave"
				checked={settings.mirrorExternalImagesOnSave}
				disabled={!storageConfigured}
				onCheckedChange={checked => handleSettingChange('mirrorExternalImagesOnSave', checked)}
			/>
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

interface AppTitleFieldProps {
	currentValue: string
	onSave: (next: string) => void
}

function AppTitleField({ currentValue, onSave }: AppTitleFieldProps) {
	const [draft, setDraft] = useState(currentValue)

	useEffect(() => {
		setDraft(currentValue)
	}, [currentValue])

	const handleCommit = () => {
		const trimmed = draft.trim()
		if (trimmed.length === 0) {
			setDraft(currentValue)
			return
		}
		if (trimmed === currentValue) return
		onSave(trimmed)
	}

	return (
		<div className="flex items-center justify-between gap-4">
			<div className="space-y-0.5">
				<Label htmlFor="appTitle" className="text-base">
					{m.admin_settings_app_title_label()}
				</Label>
				<p className="text-sm text-muted-foreground">{m.admin_settings_app_title_description()}</p>
			</div>
			<Input
				id="appTitle"
				type="text"
				maxLength={80}
				value={draft}
				onChange={e => setDraft(e.target.value)}
				onBlur={handleCommit}
				onKeyDown={e => {
					if (e.key === 'Enter') {
						e.currentTarget.blur()
					}
				}}
				className="w-48"
			/>
		</div>
	)
}

function DaysSetting({ id, label, description, value, disabled, onCommit }: DaysSettingProps) {
	const [draft, setDraft] = useState(String(value))

	useEffect(() => {
		setDraft(String(value))
	}, [value])

	const handleCommit = () => {
		const parsed = parseInt(draft, 10)
		if (!Number.isFinite(parsed) || parsed < 1) {
			setDraft(String(value))
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
				<span className="text-sm text-muted-foreground">{m.admin_settings_app_days_unit()}</span>
			</div>
		</>
	)
}
