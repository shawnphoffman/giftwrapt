// Build-time identity injected by vite.config.ts via VITE_* env vars.
// Values are inlined into the bundle at build; reading them at runtime is just
// a property access.
export interface BuildInfo {
	version: string
	commit: string
	commitShort: string
	buildTime: string
}

const version = import.meta.env.VITE_APP_VERSION ?? '0.0.0'
const commit = import.meta.env.VITE_APP_COMMIT ?? ''
const buildTime = import.meta.env.VITE_APP_BUILD_TIME ?? ''

export const BUILD_INFO: BuildInfo = {
	version,
	commit,
	commitShort: commit ? commit.slice(0, 7) : '',
	buildTime,
}
