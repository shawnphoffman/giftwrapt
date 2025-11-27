import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(core)/settings/purchases')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(core)/settings/connections"!</div>
}
