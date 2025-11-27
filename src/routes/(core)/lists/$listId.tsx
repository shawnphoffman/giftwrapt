import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(core)/lists/$listId')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(core)/lists/$listId"!</div>
}
