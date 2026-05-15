/**
 * Types for the compose/env registry. See ./README.md (or the plan file at
 * `.notes/plans/`) for the rationale.
 *
 * The registry models each "feature" (a sidecar, an env-gated capability) as
 * a self-contained module that exports its YAML service block(s), the top-
 * level volumes it adds, and the `.env.example` section that documents its
 * variables. A `Target` declares which features compose into each output
 * file. The emitters are dumb concatenators - the registry IS the source.
 */

export type ServiceBlock = {
	/** Service name as it appears under `services:` in the compose file. */
	name: string
	/**
	 * YAML body for the service, indented to match a service entry (each
	 * line begins with at least 4 spaces). The block must NOT include the
	 * `  <name>:` line - the emitter prepends that. Trailing newline expected.
	 */
	body: string
	/**
	 * Optional comment block printed immediately above the service name.
	 * Use for the "# Optional MCP sidecar..." style preamble. Lines should
	 * begin with `  # ` (2-space indent). No trailing newline.
	 */
	leadingComment?: string
}

export type ComposeFeature = {
	id: string
	/** Service entries this feature contributes to `services:`. */
	services?: Array<ServiceBlock>
	/** Top-level volume names to declare under `volumes:`. */
	volumes?: Array<string>
}

export type EnvExampleSection = {
	id: string
	/**
	 * Body of the section, including its `# ----` divider header and a
	 * trailing blank line. The emitter joins sections verbatim.
	 */
	body: string
}

export type ComposeTarget = {
	kind: 'compose'
	outPath: string
	/** Top-of-file comment block, including trailing blank line. */
	header: string
	/** Features to emit, in order. */
	features: Array<ComposeFeature>
}

export type EnvTarget = {
	kind: 'env'
	outPath: string
	/** Top-of-file comment block, including trailing blank line. */
	header: string
	/** Env-example sections to emit, in order. */
	sections: Array<EnvExampleSection>
}

export type Target = ComposeTarget | EnvTarget
