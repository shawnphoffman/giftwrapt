import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/item/clone')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(core)/item/clone"!</div>
}
