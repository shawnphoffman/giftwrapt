// Embedded-shell detection and the native bridge for the iOS web tab
// (ADR 0003, plan 28).
//
// The iOS app hosts the web app in a `WKWebView` whose User-Agent carries
// `GiftWrapt-iOS/<version>`. Core reads that marker on the server (root
// route loader) and on the client (`navigator.userAgent`), and both agree
// by construction because WebKit uses the same string for the document
// request and for `navigator.userAgent`. No cookie and no query param, so
// the mode cannot be forgotten on a navigation.
//
// In embedded mode the web renders a shell with no sign-out, no sign-up or
// password links, no passkey or OIDC affordances, and a reconnect screen
// instead of any sign-in form (passkeys cannot complete in a
// tenant-agnostic web view, and the app never shows the form).

/** The User-Agent marker the iOS web view appends via `applicationNameForUserAgent`. */
export const EMBEDDED_UA_MARKER = 'GiftWrapt-iOS/'

/** The `WKScriptMessageHandler` name the iOS app registers. */
export const NATIVE_BRIDGE_NAME = 'giftwrapt'

export function isEmbeddedUserAgent(userAgent: string | null | undefined): boolean {
	if (!userAgent) return false
	return userAgent.includes(EMBEDDED_UA_MARKER)
}

/**
 * Messages the web posts to the native side. Keep this set small; add a
 * message only when a web action cannot be a plain link.
 *
 * - `reauth`: the web landed on an auth page; the app should run the
 *   handoff again and land on `to`.
 * - `save`: open the native Save flow (the sidebar's Add Item action).
 * - `openExternal`: open the URL in the device's default browser.
 * - `error`: an error boundary rendered. The app replaces the web's
 *   fallback with its own card and recovers by reloading through the
 *   handoff, so the web view never sits on a broken page.
 */
export type NativeBridgeMessage =
	| { type: 'reauth'; to: string }
	| { type: 'save' }
	| { type: 'openExternal'; url: string }
	| { type: 'error'; message: string }

/**
 * Client-side check for the embedded shell, for code that runs outside
 * the router (error boundaries). Server rendering and plain browsers get
 * `false`; the root loader's flag (`useEmbedded`) is the source of truth
 * for everything that renders.
 */
export function isEmbeddedClient(): boolean {
	if (typeof navigator === 'undefined') return false
	return isEmbeddedUserAgent(navigator.userAgent)
}

type WebKitBridgeWindow = Window & {
	webkit?: { messageHandlers?: Record<string, { postMessage: (message: unknown) => void } | undefined> }
}

/**
 * Post a message to the iOS app. Returns `false` when there is no bridge
 * (plain browser, SSR), so callers can fall back to the web behavior.
 */
export function postToNativeBridge(message: NativeBridgeMessage): boolean {
	if (typeof window === 'undefined') return false
	const handler = (window as WebKitBridgeWindow).webkit?.messageHandlers?.[NATIVE_BRIDGE_NAME]
	if (!handler) return false
	try {
		handler.postMessage(message)
		return true
	} catch {
		return false
	}
}
