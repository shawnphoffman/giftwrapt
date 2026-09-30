// Client-safe constants for the MCP / OAuth surface. Imported by the
// consent card and the connected-apps UI as well as `src/lib/auth.ts`,
// so keep this file free of server-only imports.

/** OAuth access tokens issued to MCP clients live this long. */
export const MCP_ACCESS_TOKEN_TTL_SECONDS = 60 * 60

/** Refresh tokens issued to MCP clients live this long (30 days). */
export const MCP_REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30

/** The MCP endpoint path, relative to the deployment origin. */
export const MCP_ENDPOINT_PATH = '/api/mcp'

/** Where the better-auth `mcp()` plugin sends users to approve a client. */
export const MCP_CONSENT_PAGE_PATH = '/oauth/consent'

/** Registered OAuth clients that have never been used are swept after this many days. */
export const MCP_IDLE_CLIENT_DAYS = 30
