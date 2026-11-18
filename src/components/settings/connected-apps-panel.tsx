import { Bot, Unplug } from 'lucide-react'

import type { ConnectedAppRow } from '@/api/_mcp-admin-impl'
import { CopyButton } from '@/components/common/copy-button'
import { RichMessage } from '@/components/common/rich-message'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatRelative } from '@/lib/format-relative'
import { buildClaudeConnectLink, buildMcpConnectInfo } from '@/lib/mcp-connect'
import { m } from '@/paraglide/messages.js'

export type ConnectedAppsPanelProps = {
	apps: Array<ConnectedAppRow>
	origin: string
	/** The deployment's title, used as the connector name in the Add to Claude link. */
	appTitle?: string
	onDisconnect: (app: ConnectedAppRow) => void
	/** Switch an assistant between read-only and full access. */
	onAccessChange: (app: ConnectedAppRow, access: ConnectedAppRow['access']) => void
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
	onAccessChange,
	busyClientId = null,
	docsHref = 'https://giftwrapt.dev/features/ai-assistants/',
}: ConnectedAppsPanelProps) {
	const info = buildMcpConnectInfo(origin)
	const claudeLink = buildClaudeConnectLink(info.endpointUrl, appTitle)
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<div className="text-sm font-medium">{m.settings_apps_connect_title()}</div>
				<p className="text-sm text-muted-foreground">{m.settings_apps_connect_claude_description()}</p>
				<Button asChild>
					<a href={claudeLink} target="_blank" rel="noreferrer">
						{m.settings_apps_add_to_claude()}
					</a>
				</Button>
				<p className="pt-2 text-sm text-muted-foreground">
					<RichMessage
						parts={m.settings_apps_connect_other_description.parts()}
						tags={{
							link: children => (
								<a href={docsHref} className="underline underline-offset-2" target="_blank" rel="noreferrer">
									{children}
								</a>
							),
						}}
					/>
				</p>
				<div className="flex items-center gap-2">
					<code className="flex-1 truncate rounded bg-muted px-3 py-2 font-mono text-sm">{info.endpointUrl}</code>
					<CopyButton value={info.endpointUrl} label={m.settings_apps_copy_url_label()} />
				</div>
			</div>

			<div className="space-y-2">
				<div className="text-sm font-medium">{m.settings_apps_connected_title()}</div>
				{apps.length === 0 ? (
					<div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
						{m.settings_apps_empty()}
					</div>
				) : (
					<ul className="space-y-2">
						{apps.map(app => (
							<li key={app.clientId} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-3">
								<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
									<Bot className="size-5" />
								</div>
								<div className="min-w-40 flex-1">
									<div className="truncate font-medium">{app.clientName || m.settings_apps_unnamed()}</div>
									<div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
										<span>{m.settings_apps_connected_at({ time: formatRelative(app.connectedAt) })}</span>
										<span>
											{app.lastUsedAt ? m.settings_apps_last_used({ time: formatRelative(app.lastUsedAt) }) : m.settings_apps_never_used()}
										</span>
										{app.expiresAt ? <span>{m.settings_apps_expires({ time: formatRelative(app.expiresAt) })}</span> : null}
									</div>
								</div>
								{/* Wraps under the details on a narrow screen instead of squeezing them. */}
								<div className="ml-auto flex items-center gap-2">
									<Select
										value={app.access}
										disabled={busyClientId === app.clientId}
										onValueChange={value => onAccessChange(app, value as ConnectedAppRow['access'])}
									>
										<SelectTrigger
											size="sm"
											className="w-auto shrink-0"
											aria-label={
												app.clientName ? m.settings_apps_access_label({ name: app.clientName }) : m.settings_apps_access_label_unnamed()
											}
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="write">{m.settings_apps_access_write()}</SelectItem>
											<SelectItem value="read">{m.settings_apps_access_read()}</SelectItem>
										</SelectContent>
									</Select>
									<Button
										variant="outline"
										size="sm"
										disabled={busyClientId === app.clientId}
										onClick={() => onDisconnect(app)}
										aria-label={
											app.clientName
												? m.settings_apps_disconnect_label({ name: app.clientName })
												: m.settings_apps_disconnect_label_unnamed()
										}
										className="text-muted-foreground hover:text-destructive"
									>
										<Unplug className="size-4" />
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	)
}
