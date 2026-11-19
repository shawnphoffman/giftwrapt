import { Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { OauthGrantRow } from '@/api/_mcp-admin-impl'
import EmptyMessage from '@/components/common/empty-message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatRelative } from '@/lib/format-relative'
import { m } from '@/paraglide/messages.js'

export type McpGrantsTableProps = {
	grants: Array<OauthGrantRow>
	onRevoke: (grant: OauthGrantRow) => void
	busyGrantId?: string | null
}

const SOON_MS = 3 * 24 * 60 * 60 * 1000

/**
 * Every live token across users, filterable by user, with a revoke
 * action. "Live" means the refresh window is still open; an access token
 * alone expiring is routine and not shown as a problem.
 */
export function McpGrantsTable({ grants, onRevoke, busyGrantId = null }: McpGrantsTableProps) {
	const [filter, setFilter] = useState('')
	const filtered = useMemo(() => {
		const q = filter.trim().toLowerCase()
		if (!q) return grants
		return grants.filter(g => (g.userName ?? '').toLowerCase().includes(q) || (g.userEmail ?? '').toLowerCase().includes(q))
	}, [grants, filter])

	if (grants.length === 0) {
		return <EmptyMessage message={m.admin_settings_mcp_grants_empty()} />
	}

	return (
		<div className="space-y-3">
			<Input
				value={filter}
				onChange={e => setFilter(e.target.value)}
				placeholder={m.admin_settings_mcp_grants_filter_placeholder()}
				aria-label={m.admin_settings_mcp_grants_filter_label()}
			/>
			{filtered.length === 0 ? (
				<EmptyMessage message={m.admin_settings_mcp_grants_no_match()} />
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{m.admin_settings_mcp_grants_user_column()}</TableHead>
							<TableHead>{m.admin_settings_mcp_client_column()}</TableHead>
							<TableHead>{m.admin_settings_mcp_grants_access_column()}</TableHead>
							<TableHead>{m.admin_settings_mcp_last_used_column()}</TableHead>
							<TableHead>{m.admin_settings_mcp_grants_expires_column()}</TableHead>
							<TableHead className="w-0" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{filtered.map(grant => {
							const expires = grant.refreshTokenExpiresAt ? new Date(grant.refreshTokenExpiresAt).getTime() - Date.now() : null
							const soon = expires !== null && expires < SOON_MS
							return (
								<TableRow key={grant.id}>
									<TableCell>
										<div className="font-medium">{grant.userName ?? m.admin_settings_mcp_grants_unknown_user()}</div>
										<div className="text-xs text-muted-foreground">{grant.userEmail ?? grant.userId ?? ''}</div>
									</TableCell>
									<TableCell>{grant.clientName || m.admin_settings_mcp_unnamed_client()}</TableCell>
									<TableCell className="text-muted-foreground">
										{grant.access === 'read' ? m.admin_settings_mcp_grants_access_read() : m.admin_settings_mcp_grants_access_full()}
									</TableCell>
									<TableCell className="text-muted-foreground">{formatRelative(grant.lastUsedAt)}</TableCell>
									<TableCell className={soon ? 'text-amber-600' : 'text-muted-foreground'}>
										{formatRelative(grant.refreshTokenExpiresAt)}
									</TableCell>
									<TableCell>
										<div className="flex justify-end">
											<Button
												variant="outline"
												size="sm"
												disabled={busyGrantId === grant.id}
												onClick={() => onRevoke(grant)}
												aria-label={m.admin_settings_mcp_grants_revoke_label()}
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
			)}
		</div>
	)
}
