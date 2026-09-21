import { useEffect, useState } from 'react'
import { Mail, Lock, User, Calendar, Loader2 } from 'lucide-react'
import { BrandLogo } from '../components/Brand'
import { useApp } from '../context/AppContext'
import { data } from '../services/data'
import { authErrorMessage } from '../supabase/settings'
import { latestPolicies } from '../services/memberIdentity'

export default function AuthScreen() {
  const { signup, login, loginProvider, mode, user, connectionError, retryConnection, logout } = useApp()
  const [view, setView] = useState(user?.recovery ? 'password' : 'login')
  const [busy, setBusy] = useState(false), [policies, setPolicies] = useState(null)
  const [policyError, setPolicyError] = useState('')
  const registrationConsent = policies?.terms && policies?.privacy ? { terms: policies.terms.version, privacy: policies.privacy.version } : null
  const [error, setError] = useState(''), [message, setMessage] = useState('')
  const [providers, setProviders] = useState([]), [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', mobile:'', dob:'', password:'', confirm:'' })
  const bind = key => ({ value:form[key], onChange:event => setForm(previous => ({ ...previous,[key]:event.target.value })) })
  useEffect(() => { if (user?.recovery) setView('password') }, [user?.recovery])
  useEffect(() => {
    let active = true
    if (mode !== 'local') data.publicPolicies().then(rows => { if (active) setPolicies(latestPolicies(rows)) }).catch(() => { if (active) setPolicyError('Membership documents could not be loaded. Sign-in is still available; documents are also available in Account & Privacy.') })
    return () => { active = false }
  }, [mode])
  useEffect(() => {
    let active = true
    if (mode === 'local') setProviders(['Google','Apple'])
    else data.authOptions?.().then(options => { if (active) setProviders(['Google','Apple'].filter(name => options[name.toLowerCase()])) }).catch(() => {})
    const query = new URLSearchParams(window.location.search), hash = new URLSearchParams(window.location.hash.slice(1))
    const callbackError = query.get('error_description') || hash.get('error_description')
    if (callbackError) {
      setError(authErrorMessage({ code: query.get('error_code') || hash.get('error_code'), message: callbackError }))
      window.history.replaceState({}, '', window.location.pathname)
    }
    return () => { active = false }
  }, [mode])
  const run = async task => {
    if (busy) return
    setError(''); setMessage(''); setBusy(true)
    try { await task() } catch (e) { setNeedsConfirmation(e.code === 'email_not_confirmed'); setError(authErrorMessage(e)) } finally { setBusy(false) }
  }
  const submit = event => {
    event.preventDefault()
    void run(async () => {
      if (view === 'reset') {
        if (!data.resetPassword) throw new Error('Password reset is not available in preview mode.')
        await data.resetPassword(form.email)
        setMessage('If this email has an account, a reset link will arrive shortly. Check your inbox and spam folder.')
      } else if (view === 'password') {
        if (form.password !== form.confirm) throw new Error('Passwords do not match')
        await data.setPassword(form.password)
        await logout()
        window.history.replaceState({}, '', '/')
        setView('login'); setMessage('Password updated. Log in with your new password.')
      } else if (view === 'signup') {
        if (form.password !== form.confirm) throw new Error('Passwords do not match')
        const result = await signup({ ...form, registrationConsent })
        if (result?.requiresConfirmation) {
          setView('login'); setForm(previous => ({ ...previous,password:'',confirm:'' }))
          setMessage('Check your email to confirm your account, then return here to log in. Confirmation links should be opened in this browser.')
        }
      } else await login({ email:form.email,password:form.password, registrationConsent })
    })
  }
  const title = { login:'Welcome back',signup:'Create your account',reset:'Reset your password',password:'Choose a new password' }[view]
  return (
    <div className="screen" style={{ background:'var(--silver)' }}>
      <div style={{ background:'var(--grad-blue-deep)',padding:'54px 24px 30px',borderRadius:'0 0 32px 32px',color:'#fff' }}>
        <BrandLogo light /><h1 style={{ fontSize:26,marginTop:22 }}>{title}</h1>
        <p style={{ opacity:.82,marginTop:6,fontSize:14 }}>Fuel. Shop. Earn. Redeem.</p>
        <span style={{ display:'inline-block',marginTop:12,fontSize:11,padding:'4px 10px',borderRadius:999,background:'rgba(255,255,255,.18)' }}>
          {mode === 'local' ? 'Client preview — local demo data' : 'Secure account sign-in · Supabase'}
        </span>
      </div>
      <div className="scroll" style={{ padding:'22px 24px' }}>
        {connectionError && <div role="alert" style={errorStyle}>{connectionError}<button onClick={retryConnection} style={{ display:'block',marginTop:8,fontWeight:700 }}>Retry connection</button></div>}
        <form onSubmit={submit}>
          {view === 'signup' && <div style={{ display:'flex',gap:12 }}>
            <Field icon={User} label="First name" required autoComplete="given-name" maxLength={80} {...bind('firstName')} />
            <Field icon={User} label="Last name" required autoComplete="family-name" maxLength={80} {...bind('lastName')} />
          </div>}
          {view !== 'password' && <Field icon={Mail} label="Email address" type="email" required autoComplete="email" {...bind('email')} />}
          {view === 'signup' && <>
            <Field icon={Calendar} label="Date of birth (optional)" type="date" max={new Date().toISOString().slice(0,10)} {...bind('dob')} />
          </>}
          {view !== 'reset' && <Field icon={Lock} label={view === 'password' ? 'New password' : 'Password'} type="password" required minLength={view === 'login' ? undefined : 10} autoComplete={view === 'login' ? 'current-password' : 'new-password'} {...bind('password')} />}
          {['signup','password'].includes(view) && <>
            <Field icon={Lock} label="Confirm password" type="password" required minLength={10} autoComplete="new-password" {...bind('confirm')} />
            <p style={{ fontSize:12,color:'var(--muted)',marginBottom:14 }}>Use at least 10 characters.</p>
          </>}
          {['login','signup'].includes(view) && <div style={{ fontSize:13,marginBottom:18,lineHeight:1.6 }}>
            <p>Your membership starts automatically after your email is verified. No phone code or separate activation is needed.</p>
            {registrationConsent ? <>
              <p>By selecting Create account, Log in, or a social sign-in button below, you agree to the Membership Terms and acknowledge the Privacy Notice shown here. Marketing is optional and stays off unless you opt in.</p>
              {['terms','privacy'].map(kind => <details key={kind}><summary>{kind === 'terms' ? 'Membership Terms' : 'Privacy Notice'} ({policies[kind].version})</summary><p style={{ whiteSpace:'pre-wrap',overflowWrap:'anywhere' }}>{policies[kind].body}</p></details>)}
            </> : <p style={{ color:'var(--muted)' }}>{policyError || (policies ? 'Membership documents have not been published yet. No policy acceptance or marketing consent is recorded.' : 'Loading membership documents…')}</p>}
          </div>}
          {view === 'login' && <button type="button" onClick={() => { setView('reset');setError('');setMessage('') }} style={{ display:'block',margin:'0 0 18px auto',fontSize:13,color:'var(--primary)',fontWeight:600 }}>Forgot password?</button>}
          {error && <div role="alert" style={errorStyle}>{error}</div>}
          {needsConfirmation && data.resendConfirmation && <button type="button" className="btn ghost" disabled={busy || !form.email} onClick={() => run(async () => { await data.resendConfirmation(form.email); setMessage('A new confirmation email has been requested. Open it in this browser.'); setNeedsConfirmation(false) })}>Resend confirmation email</button>}
          {message && <div role="status" style={{ ...errorStyle,background:'#e7f7ee',color:'#155c35' }}>{message}</div>}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? <Loader2 size={18} className="spin" /> : { login:'Log in',signup:'Create account',reset:'Send reset link',password:'Save password' }[view]}
          </button>
        </form>
        {['login','signup'].includes(view) && providers.length > 0 && <>
          <p style={{ textAlign:'center',margin:'20px 0',color:'var(--muted)',fontSize:12 }}>OR CONTINUE WITH</p>
          <div style={{ display:'flex',gap:12 }}>
            {providers.map(name => <button key={name} className="btn ghost" disabled={busy} onClick={() => run(() => loginProvider(name, registrationConsent))}>{name}</button>)}
          </div>
        </>}
        <p style={{ textAlign:'center',marginTop:22,fontSize:14,color:'var(--ink-soft)' }}>
          <button disabled={busy} onClick={() => { setView(view === 'login' ? 'signup' : 'login');setError('');setMessage('') }} style={{ color:'var(--primary)',fontWeight:700 }}>
            {view === 'login' ? 'New to Pearl Energy? Sign up' : 'Back to log in'}
          </button>
        </p>
      </div>
    </div>
  )
}
const errorStyle = { background:'#fdecea',color:'#9f2525',fontSize:13,padding:'12px 14px',borderRadius:12,marginBottom:14,lineHeight:1.5 }
function Field({ icon:Icon,label,...props }) {
  return <label style={{ display:'flex',alignItems:'center',gap:10,background:'#fff',border:'1px solid var(--line)',borderRadius:14,padding:'14px 16px',marginBottom:14,flex:1,minWidth:0 }}>
    <Icon size={18} color="var(--muted)" /><input aria-label={label} placeholder={label} {...props} style={{ flex:1,minWidth:0,border:'none',outline:'none',fontSize:15,background:'transparent',color:'var(--ink)' }} />
  </label>
}
