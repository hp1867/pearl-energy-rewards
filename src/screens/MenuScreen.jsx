import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Header } from './OffersScreen'

export default function MenuScreen() {
  const { notify, menu, categories } = useApp()
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('all')

  const known = categories.map((g) => g.key)
  const matchesQ = (m) => !q || m.name.toLowerCase().includes(q.toLowerCase()) || (m.cat || '').toLowerCase().includes(q.toLowerCase())
  const filtered = menu.filter(matchesQ)

  // which category sections to render
  let sections
  if (group === 'all') {
    sections = categories.map((g) => ({ ...g, items: filtered.filter((m) => m.group === g.key) }))
    const other = filtered.filter((m) => !known.includes(m.group))
    if (other.length) sections.push({ key: 'other', label: 'More', emoji: '🛍️', items: other })
  } else {
    const g = categories.find((x) => x.key === group)
    sections = [{ ...(g || { key: group, label: group, emoji: '🍽️' }), items: filtered.filter((m) => m.group === group) }]
  }
  sections = sections.filter((s) => s.items.length)
  const empty = sections.length === 0

  const Card = (m, i) => (
    <motion.div key={m.id} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
      style={{ background: '#fff', borderRadius: 18, padding: 12, boxShadow: 'var(--shadow-sm)', position: 'relative', opacity: m.avail ? 1 : 0.55 }}>
      <div style={{ height: 86, borderRadius: 14, background: 'var(--silver)', display: 'grid', placeItems: 'center', fontSize: 44, position: 'relative' }}>
        {m.img}
        {(m.tags || []).includes('Imported') && <span className="pill" style={{ position: 'absolute', top: 6, left: 6, background: '#6c3483', color: '#fff' }}>Imported</span>}
        {(m.tags || []).includes('New') && <span className="pill" style={{ position: 'absolute', top: 6, right: 6, background: 'var(--blue-light)', color: '#fff' }}>New</span>}
      </div>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 10, lineHeight: 1.25 }}>{m.name}</div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3, minHeight: 28 }}>{m.desc}</div>
      <div style={{ fontWeight: 800, color: 'var(--blue)' }}>{m.price}</div>
      {!m.avail && <div style={{ fontSize: 10.5, color: '#c0392b', fontWeight: 700, marginTop: 4 }}>Sold out</div>}
    </motion.div>
  )

  return (
    <div className="screen">
      <div className="scroll">
        <Header title="Menu" sub="Food, coffee & convenience" />

        {/* search */}
        <div style={{ padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 14, padding: '13px 16px', boxShadow: 'var(--shadow-sm)' }}>
            <Search size={18} color="var(--muted)" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the menu…" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, background: 'transparent' }} />
          </div>
        </div>

        {/* category sub-options */}
        <div className="h-scroll" style={{ marginTop: 14 }}>
          <button className={`chip ${group === 'all' ? 'active' : ''}`} onClick={() => setGroup('all')}>All</button>
          {categories.map((g) => (
            <button key={g.key} className={`chip ${group === g.key ? 'active' : ''}`} onClick={() => setGroup(g.key)}>
              <span style={{ fontSize: 15 }}>{g.emoji}</span> {g.label}
            </button>
          ))}
        </div>

        {/* product sections */}
        {sections.map((s) => (
          <section key={s.key}>
            <div className="section-title"><h3>{s.emoji} {s.label}</h3><span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{s.items.length} item{s.items.length === 1 ? '' : 's'}</span></div>
            <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {s.items.map(Card)}
            </div>
          </section>
        ))}

        {empty && <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 50 }}>No items match “{q}”.</div>}
      </div>
    </div>
  )
}
