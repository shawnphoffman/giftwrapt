import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(core)/lists_/$listId/bulk')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(core)/lists_/$listId"!</div>
}
