// 'use client'

// import { useState } from 'react'
// import { faFaceDisguise } from '@awesome.me/kit-f973af7de0/icons/sharp/solid'
// import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
// import { useRouter } from 'next/navigation'

// import { stopImpersonation } from '@/app/actions/admin'
// import { Button } from '@/components/ui/button'

// import { SidebarMenuButton, SidebarMenuItem } from '../ui/sidebar'

// type Props = {
// 	impersonating: string
// }

// export default function StopImpersonatingButton({ impersonating }: Props) {
// 	const router = useRouter()
// 	const [isLoading, setIsLoading] = useState(false)

// 	if (!impersonating) return null

// 	const handleStopImpersonation = async () => {
// 		try {
// 			setIsLoading(true)
// 			const result = await stopImpersonation(impersonating)
// 			// console.log('result', result)
// 			if (result.link) {
// 				router.push(result.link)
// 				router.refresh()
// 			}
// 		} catch (error) {
// 			// console.error('Error stopping impersonation:', error)
// 			window.location.href = '/'
// 		} finally {
// 			setIsLoading(false)
// 		}
// 	}

// 	return (
// 		<SidebarMenuItem title={`Stop Impersonating > ${impersonating}`}>
// 			<SidebarMenuButton asChild>
// 				<Button
// 					onClick={handleStopImpersonation}
// 					disabled={isLoading}
// 					variant="destructive"
// 					className="justify-start transition-colors hover:bg-destructive/80"
// 				>
// 					<FontAwesomeIcon className={`!size-3 ${isLoading ? 'animate-spin' : ''}`} icon={faFaceDisguise} />
// 					<span>Stop Impersonating</span>
// 				</Button>
// 			</SidebarMenuButton>
// 		</SidebarMenuItem>
// 		// <Button
// 		// 	size="icon"
// 		// 	variant="destructive"
// 		// 	className="px-2 mr-2"
// 		// >
// 		// 	<FontAwesomeIcon icon={faFaceDisguise} size="xl" className={`text-destructive-foreground ${isLoading ? 'animate-spin' : ''}`} />
// 		// </Button>
// 	)
// }
