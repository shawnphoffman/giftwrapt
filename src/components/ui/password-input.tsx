'use client'

// https://shadcn-ui-multi-form.vercel.app/components/password-input
import { Eye, EyeOff } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

import { Button } from './button'
import { Input } from './input'

const PasswordInput = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => {
	const [showPassword, setShowPassword] = React.useState(false)

	const handleTogglePasswordVisibility = () => {
		setShowPassword(prev => !prev)
	}

	return (
		<div className="relative">
			<Input type={showPassword ? 'text' : 'password'} className={cn('pr-10', className)} {...props} />
			<Button
				type="button"
				variant="outline"
				size="icon"
				className="absolute right-0 top-0 hover:bg-transparent"
				onClick={handleTogglePasswordVisibility}
			>
				{showPassword ? <EyeOff className="size-4 text-muted-foreground" /> : <Eye className="size-4 text-muted-foreground" />}
				<span className="sr-only">{showPassword ? 'Hide password' : 'Show password'}</span>
			</Button>
		</div>
	)
}

export { PasswordInput }
