import type { EnvExampleSection } from '../types.ts'

/**
 * Client-side / logging knobs. Today this section also documents
 * `VITE_APP_TITLE` - keep operator-tunable knobs together rather than
 * splitting them into separate features.
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
