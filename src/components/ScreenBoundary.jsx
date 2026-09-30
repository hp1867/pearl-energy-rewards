import { Component, Suspense } from 'react'

function LoadingScreen({ overlay, onClose }) {
  return <div className="screen" style={{ padding: '80px 24px', background: 'var(--silver)', ...(overlay ? { zIndex: 80 } : {}) }}>
    <p role="status" aria-live="polite">Loading screen…</p>
    {onClose && <button className="btn ghost" style={{ marginTop: 20 }} onClick={onClose}>Back</button>}
  </div>
}

// Keep navigation usable after a failed chunk download (offline/stale deployment).
export default class ScreenBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    const { children, overlay, onClose } = this.props
    if (this.state.failed) return <div className="screen" role="alert" style={{ padding: '80px 24px', background: 'var(--silver)', ...(overlay ? { zIndex: 80 } : {}) }}>
      <h2>This screen could not be loaded</h2>
      <p style={{ margin: '16px 0' }}>Check your connection, then reload. Your account and points have not been changed by this loading error.</p>
      <button className="btn" onClick={() => window.location.reload()}>Reload app</button>
      {onClose && <button className="btn ghost" style={{ marginTop: 12 }} onClick={onClose}>Back</button>}
    </div>
    return <Suspense fallback={<LoadingScreen overlay={overlay} onClose={onClose} />}>{children}</Suspense>
  }
}
