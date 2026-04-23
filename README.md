Welcome to your new TanStack app!

# Getting Started

To run this application:

```bash
pnpm install
pnpm start
```

# Building For Production

To build this application for production:

```bash
pnpm build
```

## Testing

This project uses [Vitest](https://vitest.dev/) for testing. You can run the tests with:

```bash
pnpm test
```

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling.

## Linting & Formatting

This project uses [eslint](https://eslint.org/) and [prettier](https://prettier.io/) for linting and formatting. Eslint is configured using [tanstack/eslint-config](https://tanstack.com/config/latest/docs/eslint). The following scripts are available:

```bash
pnpm lint
pnpm format
pnpm check
```

## Shadcn

Add components using the latest version of [Shadcn](https://ui.shadcn.com/).

```bash
pnpx shadcn@latest add button
```

## T3Env

- You can use T3Env to add type safety to your environment variables.
- Add Environment variables to the `src/env.mjs` file.
- Use the environment variables in your code.

### Usage

```ts
import { env } from '@/env'

console.log(env.VITE_APP_TITLE)
```

## Routing

This project uses [TanStack Router](https://tanstack.com/router). The initial setup is a file based router. Which means that the routes are managed as files in `src/routes`.

### Adding A Route

To add a new route to your application just add another a new file in the `./src/routes` directory.

TanStack will automatically generate the content of the route file for you.

Now that you have two routes you can use a `Link` component to navigate between them.

### Adding Links

To use SPA (Single Page Application) navigation you will need to import the `Link` component from `@tanstack/react-router`.

```tsx
import { Link } from '@tanstack/react-router'
```

Then anywhere in your JSX you can use it like so:

```tsx
<Link to="/about">About</Link>
```

This will create a link that will navigate to the `/about` route.

More information on the `Link` component can be found in the [Link documentation](https://tanstack.com/router/v1/docs/framework/react/api/router/linkComponent).

### Using A Layout

In the File Based Routing setup the layout is located in `src/routes/__root.tsx`. Anything you add to the root route will appear in all the routes. The route content will appear in the JSX where you use the `<Outlet />` component.

Here is an example layout that includes a header:

```tsx
import { Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

import { Link } from '@tanstack/react-router'

export const Route = createRootRoute({
	component: () => (
		<>
			<header>
				<nav>
					<Link to="/">Home</Link>
					<Link to="/about">About</Link>
				</nav>
			</header>
			<Outlet />
			<TanStackRouterDevtools />
		</>
	),
})
```

The `<TanStackRouterDevtools />` component is not required so you can remove it if you don't want it in your layout.

More information on layouts can be found in the [Layouts documentation](https://tanstack.com/router/latest/docs/framework/react/guide/routing-concepts#layouts).

## Data Fetching

There are multiple ways to fetch data in your application. You can use TanStack Query to fetch data from a server. But you can also use the `loader` functionality built into TanStack Router to load the data for a route before it's rendered.

For example:

```tsx
const peopleRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/people',
	loader: async () => {
		const response = await fetch('https://swapi.dev/api/people')
		return response.json() as Promise<{
			results: {
				name: string
			}[]
		}>
	},
	component: () => {
		const data = peopleRoute.useLoaderData()
		return (
			<ul>
				{data.results.map(person => (
					<li key={person.name}>{person.name}</li>
				))}
			</ul>
		)
	},
})
```

Loaders simplify your data fetching logic dramatically. Check out more information in the [Loader documentation](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#loader-parameters).

### React-Query

React-Query is an excellent addition or alternative to route loading and integrating it into you application is a breeze.

First add your dependencies:

```bash
pnpm add @tanstack/react-query @tanstack/react-query-devtools
```

Next we'll need to create a query client and provider. We recommend putting those in `main.tsx`.

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ...

const queryClient = new QueryClient()

// ...

if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement)

	root.render(
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	)
}
```

You can also add TanStack Query Devtools to the root route (optional).

```tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

const rootRoute = createRootRoute({
	component: () => (
		<>
			<Outlet />
			<ReactQueryDevtools buttonPosition="top-right" />
			<TanStackRouterDevtools />
		</>
	),
})
```

Now you can use `useQuery` to fetch your data.

```tsx
import { useQuery } from '@tanstack/react-query'

import './App.css'

function App() {
	const { data } = useQuery({
		queryKey: ['people'],
		queryFn: () =>
			fetch('https://swapi.dev/api/people')
				.then(res => res.json())
				.then(data => data.results as { name: string }[]),
		initialData: [],
	})

	return (
		<div>
			<ul>
				{data.map(person => (
					<li key={person.name}>{person.name}</li>
				))}
			</ul>
		</div>
	)
}

export default App
```

You can find out everything you need to know on how to use React-Query in the [React-Query documentation](https://tanstack.com/query/latest/docs/framework/react/overview).

## State Management

Another common requirement for React applications is state management. There are many options for state management in React. TanStack Store provides a great starting point for your project.

First you need to add TanStack Store as a dependency:

```bash
pnpm add @tanstack/store
```

Now let's create a simple counter in the `src/App.tsx` file as a demonstration.

```tsx
import { useStore } from '@tanstack/react-store'
import { Store } from '@tanstack/store'
import './App.css'

const countStore = new Store(0)

function App() {
	const count = useStore(countStore)
	return (
		<div>
			<button onClick={() => countStore.setState(n => n + 1)}>Increment - {count}</button>
		</div>
	)
}

export default App
```

One of the many nice features of TanStack Store is the ability to derive state from other state. That derived state will update when the base state updates.

Let's check this out by doubling the count using derived state.

```tsx
import { useStore } from '@tanstack/react-store'
import { Store, Derived } from '@tanstack/store'
import './App.css'

const countStore = new Store(0)

const doubledStore = new Derived({
	fn: () => countStore.state * 2,
	deps: [countStore],
})
doubledStore.mount()

function App() {
	const count = useStore(countStore)
	const doubledCount = useStore(doubledStore)

	return (
		<div>
			<button onClick={() => countStore.setState(n => n + 1)}>Increment - {count}</button>
			<div>Doubled - {doubledCount}</div>
		</div>
	)
}

export default App
```

We use the `Derived` class to create a new store that is derived from another store. The `Derived` class has a `mount` method that will start the derived store updating.

Once we've created the derived store we can use it in the `App` component just like we would any other store using the `useStore` hook.

You can find out everything you need to know on how to use TanStack Store in the [TanStack Store documentation](https://tanstack.com/store/latest).

# Demo files

Files prefixed with `demo` can be safely deleted. They are there to provide a starting point for you to play around with the features you've installed.

# Learn More

You can learn more about all of the offerings from TanStack in the [TanStack documentation](https://tanstack.com).

# Running with Docker

If you want to test the app locally before deploying to Fly.io (or elsewhere), you can run it in Docker:

```bash
docker build -t tanstack-react-app . && docker run -p 3000:3000 tanstack-react-app
```

The app will be available at `http://[::]:3000/`.

## Self-host with Docker Compose

This repository ships a ready-to-run compose file for self hosting.

### Prerequisites

Before building the Docker image, generate database migrations:

```bash
pnpm db:generate
```

This creates the `drizzle/` directory with migration files that will be included in the image.

### Setup

1. Copy the env template and update values:

```bash
cp env.example .env
```

2. Start the stack:

```bash
docker compose -f docker-compose.selfhost.yml --env-file .env up -d
```

3. Visit the app:

```
http://localhost:3000
```

### Notes

- Database migrations run automatically on first startup via a one-shot `db-migrate` service.
- The compose stack includes Garage (S3-compatible object storage) for avatars and item photos. See [docs/storage.md](docs/storage.md) for setup across Vercel, self-host, and local dev, plus recipes for swapping Garage out for AWS S3, Cloudflare R2, or Supabase Storage.
- The image is expected to be built and published by GitHub Actions on version tags (e.g., `v1.0.0`).
- Migrations must be generated and committed before building images for self-hosting.

### Optional: transactional email

Email (powered by [Resend](https://resend.com)) is optional. The app boots and
runs without it. To enable email, set both `RESEND_API_KEY` and
`RESEND_FROM_EMAIL`; `RESEND_FROM_NAME` and `RESEND_BCC_ADDRESS` are further
optional. When email is unconfigured:

- Comment notifications to list owners are skipped.
- Day-of birthday greetings and the post-birthday gift summary cron is skipped.
- The admin "send test email" button and the email-related app-settings
  toggles (birthday emails, Christmas emails, comment emails) are hidden.

### Optional: multi-origin / LAN access

By default the app trusts exactly one origin: whatever you set
`BETTER_AUTH_URL` to. Requests from any other origin are rejected with
"Invalid origin". Two env vars cover the common self-hosting cases.

**`TRUSTED_ORIGINS`** (comma-separated): adds extra origins to the auth
allow-list. Use this when you reach the same instance via more than one
hostname, e.g. an HTTPS domain through a reverse proxy plus a LAN IP.

```
BETTER_AUTH_URL=https://wish.example.com
TRUSTED_ORIGINS=http://192.168.1.137:3888,http://wish.local:3888
```

**`INSECURE_COOKIES=true`**: drops the `Secure` flag on auth cookies.
Required if any trusted origin is plain HTTP, because browsers refuse to
store `Secure` cookies set from an HTTP page. The login request would
otherwise succeed but no session cookie would be stored, leaving the user
stuck on a login loop.

```
INSECURE_COOKIES=true
```

This weakens session security on the HTTPS path too (cookies become
sniffable on the LAN), so leave it unset unless HTTP origin login is
something you actually need. If every origin is HTTPS, leave it unset and
keep the default secure-cookie behavior.

### Reverse proxy (Traefik, Caddy, nginx)

If a reverse proxy terminates TLS in front of the container:

- Point `BETTER_AUTH_URL` and `SERVER_URL` at the public HTTPS URL (e.g.
  `https://wish.example.com`). Better-auth uses these to validate origins,
  derive the cookie `Secure` flag, and build links in outbound emails.
- `VITE_SERVER_URL` is baked at image build time. Leave it unset when using
  a pre-built image; the client falls back to `window.location.origin`.
- The proxy must forward the `Host` header and `X-Forwarded-Proto: https`
  (Traefik and Caddy do this by default).
