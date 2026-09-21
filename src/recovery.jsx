import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseSettings, authErrorMessage } from './supabase/settings'
import './index.css'

// A support-initiated email cannot use the administrator's PKCE verifier.
// Keep this recovery-only, in-memory client separate from normal PKCE sign-in.
const { url, key, configured } = resolveSupabaseSettings(import.meta.env)
const fragment = new URLSearchParams(window.location.hash.slice(1))
const recoveryLink = fragment.get('type') === 'recovery' && !!fragment.get('access_token') && !!fragment.get('refresh_token')
const client = configured && recoveryLink ? createClient(url, key, { auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: true, storageKey: 'pearl-recovery-only' } }) : null

function Recovery() {
  const [email, setEmail] = useState(''), [error, setError] = useState(''), [done, setDone] = useState(false), [busy, setBusy] = useState(false)
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState('')
  useEffect(() => {
    if (!client) { setError('Open the new password-reset link sent to your registered email. This page cannot reset an account without that link.'); return }
    let active = true
    client.auth.getUser().then(({ data, error }) => { if (!active) return; if (error || !data.user) setError(authErrorMessage(error)); else setEmail(data.user.email); window.history.replaceState({}, '', '/recovery.html') })
    return () => { active = false }
  }, [])
  const submit = async e => {
    e.preventDefault(); if (busy || !email || !client) return
    if (password !== confirm) { setError('Passwords do not match'); return }
    setBusy(true); setError('')
    try {
      const { error } = await client.auth.updateUser({ password }); if (error) throw error
      await client.auth.signOut(); setPassword(''); setConfirm(''); setDone(true)
    } catch (e) { setError(authErrorMessage(e)) } finally { setBusy(false) }
  }
  const style = { width: '100%', padding: 14, borderRadius: 12, border: '1px solid var(--line)', margin: '8px 0 16px', fontSize: 16 }
  return <div className="stage"><main style={{ maxWidth: 430, padding: 26, margin: '70px auto', background: '#fff', borderRadius: 20 }}>
    <h1>Reset your password</h1>{done ? <p role="status" style={{ marginTop: 18 }}>Your password was updated. Return to the app and log in.</p> : email ? <form onSubmit={submit}><p style={{ marginTop: 16 }}>For {email}</p><label>New password<input required minLength={10} autoComplete="new-password" type="password" style={style} value={password} onChange={e => setPassword(e.target.value)} /></label><label>Confirm password<input required minLength={10} autoComplete="new-password" type="password" style={style} value={confirm} onChange={e => setConfirm(e.target.value)} /></label><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button></form> : !error && <p>Checking your recovery link…</p>}
    {error && <p role="alert" style={{ color: '#a32424', margin: '16px 0' }}>{error}</p>}<a href="/" style={{ display: 'block', marginTop: 20 }}>Return to Pearl Energy</a>
  </main></div>
}
createRoot(document.getElementById('root')).render(<Recovery />)
