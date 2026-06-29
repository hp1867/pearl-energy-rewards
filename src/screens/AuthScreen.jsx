import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Phone, Lock, User, Calendar, ScanFace, Fingerprint, ChevronLeft, Check, Loader2 } from 'lucide-react'
import { BrandLogo } from '../components/Brand'
import { useApp } from '../context/AppContext'

export default function AuthScreen() {
  const { signup, login, loginProvider, notify, mode } = useApp()
  const [view, setView] = useState('login')   // 'login' | 'signup' | 'otp'
  const [method, setMethod] = useState('email')
  const [terms, setTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', mobile: '', dob: '', password: '', confirm: '' })

  const bind = (k) => ({ value: form[k], onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })) })
  const identifier = method === 'email' ? form.email : form.mobile || `${form.email}`

  const run = async (fn) => {
    setError(''); setBusy(true)
    try { await fn() } catch (e) { setError(e?.message?.replace('Firebase: ', '') || 'Something went wrong') } finally { setBusy(false) }
  }

  const doLogin = () => run(() => login({ email: identifier, password: form.password }))
  const doSignupStart = () => {
    if (!terms) { setError('Please accept the Terms & Privacy Policy'); return }
    if (form.password && form.password !== form.confirm) { setError('Passwords do not match'); return }
    setError(''); setView('otp')
  }
  const doSignupFinish = () => run(() => signup({ ...form, email: identifier }))
  const social = (name) => run(() => loginProvider(name))
  const biometric = () => {
    if (mode === 'local') run(() => login({ email: identifier || 'demo@pearlenergy.com.au', password: 'demo' }))
    else notify('Biometric sign-in is available in the native app build')
  }

  return (
    <div className="screen" style={{ background: 'var(--silver)' }}>
      <div style={{ background: 'var(--grad-blue-deep)', padding: '54px 24px 30px', borderRadius: '0 0 32px 32px', color: '#fff' }}>
        <BrandLogo light />
        <h1 style={{ fontSize: 26, marginTop: 22 }}>
          {view === 'signup' ? 'Create your account' : view === 'otp' ? 'Verify it’s you' : 'Welcome back'}
        </h1>
        <p style={{ opacity: 0.82, marginTop: 6, fontSize: 14 }}>
          {view === 'otp' ? 'Enter the 4-digit code we sent you' : 'Fuel. Shop. Earn. Redeem.'}
        </p>
        <span style={{ display: 'inline-block', marginTop: 12, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.18)' }}>
          {mode === 'firebase' ? '● Connected to Firebase' : '● Demo mode (local DB)'}
        </span>
      </div>

      <div className="scroll" style={{ padding: '22px 24px' }}>
        <AnimatePresence mode="wait">
          {view === 'otp' ? (
            <Otp key="otp" busy={busy} onBack={() => setView('signup')} onVerify={doSignupFinish} />
          ) : (
            <motion.div key={view} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                <Toggle active={method === 'email'} onClick={() => setMethod('email')} icon={Mail} label="Email" />
                <Toggle active={method === 'mobile'} onClick={() => setMethod('mobile')} icon={Phone} label="Mobile" />
              </div>

              {view === 'signup' && (
                <div style={{ display: 'flex', gap: 12 }}>
                  <Field icon={User} placeholder="First name" {...bind('firstName')} />
                  <Field icon={User} placeholder="Last name" {...bind('lastName')} />
                </div>
              )}
              {method === 'email'
                ? <Field icon={Mail} placeholder="Email address" type="email" {...bind('email')} />
                : <Field icon={Phone} placeholder="Mobile number" type="tel" {...bind('mobile')} />}
              {view === 'signup' && method === 'email' && <Field icon={Phone} placeholder="Mobile number" type="tel" {...bind('mobile')} />}
              {view === 'signup' && <Field icon={Calendar} placeholder="Date of birth" type="text" onFocus={(e) => (e.target.type = 'date')} {...bind('dob')} />}
              <Field icon={Lock} placeholder="Password" type="password" {...bind('password')} />
              {view === 'signup' && <Field icon={Lock} placeholder="Confirm password" type="password" {...bind('confirm')} />}

              {view === 'login' ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 2px 18px' }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>
                    <input type="checkbox" defaultChecked /> Remember me
                  </label>
                  <button onClick={() => notify('Password reset link sent 📧')} style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>Forgot password?</button>
                </div>
              ) : (
                <label onClick={() => setTerms(!terms)} style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '8px 2px 18px', fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 7, border: '2px solid var(--primary)', background: terms ? 'var(--primary)' : '#fff', display: 'grid', placeItems: 'center' }}>
                    {terms && <Check size={14} color="#fff" />}
                  </span>
                  I accept the Terms & Privacy Policy
                </label>
              )}

              {error && <div style={{ background: '#fdecea', color: 'var(--error)', fontSize: 13, fontWeight: 600, padding: '10px 14px', borderRadius: 12, marginBottom: 14 }}>{error}</div>}

              <button className="btn" disabled={busy} onClick={() => (view === 'signup' ? doSignupStart() : doLogin())} style={{ opacity: busy ? 0.7 : 1 }}>
                {busy ? <Loader2 size={18} className="spin" /> : view === 'signup' ? 'Create account' : 'Log in'}
              </button>

              {view === 'login' && (
                <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
                  <BioBtn icon={ScanFace} label="Face ID" onClick={biometric} />
                  <BioBtn icon={Fingerprint} label="Fingerprint" onClick={biometric} />
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0', color: 'var(--muted)', fontSize: 12, fontWeight: 600 }}>
                <span style={{ flex: 1, height: 1, background: 'var(--line)' }} /> OR <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <Social label="Google" emoji="G" onClick={() => social('Google')} />
                <Social label="Apple" emoji="" onClick={() => social('Apple')} />
              </div>

              <p style={{ textAlign: 'center', marginTop: 22, fontSize: 14, color: 'var(--ink-soft)' }}>
                {view === 'login' ? 'New to Pearl Energy?' : 'Already a member?'}{' '}
                <button onClick={() => { setError(''); setView(view === 'login' ? 'signup' : 'login') }} style={{ color: 'var(--primary)', fontWeight: 700 }}>
                  {view === 'login' ? 'Sign up' : 'Log in'}
                </button>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function Otp({ onBack, onVerify, busy }) {
  const [code, setCode] = useState(['', '', '', ''])
  const set = (i, v) => { const c = [...code]; c[i] = v.slice(-1); setCode(c) }
  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--primary)', fontWeight: 600, marginBottom: 20 }}>
        <ChevronLeft size={18} /> Back
      </button>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24 }}>
        {code.map((d, i) => (
          <input key={i} value={d} onChange={(e) => set(i, e.target.value)} inputMode="numeric" maxLength={1}
            style={{ width: 58, height: 66, textAlign: 'center', fontSize: 26, fontWeight: 800, borderRadius: 16, border: '2px solid var(--line)', background: '#fff', color: 'var(--ink)' }} />
        ))}
      </div>
      <button className="btn" disabled={busy} onClick={onVerify} style={{ opacity: busy ? 0.7 : 1 }}>
        {busy ? <Loader2 size={18} className="spin" /> : 'Verify & create account'}
      </button>
      <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--muted)' }}>Didn’t get a code? <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Resend</span></p>
    </motion.div>
  )
}

const fieldWrap = { display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', marginBottom: 14, boxShadow: 'var(--shadow-sm)' }
function Field({ icon: Icon, ...p }) {
  return (
    <div style={{ ...fieldWrap, flex: 1 }}>
      <Icon size={18} color="var(--muted)" />
      <input {...p} style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, background: 'transparent', color: 'var(--ink)' }} />
    </div>
  )
}
function Toggle({ active, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 12, borderRadius: 12, fontWeight: 700, fontSize: 14, background: active ? 'var(--primary-container)' : '#fff', color: active ? '#fff' : 'var(--ink-soft)', boxShadow: active ? 'var(--shadow-blue)' : 'var(--shadow-sm)' }}>
      <Icon size={16} /> {label}
    </button>
  )
}
function BioBtn({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px', borderRadius: 14, background: '#fff', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--line)', color: 'var(--primary)', fontWeight: 600, fontSize: 12 }}>
      <Icon size={26} /> {label}
    </button>
  )
}
function Social({ label, emoji, onClick }) {
  return (
    <button onClick={onClick} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14, background: '#fff', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--line)', fontWeight: 700, fontSize: 14 }}>
      <span style={{ fontSize: 18 }}>{emoji}</span> {label}
    </button>
  )
}
