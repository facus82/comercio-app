export default function ComingSoon({ titulo }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '60vh',
      gap: 'var(--space-4)',
      color: 'var(--color-text-muted)',
    }}>
      <span style={{ fontSize: '3rem' }}>🚧</span>
      <h2 style={{ color: 'var(--color-text)', margin: 0 }}>{titulo}</h2>
      <p>Esta sección está en construcción.</p>
    </div>
  )
}
