import { Loader2 } from 'lucide-react'

export default function Loading() {
	return (
		<div className="text-center text-primary">
			<Loader2 size={36} className="transition-colors text-destructive animate-spin" />
		</div>
	)
}
