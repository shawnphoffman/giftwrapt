import { describe, expect, it } from 'vitest'

import { isPrivateIp } from '../safe-fetch'

describe('isPrivateIp - IPv4 ranges', () => {
	it.each([
		// Loopback
		['127.0.0.1'],
		['127.255.255.254'],
		// Private
		['10.0.0.1'],
		['10.255.255.255'],
		['172.16.0.1'],
		['172.31.255.255'],
		['192.168.0.1'],
		['192.168.255.255'],
		// Link-local incl AWS metadata
		['169.254.169.254'],
		['169.254.0.1'],
		// CGNAT
		['100.64.0.1'],
		['100.127.255.255'],
		// Unspecified / "this network"
		['0.0.0.0'],
		['0.255.255.255'],
		// Multicast
		['224.0.0.1'],
		['239.255.255.255'],
		// Reserved
		['240.0.0.1'],
		// Limited broadcast
		['255.255.255.255'],
		// Test nets
		['192.0.2.1'],
		['198.51.100.1'],
		['203.0.113.1'],
		['198.18.0.1'],
	])('rejects %s', ip => {
		expect(isPrivateIp(ip)).toBe(true)
	})

	it.each([
		// Public
		['8.8.8.8'],
		['1.1.1.1'],
		['151.101.1.69'],
		// Boundary: 11.x.x.x is public (just past 10/8)
		['11.0.0.0'],
		// 172.32.x.x is public (just past 172.16/12)
		['172.32.0.1'],
		// 192.169.x.x is public (just past 192.168/16)
		['192.169.0.1'],
		// 100.128.x.x is public (just past CGNAT 100.64/10)
		['100.128.0.1'],
	])('accepts %s', ip => {
		expect(isPrivateIp(ip)).toBe(false)
	})
})

describe('isPrivateIp - IPv6 ranges', () => {
	it.each([
		// Loopback / unspecified
		['::1'],
		['::'],
		// IPv4-mapped (::ffff:a.b.c.d)
		['::ffff:127.0.0.1'],
		['::ffff:169.254.169.254'],
		['::ffff:10.0.0.1'],
		// ULA fc00::/7
		['fc00::1'],
		['fd00:abcd::1'],
		// Link-local fe80::/10
		['fe80::1'],
		['feb0::1'],
		// Multicast ff00::/8
		['ff02::1'],
		// NAT64
		['64:ff9b::8.8.8.8'],
		// Documentation
		['2001:db8::1'],
	])('rejects %s', ip => {
		expect(isPrivateIp(ip)).toBe(true)
	})

	it.each([
		// Cloudflare DNS
		['2606:4700:4700::1111'],
		// Google DNS
		['2001:4860:4860::8888'],
	])('accepts %s', ip => {
		expect(isPrivateIp(ip)).toBe(false)
	})
})

describe('isPrivateIp - non-IP input', () => {
	it('returns false for hostnames', () => {
		expect(isPrivateIp('example.com')).toBe(false)
		expect(isPrivateIp('localhost')).toBe(false)
		expect(isPrivateIp('')).toBe(false)
	})

	it('returns false for malformed input', () => {
		expect(isPrivateIp('999.999.999.999')).toBe(false)
		expect(isPrivateIp('not-an-ip')).toBe(false)
	})
})
