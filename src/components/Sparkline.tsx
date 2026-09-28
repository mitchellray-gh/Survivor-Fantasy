import React from 'react'

interface SparklineProps {
  values: number[]
  width?: number
  height?: number
  /** Adds a colour class ("up" / "down") based on last-vs-first sign. */
  colored?: boolean
}

/**
 * Dead-simple inline SVG sparkline. Renders nothing if there's fewer than
 * two data points, since a single dot isn't useful signal.
 */
const Sparkline: React.FC<SparklineProps> = ({ values, width = 60, height = 16, colored = true }) => {
  if (!values || values.length < 2) return null

  const min = Math.min(...values, 0)
  const max = Math.max(...values, 0)
  const range = max - min || 1
  const stepX = width / (values.length - 1)

  const points = values.map((v, i) => {
    const x = i * stepX
    // Invert Y because SVG y grows downward.
    const y = height - ((v - min) / range) * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const trend = values[values.length - 1] - values[0]
  const colorClass = colored ? (trend > 0 ? 'up' : trend < 0 ? 'down' : '') : ''

  return (
    <svg
      className={`sparkline ${colorClass}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

export default Sparkline
