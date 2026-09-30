import { Ban, CheckCircle2, Trash2 } from 'lucide-react'

import type { OauthClientRow } from '@/api/_mcp-admin-impl'
import EmptyMessage from '@/components/common/empty-message'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatRelative } from '@/lib/format-relative'

export type McpClientsTableProps = {
	clients: Array<OauthClientRow>
	onToggleDisabled: (client: OauthClientRow) => void
	onDelete: (client: OauthClientRow) => void
	/** Client id with an in-flight mutation; its buttons are disabled. */
	busyClientId?: string | null
}

/**
 * Registered OAuth clients (one row per app install that registered
 * itself through dynamic client registration). Disable stops new
 * sign-ins and revokes existing tokens; delete also drops consents.
 */
export function McpClientsTable({ clients, onToggleDisabled, onDelete, busyClientId = null }: McpClientsTableProps) {
	if (clients.length === 0) {
		return <EmptyMessage message="No AI clients have registered yet. They appear here the first time someone connects one." />
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Client</TableHead>
					<TableHead className="text-right">Users</TableHead>
					<TableHead className="text-right">Grants</TableHead>
					<TableHead>Last Used</TableHead>
					<TableHead>Registered</TableHead>
					<TableHead className="w-0" />
				</TableRow>
			</TableHeader>
			<TableBody>
				{clients.map(client => {
					const busy = busyClientId === client.clientId
					return (
						<TableRow key={client.id} className={client.disabled ? 'opacity-60' : undefined}>
							<TableCell>
								<div className="flex items-center gap-2">
									<span className="font-medium">{client.name || 'Unnamed client'}</span>
									{client.disabled ? <Badge variant="secondary">Disabled</Badge> : null}
								</div>
								<code className="font-mono text-[11px] text-muted-foreground">{client.clientId.slice(0, 12)}…</code>
							</TableCell>
							<TableCell className="text-right tabular-nums">{client.activeUsers}</TableCell>
							<TableCell className="text-right tabular-nums">{client.activeGrants}</TableCell>
							<TableCell className="text-muted-foreground">{formatRelative(client.lastUsedAt)}</TableCell>
							<TableCell className="text-muted-foreground">{formatRelative(client.createdAt)}</TableCell>
							<TableCell>
								<div className="flex justify-end gap-1">
									<Button
										variant="outline"
										size="sm"
										disabled={busy}
										onClick={() => onToggleDisabled(client)}
										aria-label={client.disabled ? 'Enable client' : 'Disable client'}
									>
										{client.disabled ? <CheckCircle2 className="size-4" /> : <Ban className="size-4" />}
									</Button>
									<Button
										variant="outline"
										size="sm"
										disabled={busy}
										onClick={() => onDelete(client)}
										aria-label="Delete client"
										className="text-muted-foreground hover:text-destructive"
									>
										<Trash2 className="size-4" />
									</Button>
								</div>
							</TableCell>
						</TableRow>
					)
				})}
			</TableBody>
		</Table>
	)
}
