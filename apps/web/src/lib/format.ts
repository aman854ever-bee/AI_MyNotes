export function relativeDate(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMin = Math.round((now - then) / 60000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`

  const diffDay = Math.round(diffHr / 24)
  if (diffDay === 1) return 'Yesterday'
  if (diffDay < 7) return `${diffDay} days ago`

  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
