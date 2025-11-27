import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(core)/recent/items')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(core)/recent/items"!</div>
}
