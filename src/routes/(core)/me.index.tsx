import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { createFileRoute } from '@tanstack/react-router'
import { ListOrdered } from 'lucide-react'

export const Route = createFileRoute('/(core)/me/')({
	component: MyListsPage,
})

function MyListsPage() {
	return (
		<div className="flex flex-col flex-1 w-full max-w-5xl px-2 animate-page-in">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				{/* NOTE This doesn't follow the normal page pattern */}
				<div className="relative flex flex-row flex-wrap justify-between gap-2">
					<h1>My Lists</h1>
					<ListOrdered className="size-18 text-red-500 opacity-30 absolute left-4 -top-4 -z-10" />
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
						Nobody else can see these lists unless you explicitly make them an editor. These are nice for personal shopping lists or sitting
						on things you may want to add to a public list later.
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
						These are lists that others created and then added you as an editor. You can edit these lists from here or, if they are public,
						view them as a gift-giver from the main lists page.
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
	)
}
