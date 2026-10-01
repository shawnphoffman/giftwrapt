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

/**
 * The scopes the MCP authorization server grants, in the order the
 * discovery documents advertise them. `openid` is deliberately absent:
 * when it is granted the better-auth `mcp()` plugin mints an ID token
 * signed with a throwaway HS256 key and no `iss`, while its metadata
 * advertises RS256 and a JWKS URL that does not exist. No client can
 * validate that token, and a strict one refuses the whole grant. MCP is
 * plain OAuth 2.1; nothing here needs OIDC. The gateway strips `openid`
 * from authorize requests so a client that asks anyway still gets a
 * usable grant.
 */
export const MCP_SCOPES = ['profile', 'email', 'offline_access'] as const

/** `MCP_SCOPES` as the space-separated form the plugin and the token response use. */
export const MCP_DEFAULT_SCOPE = MCP_SCOPES.join(' ')

/** Registered OAuth clients that have never been used are swept after this many days. */
export const MCP_IDLE_CLIENT_DAYS = 30
