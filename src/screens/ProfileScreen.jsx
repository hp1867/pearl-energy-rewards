import { motion } from 'framer-motion'
import {
  Receipt, Gift, CreditCard, Bell, Shield, HelpCircle, Headphones, LogOut, ChevronRight, Pencil, Search,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Header } from './OffersScreen'

const formatJoined = (v) => {
  const d = new Date(v)
  return isNaN(d) ? v : d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
}

export default function ProfileScreen() {
  const { member, logout, setOverlay, notify } = useApp()

  const rows = [
    { icon: Receipt, label: 'Transaction History', go: () => setOverlay('receipts') },
    { icon: Gift, label: 'Reward History', go: () => notify('Opening reward history') },
    { icon: CreditCard, label: 'Saved Wallet Card', go: () => setOverlay('wallet') },
    { icon: Search, label: 'Customer Lookup', go: () => setOverlay('lookup') },
    { icon: Bell, label: 'Notification Settings', go: () => setOverlay('notifications') },
    { icon: Shield, label: 'Security Settings', go: () => notify('Security settings') },
    { icon: HelpCircle, label: 'Help Centre', go: () => notify('Opening Help Centre') },
    { icon: Headphones, label: 'Contact Support', go: () => notify('Connecting to support…') },
  ]

  return (
    <div className="screen">
      <div className="scroll">
        <Header title="Profile" />

        {/* identity card */}
        <div style={{ padding: '0 20px' }}>
          <div style={{ background: 'var(--grad-blue-deep)', borderRadius: 24, padding: 22, color: '#fff', display: 'flex', gap: 16, alignItems: 'center', position: 'relative' }}>
            <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'var(--grad-gold)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 26, color: '#3a2c08' }}>
              {member.firstName[0]}{member.lastName[0]}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 20 }}>{member.name}</div>
              <div style={{ fontSize: 12.5, opacity: 0.8, fontFamily: 'monospace', letterSpacing: '0.08em' }}>{member.membershipId}</div>
              <div style={{ fontSize: 11.5, opacity: 0.7, marginTop: 2 }}>Customer #{member.customerNumber}</div>
              <span className="pill" style={{ background: 'var(--grad-gold)', color: '#3a2c08', marginTop: 8, display: 'inline-block' }}>★ {member.tier} Member</span>
            </div>
            <button onClick={() => notify('Edit profile')} style={{ position: 'absolute', top: 16, right: 16, width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,.18)', display: 'grid', placeItems: 'center', color: '#fff' }}><Pencil size={16} /></button>
          </div>
        </div>

        {/* stat strip */}
        <div style={{ display: 'flex', gap: 12, padding: '16px 20px 4px' }}>
          {[
            { k: 'Points', v: member.points.toLocaleString() },
            { k: 'Lifetime', v: member.lifetimePoints.toLocaleString() },
            { k: 'Member since', v: formatJoined(member.joined) },
          ].map((s) => (
            <div key={s.k} style={{ flex: 1, background: '#fff', borderRadius: 16, padding: '14px 8px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontWeight: 800, color: 'var(--blue)', fontSize: 17 }}>{s.v}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{s.k}</div>
            </div>
          ))}
        </div>

        {/* menu rows */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            {rows.map((r, i) => {
              const Icon = r.icon
              return (
                <motion.button whileTap={{ backgroundColor: '#eef3fb' }} key={r.label} onClick={r.go}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '15px 16px', borderTop: i ? '1px solid var(--line)' : 'none', textAlign: 'left' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--silver)', display: 'grid', placeItems: 'center', color: 'var(--blue)' }}><Icon size={19} /></div>
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 14.5 }}>{r.label}</span>
                  <ChevronRight size={18} color="var(--muted)" />
                </motion.button>
              )
            })}
          </div>

          <button onClick={logout}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 16, padding: 15, borderRadius: 16, background: '#fff', color: '#c0392b', fontWeight: 700, boxShadow: 'var(--shadow-sm)' }}>
            <LogOut size={18} /> Log out
          </button>
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, marginTop: 16 }}>Pearl Energy Rewards · v1.0.0</p>
        </div>
      </div>
    </div>
  )
}
