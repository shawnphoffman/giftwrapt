import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { m } from '@/paraglide/messages.js'

type Props = {
	value: string
	label?: string
	size?: 'default' | 'sm' | 'icon'
}

/** Copies `value` to the clipboard and flashes a check mark. */
export function CopyButton({ value, label = m.action_copy(), size = 'icon' }: Props) {
	const [copied, setCopied] = useState(false)
	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(value)
			setCopied(true)
			toast.success(m.shared_copied_toast())
			setTimeout(() => setCopied(false), 1500)
		} catch {
			toast.error(m.shared_copy_failed())
		}
	}
	return (
		<Button type="button" variant="outline" size={size} onClick={handleCopy} aria-label={label} className="shrink-0">
			{copied ? <Check className="size-4" /> : <Copy className="size-4" />}
			{size !== 'icon' ? <span>{copied ? m.shared_copied() : label}</span> : null}
		</Button>
	)
}
