import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(core)/me/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(core)/me/"!</div>
}
