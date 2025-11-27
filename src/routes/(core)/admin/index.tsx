import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(core)/admin/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(core)/admin/"!</div>
}
