import type { EnvExampleSection } from '../types.ts'

/**
 * Client-side / logging knobs. Today this section also documents
 * `VITE_APP_TITLE` and the TanStack devtools toggle - keep them together
 * because they're all "tunables the operator may flip" rather than
 * separate features.
 */
export const clientEnvSection: EnvExampleSection = {
	id: 'client',
	body: `# -----------------------------------------------------------------------------
# Client-side - optional
# -----------------------------------------------------------------------------

LOG_LEVEL=info            # fatal | error | warn | info | debug | trace | silent
LOG_PRETTY=false          # set true to force pretty output in prod
`,
}

export const imageOverrideEnvSection: EnvExampleSection = {
	id: 'image-override',
	body: `# -----------------------------------------------------------------------------
# Docker image override - optional
# -----------------------------------------------------------------------------
# Override the app image used in the docker/compose.selfhost-*.yaml files.
# APP_IMAGE=ghcr.io/shawnphoffman/giftwrapt:latest
`,
}
