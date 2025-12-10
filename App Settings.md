# App Settings

// In any component (with loading state)
const { data: settings, isLoading } = useAppSettings()

// With Suspense (wrap component in <Suspense>)
const { data: settings } = useAppSettingsSuspense()

// Get a single setting
const enableHolidayLists = useAppSetting('enableHolidayLists')