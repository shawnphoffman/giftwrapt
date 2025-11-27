import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(core)/item/import/{-$url}')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(core)/item/import"!</div>
}
