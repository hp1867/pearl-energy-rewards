import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { data } from '../services/data'
import { latestPolicies } from '../services/memberIdentity'

const field = { width: '100%', padding: 13, border: '1px solid var(--line)', borderRadius: 12, margin: '8px 0', fontSize: 16 }
const box = { padding: 18, borderRadius: 16, background: '#fff', marginBottom: 16, lineHeight: 1.6 }
function Policy({ policy, title }) {
  return policy ? <details style={{ ...box, border: '1px solid var(--line)' }}><summary>{title} · {policy.version}</summary><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{policy.body}</p></details> : null
}
function usePolicies() {
  const [policies, setPolicies] = useState(null), [error, setError] = useState('')
  useEffect(() => { let active = true; data.publicPolicies().then(rows => { if (active) setPolicies(latestPolicies(rows)) }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [])
  return [policies, error]
}
export function PhoneVerification({ initial = '', onVerified }) {
  const [phone, setPhone] = useState(initial), [sentTo, setSentTo] = useState(''), [token, setToken] = useState('')
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [cooldown, setCooldown] = useState(0)
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(value => value - 1), 1000); return () => clearTimeout(timer) }, [cooldown])
  const run = async task => { if (busy) return; setBusy(true); setError(''); try { await task() } catch (e) { setError(e.message) } finally { setBusy(false) } }
  return <section style={box}>
    <h3>Verify your mobile number</h3>
    <p>One verified phone number can belong to one membership. Use your own number.</p>
    <form onSubmit={e => { e.preventDefault(); void run(async () => { setSentTo(await data.requestPhoneCode(phone)); setToken(''); setCooldown(60) }) }}>
      <label>Mobile number<input style={field} required type="tel" autoComplete="tel" maxLength={24} placeholder="04… or +61…" value={phone} onChange={e => { setPhone(e.target.value); setSentTo(''); setToken('') }} /></label>
      <button className="btn ghost" disabled={busy || cooldown > 0}>{cooldown ? `Resend in ${cooldown}s` : sentTo ? 'Resend code' : 'Send verification code'}</button>
    </form>
    {sentTo && <form onSubmit={e => { e.preventDefault(); void run(async () => { await data.verifyPhoneCode(sentTo, token); setSentTo(''); onVerified?.() }) }}>
      <p role="status">Code requested for {sentTo}.</p>
      <label>SMS code<input style={field} required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} value={token} onChange={e => setToken(e.target.value)} /></label>
      <button className="btn" disabled={busy}>Verify number</button>
    </form>}
    {error && <p role="alert" style={{ color: '#a32424' }}>{error}</p>}
  </section>
}

export default function MemberOnboarding() {
  const { member, retryConnection, logout } = useApp()
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const resend = async () => {
    setBusy(true)
    try { await data.resendConfirmation(member.email); setNotice('Confirmation email requested. Check your inbox and spam folder.') }
    catch (error) { setNotice(error.message) }
    finally { setBusy(false) }
  }
  return <div className="screen"><div className="scroll" style={{ padding: '48px 22px 30px' }}>
    <h1>Confirm your email</h1>
    <p style={box}>Check {member.email} for your confirmation link. Once verified, your membership starts automatically and the home screen opens. No phone verification is needed.</p>
    {notice && <p role="status">{notice}</p>}
    <button className="btn" onClick={retryConnection}>I have confirmed my email</button>
    <button className="btn ghost" disabled={busy} onClick={resend}>Resend confirmation email</button>
    <button className="btn ghost" onClick={logout}>Sign out</button>
  </div></div>
}

export function MemberSettings() {
  const { member, setOverlay, retryConnection, logout } = useApp()
  const [policies, loadError] = usePolicies(), [events, setEvents] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [confirmation, setConfirmation] = useState(''), [closeAccepted, setCloseAccepted] = useState(false), [notice, setNotice] = useState('')
  const refresh = () => data.consentHistory().then(setEvents).catch(e => setError(e.message))
  useEffect(() => { void refresh() }, [])
  const run = async task => { if (busy) return; setBusy(true); setError(''); try { await task(); await refresh() } catch (e) { setError(e.message) } finally { setBusy(false) } }
  return <div className="screen" style={{ position: 'absolute', inset: 0, zIndex: 80 }}><div className="scroll" style={{ padding: '36px 22px' }}>
    <button className="btn ghost" onClick={() => setOverlay(null)}>Back to profile</button><h2 style={{ margin: '18px 0' }}>Account & Privacy</h2>
    <section style={box}><h3>Account security</h3><p>Your account uses verified email. Phone verification is on hold; no SMS provider is required.</p>{member.consentNotice && <p role="status">{member.consentNotice}</p>}</section>
    <section style={box}><h3>Marketing consent</h3><p>Optional marketing is off unless you opt in. Withdrawing it does not close your membership.</p>
      <button className="btn ghost" disabled={busy} onClick={() => run(async () => { await data.setMarketingConsent(!member.preferences?.marketing); setNotice(member.preferences?.marketing ? 'Marketing consent withdrawn.' : 'Marketing consent recorded.') })}>{member.preferences?.marketing ? 'Withdraw marketing consent' : 'Allow marketing messages'}</button>
    </section>
    <Policy policy={policies?.terms} title="Membership terms" /><Policy policy={policies?.privacy} title="Privacy notice" />
    <section style={box}><h3>Your consent history</h3>{events.length ? events.map(event => <p key={event.id}>{event.purpose}: {event.decision} · {event.policy_version}<br /><small>{new Date(event.recorded_at).toLocaleString()}</small></p>) : <p>No consent events to show.</p>}</section>
    <section style={box}><h3>Close your membership</h3><p>Closure disables loyalty access. It does not merge accounts, transfer rewards, or immediately erase transaction records.</p>
      <Policy policy={policies?.closure} title="Account closure disclosure" />
      {policies?.closure ? <><label><input type="checkbox" checked={closeAccepted} onChange={e => setCloseAccepted(e.target.checked)} /> I have read this closure disclosure.</label><input aria-label="Type CLOSE to confirm" style={field} value={confirmation} onChange={e => setConfirmation(e.target.value)} placeholder="Type CLOSE to confirm" /><button className="btn ghost" disabled={busy || !closeAccepted || confirmation !== 'CLOSE'} onClick={() => run(async () => { await data.closeMyAccount(confirmation, policies.closure.version); await logout() })}>Close my membership</button></> : <p>The account closure disclosure has not been published. Contact Pearl Energy for closure assistance.</p>}
    </section>
    {(error || loadError) && <p role="alert" style={{ color: '#a32424' }}>{error || loadError}</p>}{notice && <p role="status">{notice}</p>}
  </div></div>
}
