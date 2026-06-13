import './Skeleton.css'

export function SkeletonText({ width = '100%', height = 12, style }) {
  return <span className="sk-text" style={{ width, height, ...style }} />
}

export function SkeletonRow({ cols = 5 }) {
  return (
    <tr className="sk-row">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i}><span className="sk-text" style={{ width: `${60 + (i % 3) * 20}%` }} /></td>
      ))}
    </tr>
  )
}

export function SkeletonTableBody({ rows = 6, cols = 5 }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </tbody>
  )
}

export function SkeletonCard({ height = 80 }) {
  return <div className="sk-card" style={{ height }} />
}
