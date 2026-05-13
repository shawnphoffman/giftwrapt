import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { updateAppSettings } from '@/api/settings'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ListTypes } from '@/db/schema'
import { adminAppSettingsQueryKey, notifyAppSettingsChanged, useAdminAppSettings } from '@/hooks/use-app-settings'
import { useIsEmailConfigured } from '@/hooks/use-is-email-configured'
import { useStorageStatus } from '@/hooks/use-storage-status'
import { SUPPORTED_COUNTRIES } from '@/lib/holidays-countries'
import type { AppSettings } from '@/lib/settings'

const IS_DEV = import.meta.env.DEV

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
			const message = error instanceof Error ? error.message : 'Failed to update setting'
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
			toast.success('Setting updated')
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
	if (isLoading) return <div className="text-sm text-muted-foreground">Loading settings...</div>
	if (!settings) return <div className="text-sm text-muted-foreground">No settings found</div>
	return null
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
							if (type === 'christmas' && !settings.enableChristmasLists) return null
							if (type === 'birthday' && !settings.enableBirthdayLists) return null
							if (type === 'holiday' && !settings.enableGenericHolidayLists) return null
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

			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="enableMobileApp" className="text-base">
						Enable API & API Keys
					</Label>
					<p className="text-sm text-muted-foreground">
						Let users issue per-device API keys from their settings. Powers the iOS companion app and the MCP server.
					</p>
				</div>
				<Switch
					id="enableMobileApp"
					checked={settings.enableMobileApp}
					onCheckedChange={checked => handleSettingChange('enableMobileApp', checked)}
				/>
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
						Enable Christmas Lists
					</Label>
					<p className="text-sm text-muted-foreground">Allow users to create Christmas-themed lists</p>
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
					label="Archive after Christmas"
					description="Days after Dec 25 to automatically archive claimed items on Christmas lists"
					value={settings.archiveDaysAfterChristmas}
					disabled={!settings.enableChristmasLists}
					onCommit={value => handleSettingChange('archiveDaysAfterChristmas', value)}
				/>
			</div>

			{emailConfigured && (
				<div className={`flex items-center justify-between gap-4 pl-6 ${settings.enableChristmasLists ? '' : 'opacity-50'}`}>
					<div className="space-y-0.5">
						<Label htmlFor="enableChristmasEmails" className="text-base">
							Enable Christmas emails
						</Label>
						<p className="text-sm text-muted-foreground">Send Christmas-related emails to users</p>
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
							Send pre-Christmas reminder emails
						</Label>
						<p className="text-sm text-muted-foreground">Email every user N days before Christmas so they can spruce up their list</p>
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
						label="Christmas reminder lead time"
						description="Days before Dec 25 to send the pre-Christmas reminder email"
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
						Enable Holiday Lists
					</Label>
					<p className="text-sm text-muted-foreground">
						Allow users to create lists for occasions like Easter, Mother's Day, Halloween, Diwali, etc. Christmas remains a separate list
						type above.
					</p>
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
					label="Archive after holiday"
					description="Days after a holiday's end date to automatically archive claimed items on holiday-typed lists. Multi-day holidays archive against the end of the festival."
					value={settings.archiveDaysAfterHoliday}
					disabled={!settings.enableGenericHolidayLists}
					onCommit={value => handleSettingChange('archiveDaysAfterHoliday', value)}
				/>
			</div>

			{emailConfigured && (
				<div className={`flex items-center justify-between gap-4 pl-6 ${settings.enableGenericHolidayLists ? '' : 'opacity-50'}`}>
					<div className="space-y-0.5">
						<Label htmlFor="enableGenericHolidayEmails" className="text-base">
							Enable holiday emails
						</Label>
						<p className="text-sm text-muted-foreground">Send a generic post-holiday email when items are auto-archived on holiday lists</p>
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
							Send pre-holiday reminder emails
						</Label>
						<p className="text-sm text-muted-foreground">
							Broadcast a reminder N days before each custom holiday, prompting users to make a list
						</p>
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
						label="Holiday reminder lead time"
						description="Days before a holiday to broadcast the pre-holiday reminder"
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

			<div className={`flex items-center justify-between gap-4 pl-6 ${settings.enableBirthdayLists ? '' : 'opacity-50'}`}>
				<DaysSetting
					id="archiveDaysAfterBirthday"
					label="Archive after birthday"
					description="Days after a birthday to automatically archive claimed items on birthday/wishlist lists"
					value={settings.archiveDaysAfterBirthday}
					disabled={!settings.enableBirthdayLists}
					onCommit={value => handleSettingChange('archiveDaysAfterBirthday', value)}
				/>
			</div>

			{emailConfigured && (
				<div className={`flex items-center justify-between gap-4 pl-6 ${settings.enableBirthdayLists ? '' : 'opacity-50'}`}>
					<div className="space-y-0.5">
						<Label htmlFor="enableBirthdayEmails" className="text-base">
							Enable birthday emails
						</Label>
						<p className="text-sm text-muted-foreground">Send day-of birthday greetings and the post-birthday gift summary</p>
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
							Send pre-birthday reminder emails
						</Label>
						<p className="text-sm text-muted-foreground">Email each user N days before their birthday so they can spruce up their list</p>
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
						label="Birthday reminder lead time"
						description="Days before a birthday to send the pre-birthday reminder email"
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
					label="Reminder lead time"
					description={`Days before ${title} to send the reminder`}
					value={leadDays}
					disabled={!masterOn}
					onCommit={value => handleSettingChange(leadDaysKey, value as AppSettings[typeof leadDaysKey])}
				/>
			</div>
			{emailConfigured && (
				<div className={`flex items-center justify-between gap-4 pl-6 ${masterOn ? '' : 'opacity-50'}`}>
					<div className="space-y-0.5">
						<Label htmlFor={emailKey as string} className="text-base">
							Send {title} reminder emails
						</Label>
						<p className="text-sm text-muted-foreground">Email the reminder when the lead-time window matches</p>
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
						Country for Mother's / Father's Day
					</Label>
					<p className="text-sm text-muted-foreground">
						Used to resolve Mother's and Father's Day dates (which vary by country). Defaults to US.
					</p>
				</div>
				<Select
					value={settings.relationshipRemindersCountry}
					onValueChange={value => handleSettingChange('relationshipRemindersCountry', value)}
				>
					<SelectTrigger id="relationshipRemindersCountry" className="w-[200px]">
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
				title="Mother's Day"
				description="Reminders + parent-label tagging (mothers) for the people you shop for"
			/>
			<ReminderFamilyBlock
				settings={settings}
				emailConfigured={!!emailConfigured}
				handleSettingChange={handleSettingChange}
				masterKey="enableFathersDayReminders"
				leadDaysKey="fathersDayReminderLeadDays"
				emailKey="enableFathersDayReminderEmails"
				title="Father's Day"
				description="Reminders + parent-label tagging (fathers) for the people you shop for"
			/>
			<ReminderFamilyBlock
				settings={settings}
				emailConfigured={!!emailConfigured}
				handleSettingChange={handleSettingChange}
				masterKey="enableValentinesDayReminders"
				leadDaysKey="valentinesDayReminderLeadDays"
				emailKey="enableValentinesDayReminderEmails"
				title="Valentine's Day"
				description="Reminders for users with a partner (Feb 14 globally)"
			/>
			<ReminderFamilyBlock
				settings={settings}
				emailConfigured={!!emailConfigured}
				handleSettingChange={handleSettingChange}
				masterKey="enableAnniversaryReminders"
				leadDaysKey="anniversaryReminderLeadDays"
				emailKey="enableAnniversaryReminderEmails"
				title="Partner anniversary"
				description="Reminders + the anniversary date field on profiles. Both partners are emailed; clearing the master hides the input."
			/>
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

			{emailConfigured && (
				<div className={`flex items-center justify-between gap-4 pl-6 ${settings.enableComments ? '' : 'opacity-50'}`}>
					<div className="space-y-0.5">
						<Label htmlFor="enableCommentEmails" className="text-base">
							Enable Comment Emails
						</Label>
						<p className="text-sm text-muted-foreground">Email the list owner when someone comments on one of their items</p>
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

export function AuthSettingsSection() {
	const { settings, isLoading, handleSettingChange } = useSettingsEditor()

	if (!settings) return <LoadingOrEmpty isLoading={isLoading} settings={settings} />

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="enablePasskeys" className="text-base">
						Enable passkeys
					</Label>
					<p className="text-sm text-muted-foreground">
						Let signed-in users register WebAuthn passkeys (Touch ID, Face ID, hardware keys) and use them as a sign-in option. Off by
						default, turn on for HTTPS deployments only.
					</p>
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

export function StorageMirrorSection() {
	const { settings, isLoading, handleSettingChange } = useSettingsEditor()
	const { configured: storageConfigured } = useStorageStatus()

	if (!settings) return <LoadingOrEmpty isLoading={isLoading} settings={settings} />

	return (
		<div className={`flex items-center justify-between gap-4 ${storageConfigured ? '' : 'opacity-50'}`}>
			<div className="space-y-0.5">
				<Label htmlFor="mirrorExternalImagesOnSave" className="text-base">
					Mirror external images to storage on save
				</Label>
				<p className="text-sm text-muted-foreground">
					When saving an item, fetch any external image URL and copy it into your bucket. Best-effort: fetch failures keep the original URL.
					Requires storage to be configured. Existing items are not backfilled.
				</p>
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
					App Title
				</Label>
				<p className="text-sm text-muted-foreground">Shown in the browser tab, sidebar, and PWA install prompts</p>
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
				<span className="text-sm text-muted-foreground">days</span>
			</div>
		</>
	)
}
