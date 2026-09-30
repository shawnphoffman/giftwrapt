import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

type Props = {
	value: string
	label?: string
	size?: 'sm' | 'icon'
}

/** Copies `value` to the clipboard and flashes a check mark. */
export function CopyButton({ value, label = 'Copy', size = 'icon' }: Props) {
	const [copied, setCopied] = useState(false)
	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(value)
			setCopied(true)
			toast.success('Copied to clipboard')
			setTimeout(() => setCopied(false), 1500)
		} catch {
			toast.error('Could not copy. Select the text and copy it manually.')
		}
	}
	return (
		<Button type="button" variant="outline" size={size} onClick={handleCopy} aria-label={label} className="shrink-0">
			{copied ? <Check className="size-4" /> : <Copy className="size-4" />}
			{size === 'sm' ? <span>{copied ? 'Copied' : label}</span> : null}
		</Button>
	)
}
