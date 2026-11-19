import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react'

import { CopyButton } from '@/components/common/copy-button'
import { RichMessage } from '@/components/common/rich-message'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { buildClaudeConnectLink, buildMcpConnectInfo, buildMcpSnippets } from '@/lib/mcp-connect'
import { m } from '@/paraglide/messages.js'

export type DiscoveryStatus = 'checking' | 'ok' | 'unreachable'

export type McpConnectCardProps = {
	/** Deployment origin, e.g. https://gifts.example.com */
	origin: string
	/** The deployment's title, used as the connector name in the Add to Claude link. */
	appTitle?: string
	/** Live reachability of each discovery URL, keyed by URL. */
	discoveryStatus?: Record<string, DiscoveryStatus>
	docsHref?: string
}

/**
 * The "how do I connect" card on /admin/mcp: the server URL, the OAuth
 * discovery documents with a reachability check, and copy-ready
 * snippets for the common clients. Presentational; the page owns the
 * reachability fetches.
 */
export function McpConnectCard({
	origin,
	appTitle,
	discoveryStatus = {},
	docsHref = 'https://giftwrapt.dev/features/ai-assistants/',
}: McpConnectCardProps) {
	const info = buildMcpConnectInfo(origin)
	const snippets = buildMcpSnippets(info.endpointUrl)
	const claudeLink = buildClaudeConnectLink(info.endpointUrl, appTitle)
	return (
		<Card className="animate-page-in max-w-2xl">
			<CardHeader>
				<CardTitle className="text-2xl">{m.admin_settings_mcp_connect_title()}</CardTitle>
				<CardDescription>
					<RichMessage
						parts={m.admin_settings_mcp_connect_description.parts()}
						tags={{
							link: children => (
								<a href={docsHref} className="underline underline-offset-2" target="_blank" rel="noreferrer">
									{children}
								</a>
							),
						}}
					/>
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="space-y-2">
					<div className="text-sm font-medium">{m.admin_settings_mcp_connect_server_url_label()}</div>
					<div className="flex items-center gap-2">
						<code className="flex-1 truncate rounded bg-muted px-3 py-2 font-mono text-sm">{info.endpointUrl}</code>
						<CopyButton value={info.endpointUrl} label={m.admin_settings_mcp_connect_copy_server_url()} />
					</div>
				</div>

				<div className="space-y-2">
					<div className="text-sm font-medium">{m.admin_settings_mcp_connect_add_to_claude()}</div>
					<p className="text-xs text-muted-foreground">{m.admin_settings_mcp_connect_add_to_claude_description()}</p>
					<div className="flex items-center gap-2">
						<Button asChild>
							<a href={claudeLink} target="_blank" rel="noreferrer">
								{m.admin_settings_mcp_connect_add_to_claude()}
							</a>
						</Button>
						<CopyButton value={claudeLink} label={m.admin_settings_mcp_connect_copy_claude_link()} />
					</div>
				</div>

				<div className="space-y-2">
					<div className="text-sm font-medium">{m.admin_settings_mcp_connect_discovery_title()}</div>
					<ul className="space-y-1">
						{info.discovery.map(d => (
							<li key={d.url} className="flex items-center gap-2 text-sm">
								<StatusIcon status={discoveryStatus[d.url]} />
								<span className="text-muted-foreground">{d.label}</span>
								<code className="truncate font-mono text-xs">{d.url}</code>
							</li>
						))}
					</ul>
					<p className="text-xs text-muted-foreground">{m.admin_settings_mcp_connect_discovery_description()}</p>
				</div>

				<div className="space-y-4">
					<div className="text-sm font-medium">{m.admin_settings_mcp_connect_client_setup_title()}</div>
					{snippets.map(s => (
						<div key={s.id} className="space-y-1.5">
							<div className="flex items-start justify-between gap-2">
								<div>
									<div className="text-sm font-medium">{s.title}</div>
									<p className="text-xs text-muted-foreground">{s.description}</p>
								</div>
								<CopyButton value={s.code} label={m.admin_settings_mcp_connect_copy_snippet({ title: s.title })} />
							</div>
							<pre className="overflow-x-auto rounded bg-muted px-3 py-2 font-mono text-xs whitespace-pre">{s.code}</pre>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	)
}

function StatusIcon({ status }: { status: DiscoveryStatus | undefined }) {
	if (status === 'ok')
		return <CheckCircle2 className="size-4 shrink-0 text-green-600" aria-label={m.admin_settings_mcp_connect_status_reachable()} />
	if (status === 'unreachable')
		return <XCircle className="size-4 shrink-0 text-destructive" aria-label={m.admin_settings_mcp_connect_status_unreachable()} />
	return <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-label={m.admin_settings_mcp_connect_status_checking()} />
}
