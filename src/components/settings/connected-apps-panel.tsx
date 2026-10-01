import { Bot, Unplug } from 'lucide-react'

import type { ConnectedAppRow } from '@/api/_mcp-admin-impl'
import { CopyButton } from '@/components/common/copy-button'
import { Button } from '@/components/ui/button'
import { formatRelative } from '@/lib/format-relative'
import { buildClaudeConnectLink, buildMcpConnectInfo } from '@/lib/mcp-connect'

export type ConnectedAppsPanelProps = {
	apps: Array<ConnectedAppRow>
	origin: string
	/** The deployment's title, used as the connector name in the Add to Claude link. */
	appTitle?: string
	onDisconnect: (app: ConnectedAppRow) => void
	busyClientId?: string | null
	docsHref?: string
}

/**
 * The AI assistants connected to the signed-in user's account, with
 * disconnect, plus the server URL to paste into a new client.
 */
export function ConnectedAppsPanel({
	apps,
	origin,
	appTitle,
	onDisconnect,
	busyClientId = null,
	docsHref = 'https://giftwrapt.dev/features/ai-assistants/',
}: ConnectedAppsPanelProps) {
	const info = buildMcpConnectInfo(origin)
	const claudeLink = buildClaudeConnectLink(info.endpointUrl, appTitle)
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<div className="text-sm font-medium">Connect a New Assistant</div>
				<p className="text-sm text-muted-foreground">
					Using Claude? One button opens Claude with everything filled in. Confirm there, then sign in and approve it here.
				</p>
				<Button asChild>
					<a href={claudeLink} target="_blank" rel="noreferrer">
						Add to Claude
					</a>
				</Button>
				<p className="pt-2 text-sm text-muted-foreground">
					For Cursor, ChatGPT, or any other MCP client, paste this server URL, then sign in and approve it when asked.{' '}
					<a href={docsHref} className="underline underline-offset-2" target="_blank" rel="noreferrer">
						Step-by-step guide
					</a>
					.
				</p>
				<div className="flex items-center gap-2">
					<code className="flex-1 truncate rounded bg-muted px-3 py-2 font-mono text-sm">{info.endpointUrl}</code>
					<CopyButton value={info.endpointUrl} label="Copy server URL" />
				</div>
			</div>

			<div className="space-y-2">
				<div className="text-sm font-medium">Connected</div>
				{apps.length === 0 ? (
					<div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
						No assistants connected yet.
					</div>
				) : (
					<ul className="space-y-2">
						{apps.map(app => (
							<li key={app.clientId} className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3">
								<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
									<Bot className="size-5" />
								</div>
								<div className="min-w-0 flex-1">
									<div className="truncate font-medium">{app.clientName || 'Unnamed assistant'}</div>
									<div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
										<span>Connected {formatRelative(app.connectedAt)}</span>
										<span>{app.lastUsedAt ? `Last used ${formatRelative(app.lastUsedAt)}` : 'Never used'}</span>
										{app.expiresAt ? <span>Signs out {formatRelative(app.expiresAt)} unless used</span> : null}
									</div>
								</div>
								<Button
									variant="outline"
									size="sm"
									disabled={busyClientId === app.clientId}
									onClick={() => onDisconnect(app)}
									aria-label={`Disconnect ${app.clientName || 'assistant'}`}
									className="text-muted-foreground hover:text-destructive"
								>
									<Unplug className="size-4" />
								</Button>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	)
}
