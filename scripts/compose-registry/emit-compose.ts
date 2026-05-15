import type { ComposeTarget } from './types.ts'

/**
 * Emit a self-contained compose YAML string from a ComposeTarget. Output
 * layout:
 *
 *   <header>
 *   services:
 *     <service-1-name>:
 *       <body>
 *
 *     <leading-comment, if any>
 *     <service-2-name>:
 *       <body>
 *   ...
 *
 *   volumes:
 *     <volume-1>:
 *     <volume-2>:
 *
 * Service bodies are stored in feature modules with their leading 4-space
 * indent and trailing newline; the emitter prepends the `  <name>:\n` line
 * and joins entries with a blank-line separator.
 */
export function emitCompose(target: ComposeTarget): string {
	const parts: Array<string> = []
	parts.push(target.header)
	parts.push('services:\n')

	const serviceChunks: Array<string> = []
	for (const feature of target.features) {
		if (!feature.services) continue
		for (const svc of feature.services) {
			const head = svc.leadingComment ? `${svc.leadingComment}\n  ${svc.name}:\n` : `  ${svc.name}:\n`
			serviceChunks.push(`${head}${svc.body}`)
		}
	}
	parts.push(serviceChunks.join('\n'))

	const volumes: Array<string> = []
	for (const feature of target.features) {
		if (!feature.volumes) continue
		for (const v of feature.volumes) volumes.push(`  ${v}:\n`)
	}
	if (volumes.length > 0) {
		parts.push('\nvolumes:\n')
		parts.push(volumes.join(''))
	}

	return parts.join('')
}
