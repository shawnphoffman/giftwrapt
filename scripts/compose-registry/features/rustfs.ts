import type { ComposeFeature } from '../types.ts'

const body = `    image: rustfs/rustfs:latest
    environment:
      # RustFS provisions root credentials at startup from these. Plumb the
      # same STORAGE_* values through so the app and the bucket share one
      # identity. RustFS accepts arbitrary strings - no format constraints.
      RUSTFS_ACCESS_KEY: \${STORAGE_ACCESS_KEY_ID}
      RUSTFS_SECRET_KEY: \${STORAGE_SECRET_ACCESS_KEY}
    volumes:
      - rustfs_data:/data
      - rustfs_logs:/logs
    # Intentionally no host port: RustFS is only reachable on the compose
    # network. The app serves images via /api/files/* so clients never need
    # direct bucket access. To expose direct S3 URLs (faster, offloads
    # bandwidth), add a reverse-proxy rule for 9000 and set
    # STORAGE_PUBLIC_URL in .env. To expose the web console, add 9001.
    restart: unless-stopped
`

export const rustfsFeature: ComposeFeature = {
	id: 'rustfs',
	services: [{ name: 'rustfs', body }],
	volumes: ['rustfs_data', 'rustfs_logs'],
}
