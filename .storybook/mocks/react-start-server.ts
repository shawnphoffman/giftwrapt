// Aliased in place of `@tanstack/react-start/server` for Storybook.
//
// The real module re-exports from `@tanstack/start-server-core`, which has a
// dynamic `import("#tanstack-router-entry")` subpath import that only resolves
// when the TanStack Start Vite plugin is active. Storybook builds without
// that plugin, so the resolver fails and the whole build aborts.
//
// Stories never actually invoke server-fn handlers, so these names just need
// to exist as no-ops to satisfy the import sites in `@/middleware/*` and
// `@/api/*` modules.

const noop = () => undefined
const empty = () => ({})

export const deleteCookie = noop
export const getCookie = noop
export const setCookie = noop
export const getRequest = empty
export const getRequestHeaders = empty
export const getRequestHeader = noop
export const getResponseHeaders = empty
export const getResponseHeader = noop
export const setResponseHeader = noop
export const setResponseStatus = noop
export const getEvent = empty
