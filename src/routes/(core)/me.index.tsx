import { createFileRoute, useLocation, useNavigate } from '@tanstack/react-router'
import { ListOrdered } from 'lucide-react'

import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export const Route = createFileRoute('/(core)/me/')({
	component: MyListsPage,
})

function MyListsPage() {
	const location = useLocation()
	const navigate = useNavigate()

	const isCreateListOpen = location.hash === '#new' || location.hash === 'new'

	const closeCreateListDialog = () => {
		navigate({ to: '/me', replace: true })
	}

	return (
		<>
			<Dialog
				open={isCreateListOpen}
				onOpenChange={open => {
					if (!open) closeCreateListDialog()
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create list</DialogTitle>
						<DialogDescription>This is a placeholder dialog for the “Create list” flow.</DialogDescription>
					</DialogHeader>
					<LoadingSkeleton />
					<DialogFooter>
						<Button type="button" variant="secondary" onClick={closeCreateListDialog}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<div className="flex flex-col flex-1 w-full max-w-3xl px-2 animate-page-in">
				<div className="flex flex-col flex-1 gap-6">
					{/* HEADING */}
					{/* NOTE This doesn't follow the normal page pattern */}
					<div className="relative flex flex-row flex-wrap justify-between gap-2">
						<h1>My Lists</h1>
						<ListOrdered className="text-red-500 wish-page-icon" />
						{/* <div className="flex flex-row flex-wrap justify-end flex-1 gap-0.5 items-center md:justify-end shrink-0">
							{/* <NewListButton /> */}
						{/* </div> */}
					</div>

					{/* PUBLIC LISTS */}
					<div className="flex flex-col gap-2">
						<h3>My Public Lists</h3>
						<div className="text-sm italic leading-tight text-muted-foreground">
							These are the lists that everybody can see and use for gift-giving. If a list is not in this section then it is either not
							public or you are not marked as the recipient. You can change your primary list by clicking on the list&apos;s star icon.
						</div>
						<LoadingSkeleton />
						{/* <Suspense fallback={<FallbackRowThick />}>
							<MyLists type={ListType.PUBLIC} />
						</Suspense> */}
					</div>

					{/* PRIVATE LISTS */}
					<div className="flex flex-col gap-2">
						<h3>My Private Lists</h3>
						<div className="text-sm italic leading-tight text-muted-foreground">
							Nobody else can see these lists unless you explicitly make them an editor. These are nice for personal shopping lists or
							sitting on things you may want to add to a public list later.
						</div>
						<LoadingSkeleton />
						{/* <Suspense fallback={<FallbackRowThick />}>
							<MyLists type={ListType.PRIVATE} />
						</Suspense> */}
					</div>

					{/* GIFT IDEAS LISTS */}
					<div className="flex flex-col gap-2">
						<h3>Gift Ideas for Others</h3>
						<div className="text-sm italic leading-tight text-muted-foreground">
							These are idea lists for other people. These are helpful for adding things throughout the year that you think someone might
							like.
						</div>
						<LoadingSkeleton />
						{/* <Suspense fallback={<FallbackRowThick />}>
							<MyLists type={ListType.GIFT_IDEAS} />
						</Suspense> */}
					</div>

					{/* <Separator /> */}

					{/* SHARED WITH ME LISTS */}
					<div className="flex flex-col gap-2">
						<h3>Lists I Can Edit</h3>
						<div className="text-sm italic leading-tight text-muted-foreground">
							These are lists that others created and then added you as an editor. You can edit these lists from here or, if they are
							public, view them as a gift-giver from the main lists page.
						</div>
						<LoadingSkeleton />
						{/* <Suspense fallback={<FallbackRowThick />}>
							<MyLists type={ListType.SHARED_WITH_ME} />
						</Suspense> */}
					</div>

					{/* SHARED LISTS */}
					<div className="flex flex-col gap-2">
						<h3>My List Editors</h3>
						<div className="text-sm italic leading-tight text-muted-foreground">
							These are lists that you have added editors to. Editors are able to modify the items on your list just as you do but they can
							also view your list as gift giver.
						</div>
						<LoadingSkeleton />
						{/* <Suspense fallback={<FallbackRowThick />}>
							<MyLists type={ListType.SHARED_WITH_OTHERS} />
						</Suspense> */}
					</div>
				</div>
			</div>
		</>
	)
}
