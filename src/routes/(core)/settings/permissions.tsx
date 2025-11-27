import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(core)/settings/permissions')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(core)/settings/connections"!</div>
}
