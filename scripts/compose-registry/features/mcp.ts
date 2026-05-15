import type { ComposeFeature, EnvExampleSection } from '../types.ts'

const leadingComment = `  # Model Context Protocol sidecar (opt-in via \`--profile mcp\`). Lets you
  # interact with your wishlist via Claude Desktop / Code / Web. Talks to
  # the app over the compose network using a giftwrapt apiKey (mint one
  # at /settings/devices). The image is published from the
  # shawnphoffman/giftwrapt-mcp repo. The service stays defined in
  # *-full.yaml so you can enable it on demand without editing the file.`

const body = `    image: \${MCP_IMAGE:-ghcr.io/shawnphoffman/giftwrapt-mcp:latest}
    profiles: ['mcp']
    environment:
      GIFTWRAPT_BASE_URL: http://app:3001
      # Single-tenant pin: leave unset for multi-user pass-through (each
      # client sends its own Bearer header). See the giftwrapt-mcp README.
      GIFTWRAPT_API_KEY: \${GIFTWRAPT_MCP_API_KEY:-}
      # Shared-secret port gate; only meaningful when GIFTWRAPT_API_KEY is set.
      MCP_BEARER_TOKEN: \${MCP_BEARER_TOKEN:-}
      MCP_PORT: 8787
      MCP_LOG_LEVEL: \${MCP_LOG_LEVEL:-info}
    ports:
      - '\${MCP_PORT:-8787}:8787'
    depends_on:
      app:
        condition: service_started
    restart: unless-stopped
`

export const mcpFeature: ComposeFeature = {
	id: 'mcp',
	services: [{ name: 'mcp', body, leadingComment }],
}

export const mcpEnvSection: EnvExampleSection = {
	id: 'mcp',
	body: `# -----------------------------------------------------------------------------
# MCP sidecar - defined in *-full.yaml, opt-in via \`--profile mcp\`
# -----------------------------------------------------------------------------
# Profile-gated so the default \`docker compose up -d\` does NOT start it;
# pass \`--profile mcp\` to bring it up. Lets you talk to your wishlist
# through Claude Desktop / Code / Web by exposing /api/mobile/v1/* as MCP
# tools. See https://github.com/shawnphoffman/giftwrapt-mcp.
#
# Single-tenant: paste a key minted at /settings/devices into GIFTWRAPT_MCP_API_KEY.
# Multi-user: leave it unset; each Claude client sends its own Bearer header.
# GIFTWRAPT_MCP_API_KEY=
#
# Optional shared-secret port gate. Only meaningful when GIFTWRAPT_MCP_API_KEY
# is also set (in pass-through mode the inbound Authorization header IS the
# upstream apiKey, so a separate gate makes no sense).
# MCP_BEARER_TOKEN=
#
# Override the published image tag if you build locally.
# MCP_IMAGE=ghcr.io/shawnphoffman/giftwrapt-mcp:latest
#
# Override the host port the sidecar listens on (default 8787).
# MCP_PORT=8787
#
# Override the structured-log level on the sidecar (default info).
# MCP_LOG_LEVEL=info
`,
}
