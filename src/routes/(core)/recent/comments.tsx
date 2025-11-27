import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(core)/recent/comments')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(core)/recent/comments"!</div>
}
