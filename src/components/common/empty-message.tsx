type Props = {
	message: string
}

export default function EmptyMessage({ message }: Props) {
	return <div className="px-2 py-1 text-sm italic border border-dashed rounded text-muted-foreground bg-background/25">{message}</div>
}
