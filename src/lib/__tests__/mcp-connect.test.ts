import { describe, expect, it } from 'vitest'

import { buildClaudeConnectLink, buildMcpConnectInfo, mcpConnectorName } from '@/lib/mcp-connect'

describe('mcpConnectorName', () => {
	it('uses the instance title as-is', () => {
		expect(mcpConnectorName('Hoffstuff')).toBe('Hoffstuff')
		expect(mcpConnectorName('  The Smith Family  ')).toBe('The Smith Family')
	})

	it('falls back to the product name when there is no title', () => {
		expect(mcpConnectorName('')).toBe('GiftWrapt')
		expect(mcpConnectorName('   ')).toBe('GiftWrapt')
		expect(mcpConnectorName(undefined)).toBe('GiftWrapt')
		expect(mcpConnectorName(null)).toBe('GiftWrapt')
	})
})

describe('buildClaudeConnectLink', () => {
	const { endpointUrl } = buildMcpConnectInfo('https://hoffstuff.com/')

	it('prefills the add-custom-connector dialog with the name and server URL', () => {
		expect(buildClaudeConnectLink(endpointUrl, 'Hoffstuff')).toBe(
			'https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Hoffstuff&connectorUrl=https%3A%2F%2Fhoffstuff.com%2Fapi%2Fmcp'
		)
	})

	it('percent-encodes the name, with %20 rather than + for spaces', () => {
		const link = buildClaudeConnectLink(endpointUrl, 'Smith & Sons: Gifts')
		expect(link).toContain('connectorName=Smith%20%26%20Sons%3A%20Gifts')
		expect(link).not.toContain('+')
		const parsed = new URL(link)
		expect(parsed.searchParams.get('connectorName')).toBe('Smith & Sons: Gifts')
		expect(parsed.searchParams.get('connectorUrl')).toBe('https://hoffstuff.com/api/mcp')
		expect(parsed.searchParams.get('modal')).toBe('add-custom-connector')
	})

	it('names the connector GiftWrapt when the deployment has no title', () => {
		expect(new URL(buildClaudeConnectLink(endpointUrl)).searchParams.get('connectorName')).toBe('GiftWrapt')
	})
})
