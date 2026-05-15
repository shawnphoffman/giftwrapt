import type { EnvTarget } from './types.ts'

/**
 * Emit a `.env.example` string from an EnvTarget. Output layout:
 *
 *   <header>
 *   <section-1 body>
 *
 *   <section-2 body>
 *   ...
 *
 * Each section body is stored with its leading `# ----` divider header and
 * a trailing newline (except the LAST section, which is allowed to end
 * without a trailing newline so the final output matches the current
 * `.env.example`, which ends mid-line on `# GARAGE_ADMIN_URL=...`).
 *
 * Sections are joined with a single `\n` separator. Combined with each
 * body's trailing newline that produces a blank line between sections.
 */
export function emitEnv(target: EnvTarget): string {
	return target.header + target.sections.map(s => s.body).join('\n')
}
