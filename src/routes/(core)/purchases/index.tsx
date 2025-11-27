import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(core)/purchases/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(core)/purchases/"!</div>
}
