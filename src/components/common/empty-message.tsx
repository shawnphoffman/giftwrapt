type Props = {
	message: string
}

export default function EmptyMessage({ message }: Props) {
	return <div className="text-sm text-muted-foreground py-3 px-3 border border-dashed rounded-lg bg-accent/30">{message}</div>
}
