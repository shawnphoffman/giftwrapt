import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

export default function Loading({ className }: { className?: string }) {
	return <Loader2 size={36} className={cn('transition-colors text-destructive animate-spin', className)} />
}
