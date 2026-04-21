import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'

const isStorybook = process.env.STORYBOOK === 'true'

const securityHeaders = {
	// HSTS is a no-op over HTTP (browsers ignore it per RFC 6797). Useful once
	// the deployment is fronted by HTTPS: tells browsers to refuse plaintext.
	'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
	// No upgrade-insecure-requests: it rewrites every http:// subresource to
	// https:// even when the page itself is served over http, which breaks
	// IP:port/LAN self-hosts. If you front the app with HTTPS, add it via the
	// reverse proxy (or add it back here) and everything still works.
	'Content-Security-Policy': [
		"default-src 'self'",
		// 'unsafe-eval' is needed by something in the production bundle (a wasm
		// shim or one of the @tanstack libs); blocking it surfaces as an
		// uncaught CSP error and a stuck loading spinner.
		"script-src 'self' 'unsafe-inline' 'unsafe-eval'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: https:",
		"font-src 'self' data:",
		"connect-src 'self'",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
	].join('; '),
}

const config = defineConfig({
	plugins: [
		!isStorybook && devtools(),
		!isStorybook &&
			nitro({
				routeRules: {
					'/**': { headers: securityHeaders },
				},
			}),
		// this is the plugin that enables path aliases
		viteTsConfigPaths({
			projects: ['./tsconfig.json'],
		}),
		tailwindcss(),
		!isStorybook && tanstackStart(),
		viteReact({
			babel: {
				plugins: ['babel-plugin-react-compiler'],
			},
		}),
	].filter(Boolean),
})

export default config
