import { createStart } from '@tanstack/react-start'

import { errorCaptureMiddleware } from '@/lib/observability/capture-middleware'

// TanStack Start instance. Global function middleware runs ahead of each
// server fn's own middleware list, so it sees failures from auth and input
// validation as well as the handler.
export const startInstance = createStart(() => ({
	functionMiddleware: [errorCaptureMiddleware],
}))
