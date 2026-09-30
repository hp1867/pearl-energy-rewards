export function Header({ title, sub }) {
  return (
    <div style={{ padding: '52px 20px 16px' }}>
      <h1 style={{ fontSize: 28 }}>{title}</h1>
      {sub && <p style={{ color: 'var(--muted)', marginTop: 4, fontSize: 14 }}>{sub}</p>}
    </div>
  )
}
