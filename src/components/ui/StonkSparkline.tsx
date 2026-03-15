interface Props {
  days: { date: string; balance: number }[]
  width?: number
  height?: number
}

export function StonkSparkline({ days, width = 120, height = 32 }: Props) {
  if (days.length < 2) {
    // Flat line
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
        <line
          x1={0} y1={height / 2} x2={width} y2={height / 2}
          stroke="var(--color-accent)"
          strokeWidth={1.5}
          opacity={0.4}
        />
      </svg>
    )
  }

  const pad = 2
  const maxBal = Math.max(...days.map(d => d.balance))
  const minBal = Math.min(...days.map(d => d.balance))
  const range = maxBal - minBal || 1

  const points = days.map((d, i) => {
    const x = pad + (i / (days.length - 1)) * (width - pad * 2)
    const y = pad + (1 - (d.balance - minBal) / range) * (height - pad * 2)
    return `${x},${y}`
  }).join(" ")

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
