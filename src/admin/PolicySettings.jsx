import { useEffect, useState } from 'react'
import { data } from '../services/data'

export default function PolicySettings() {
  const [rows, setRows] = useState([]), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ kind: 'terms', version: '', body: '' }), [approved, setApproved] = useState(false)
  const refresh = () => data.publicPolicies?.().then(setRows).catch(e => setError(e.message))
  useEffect(() => { void refresh() }, [])
  if (!data.adminPublishPolicy) return <p>Policy publishing requires connected Supabase mode.</p>
  const publish = async e => {
    e.preventDefault(); if (busy || !approved) return
    setBusy(true); setError(''); setNotice('')
    try { await data.adminPublishPolicy(form.kind, form.version, form.body); setNotice('Published. Existing versions and consent records remain unchanged.'); setForm({ kind: form.kind, version: '', body: '' }); setApproved(false); await refresh() } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <section className="panel"><div className="phead"><h3>Membership policies & consent</h3></div>
    <div style={{ padding: 22 }}><p>Publish business-approved text, not a placeholder. The app shows the exact saved version and records each member’s acceptance. Verified-email memberships activate automatically, even while documents are awaiting publication. Sign-in records acceptance only when both published documents were displayed. Closure disclosure is required for self-service closure.</p>
      <p>No account merging or duplicate-account transfer service is provided. SMS verification is on hold. Email verification is required; administrators cannot mark identities as verified here.</p>
      <form onSubmit={publish}>
        <label className="field">Document<select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}><option value="terms">Membership terms</option><option value="privacy">Privacy notice</option><option value="closure">Account closure disclosure</option></select></label>
        <label className="field">New version ID<input required maxLength={60} value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} placeholder="e.g. 2026-10-01-v1" /></label>
        <label className="field">Full approved text (plain text)<textarea required minLength={50} maxLength={100000} rows={14} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} /></label>
        <label><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} required /> I confirm this text is approved for publication to customers.</label>
        <p>Published versions cannot be edited or deleted. Publish a new version to make a correction.</p>
        <button className="btn" disabled={busy || !approved}>{busy ? 'Publishing…' : 'Publish approved version'}</button>
      </form>
      {error && <p role="alert" className="panel-error">{error}</p>}{notice && <p role="status">{notice}</p>}
      <h4 style={{ marginTop: 22 }}>Published versions</h4>{rows.length ? rows.map(row => <details key={`${row.kind}:${row.version}`} style={{ margin: '12px 0' }}><summary>{row.kind} · {row.version} · {new Date(row.published_at).toLocaleString()}</summary><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.body}</p></details>) : <p>None published. Members can sign in, but no acceptance of unpublished documents is recorded. Publish approved documents before public launch.</p>}
    </div></section>
}
