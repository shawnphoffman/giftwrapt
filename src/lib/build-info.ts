// Build-time identity injected by vite.config.ts via VITE_* env vars.
// Values are inlined into the bundle at build; reading them at runtime is just
// a property access.
export interface VercelInfo {
	env: string
	url: string
	branchUrl: string
	gitCommitRef: string
	gitRepoSlug: string
	deploymentId: string
	projectProductionUrl: string
}

export interface BuildInfo {
	version: string
	commit: string
	commitShort: string
	buildTime: string
	vercel?: VercelInfo
}

const version = import.meta.env.VITE_APP_VERSION ?? '0.0.0'
const commit = import.meta.env.VITE_APP_COMMIT ?? ''
const buildTime = import.meta.env.VITE_APP_BUILD_TIME ?? ''

const vercelEnv = import.meta.env.VITE_VERCEL_ENV
const vercel: VercelInfo | undefined = vercelEnv
	? {
			env: vercelEnv,
			url: import.meta.env.VITE_VERCEL_URL ?? '',
			branchUrl: import.meta.env.VITE_VERCEL_BRANCH_URL ?? '',
			gitCommitRef: import.meta.env.VITE_VERCEL_GIT_COMMIT_REF ?? '',
			gitRepoSlug: import.meta.env.VITE_VERCEL_GIT_REPO_SLUG ?? '',
			deploymentId: import.meta.env.VITE_VERCEL_DEPLOYMENT_ID ?? '',
			projectProductionUrl: import.meta.env.VITE_VERCEL_PROJECT_PRODUCTION_URL ?? '',
		}
	: undefined

export const BUILD_INFO: BuildInfo = {
	version,
	commit,
	commitShort: commit ? commit.slice(0, 7) : '',
	buildTime,
	vercel,
}
