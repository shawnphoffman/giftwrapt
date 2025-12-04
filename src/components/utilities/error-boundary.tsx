import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Component } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
	children: ReactNode
	fallback?: (error: Error, reset: () => void) => ReactNode
	onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
	hasError: boolean
	error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	constructor(props: ErrorBoundaryProps) {
		super(props)
		this.state = { hasError: false, error: null }
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error }
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		// Log error to console in development
		if (process.env.NODE_ENV === 'development') {
			console.error('ErrorBoundary caught an error:', error, errorInfo)
		}

		// Call optional error handler
		this.props.onError?.(error, errorInfo)
	}

	reset = () => {
		this.setState({ hasError: false, error: null })
	}

	render() {
		if (this.state.hasError && this.state.error) {
			if (this.props.fallback) {
				return this.props.fallback(this.state.error, this.reset)
			}

			return (
				<div className="flex flex-col items-center justify-center min-h-[400px] p-4">
					<Alert variant="destructive" className="max-w-md">
						<AlertTriangle className="h-4 w-4" />
						<AlertTitle>Something went wrong</AlertTitle>
						<AlertDescription className="mt-2">{this.state.error.message || 'An unexpected error occurred'}</AlertDescription>
						<div className="mt-4">
							<Button onClick={this.reset} variant="outline" size="sm">
								Try again
							</Button>
						</div>
					</Alert>
				</div>
			)
		}

		return this.props.children
	}
}
