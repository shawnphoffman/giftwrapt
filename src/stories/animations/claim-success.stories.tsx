import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'

import { PrototypeStage, useReplayKey } from './_shared'
import { ClaimButton, type ClaimStage } from './claim-success'

const meta = {
	title: 'Animations/Claim Success',
	parameters: { layout: 'padded' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const HOLD_IDLE_MS = 500
const HOLD_ANIMATING_MS = 2800

function Demo() {
	const [key, replay] = useReplayKey()
	const [stage, setStage] = useState<ClaimStage>('idle')

	useEffect(() => {
		setStage('idle')
		const t1 = setTimeout(() => setStage('animating'), HOLD_IDLE_MS)
		const t2 = setTimeout(() => setStage('settled'), HOLD_IDLE_MS + HOLD_ANIMATING_MS)
		return () => {
			clearTimeout(t1)
			clearTimeout(t2)
		}
	}, [key])

	return (
		<PrototypeStage title="Claim success" inspiration="Stripe Checkout success, Vercel deploy success" onReplay={replay}>
			<ClaimButton stage={stage} />
		</PrototypeStage>
	)
}

export const IconMorph: Story = {
	render: () => <Demo />,
}
