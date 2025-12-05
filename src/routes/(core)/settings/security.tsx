import { createFileRoute } from '@tanstack/react-router'

import PasswordForm from '@/components/settings/password-form'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/(core)/settings/security')({
	component: SecurityPage,
})

function SecurityPage() {
	return (
		<div className="animate-page-in gap-6 flex flex-col">
			<CardHeader className="">
				<CardTitle className="text-2xl">Security</CardTitle>
				<CardDescription>Change your password and security settings.</CardDescription>
			</CardHeader>
			<CardContent>
				<PasswordForm />
			</CardContent>
		</div>
	)
}
