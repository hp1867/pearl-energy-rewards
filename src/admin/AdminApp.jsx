import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Package, LayoutGrid, Tag, Award, Fuel, MapPin, Users, Bell, Plus, Pencil, Trash2,
  LogOut, ExternalLink, Search,
} from 'lucide-react'
import { data, DATA_MODE } from '../services/data'
import { readiness } from '../config/integrations'
import { menuGroups } from '../data/mockData'

const ADMIN_PASSWORD = 'pearl-admin' // demo gate — production uses Firebase custom claims (admin:true)

const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'categories', label: 'Categories', icon: LayoutGrid },
  { id: 'offers', label: 'Offers', icon: Tag },
  { id: 'rewards', label: 'Rewards', icon: Award },
  { id: 'fuel', label: 'Fuel Prices', icon: Fuel },
  { id: 'stations', label: 'Stores', icon: MapPin },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'notifications', label: 'Notifications', icon: Bell },
]

// CRUD field configs ---------------------------------------------------------
const CONFIGS = {
  products: {
    name: 'menu', subscribe: data.subscribeMenu, title: 'Products & Menu',
    columns: [['img', ''], ['name', 'Name'], ['group', 'Category'], ['price', 'Price'], ['avail', 'In stock']],
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'group', label: 'Menu category', type: 'select', optionsFrom: 'categories' },
      { key: 'cat', label: 'Sub-label (e.g. Burgers)' },
      { key: 'desc', label: 'Description', type: 'textarea', full: true },
      { key: 'price', label: 'Price', placeholder: '$0.00' }, { key: 'img', label: 'Emoji / icon', placeholder: '🍔' },
      { key: 'avail', label: 'In stock', type: 'bool' }, { key: 'tags', label: 'Tags (comma separated)', type: 'csv', full: true },
    ],
  },
  categories: {
    name: 'categories', subscribe: data.subscribeCategories, title: 'Menu Categories', idFrom: 'key',
    columns: [['emoji', ''], ['label', 'Category'], ['key', 'Slug']],
    fields: [
      { key: 'emoji', label: 'Emoji', placeholder: '🍔' },
      { key: 'label', label: 'Category name', placeholder: 'Hot Food' },
      { key: 'key', label: 'Slug / id (lowercase, no spaces)', placeholder: 'hot' },
    ],
  },
  offers: {
    name: 'offers', subscribe: data.subscribeOffers, title: 'Offers',
    columns: [['img', ''], ['title', 'Title'], ['cat', 'Category'], ['price', 'Price'], ['expiry', 'Expires']],
    fields: [
      { key: 'title', label: 'Title' }, { key: 'sub', label: 'Subtitle', full: true },
      { key: 'cat', label: 'Category' }, { key: 'price', label: 'Price' },
      { key: 'img', label: 'Emoji', placeholder: '☕' }, { key: 'accent', label: 'Accent colour', type: 'color' },
      { key: 'expiry', label: 'Expiry' }, { key: 'tag', label: 'Badge', placeholder: 'NEW' },
    ],
  },
  rewards: {
    name: 'rewards', subscribe: data.subscribeRewards, title: 'Rewards Catalog',
    columns: [['img', ''], ['title', 'Reward'], ['cat', 'Category'], ['cost', 'Points']],
    fields: [
      { key: 'title', label: 'Reward title' }, { key: 'cat', label: 'Category' },
      { key: 'cost', label: 'Cost (points)', type: 'number' }, { key: 'img', label: 'Emoji', placeholder: '⛽' },
      { key: 'color', label: 'Colour', type: 'color' },
    ],
  },
  fuel: {
    name: 'fuel', subscribe: data.subscribeFuel, title: 'Fuel Prices',
    columns: [['code', 'Fuel'], ['price', 'Price ($/L)'], ['trend', 'Trend']],
    fields: [
      { key: 'code', label: 'Fuel type', placeholder: 'ULP 91' },
      { key: 'price', label: 'Price ($/L)', type: 'number', step: '0.001' },
      { key: 'trend', label: 'Daily trend', type: 'number', step: '0.01' },
      { key: 'color', label: 'Colour', type: 'color' },
    ],
  },
  stations: {
    name: 'stations', subscribe: data.subscribeStations, title: 'Stores',
    columns: [['name', 'Store'], ['city', 'Location'], ['ulp91', 'ULP 91'], ['open', 'Open']],
    fields: [
      { key: 'name', label: 'Store name', placeholder: 'Pearl Energy …' },
      { key: 'city', label: 'City / suburb', placeholder: 'Melbourne VIC' },
      { key: 'state', label: 'State', placeholder: 'VIC' },
      { key: 'open', label: 'Open now', type: 'bool' },
      { key: 'hours', label: 'Trading hours', placeholder: '24 Hours' },
      { key: 'lat', label: 'Latitude', type: 'number', step: '0.0001' },
      { key: 'lng', label: 'Longitude', type: 'number', step: '0.0001' },
      { key: 'amenities', label: 'Amenities (comma separated)', type: 'csv', full: true },
      { key: 'ulp91', label: 'ULP 91 (¢/L)', type: 'number', step: '0.1' },
      { key: 'e10', label: 'E10 (¢/L)', type: 'number', step: '0.1' },
      { key: 'p95', label: 'Premium 95 (¢/L)', type: 'number', step: '0.1' },
      { key: 'p98', label: 'Premium 98 (¢/L)', type: 'number', step: '0.1' },
      { key: 'diesel', label: 'Diesel (¢/L)', type: 'number', step: '0.1' },
      { key: 'lpg', label: 'LPG (¢/L)', type: 'number', step: '0.1' },
    ],
  },
}

const groupLabel = (k) => { const g = menuGroups.find((x) => x.key === k); return g ? `${g.emoji} ${g.label}` : (k || '—') }

export default function AdminApp() {
  const [authed, setAuthed] = useState(sessionStorage.getItem('pe_admin') === '1')
  const [section, setSection] = useState('dashboard')

  if (!authed) return <Login onOk={() => { sessionStorage.setItem('pe_admin', '1'); setAuthed(true) }} />

  return (
    <div className="admin">
      <aside className="side">
        <div className="brand">
          <Fuel size={26} />
          <div><b>Pearl Energy</b><span>ADMIN CONSOLE</span></div>
        </div>
        {SECTIONS.map((s) => {
          const Icon = s.icon
          return (
            <button key={s.id} className={`nav-item ${section === s.id ? 'active' : ''}`} onClick={() => setSection(s.id)}>
              <Icon size={18} /> {s.label}
            </button>
          )
        })}
        <a className="nav-item" href="/index.html" target="_blank" rel="noreferrer"><ExternalLink size={18} /> Open the app</a>
        <button className="nav-item" onClick={() => { sessionStorage.removeItem('pe_admin'); setAuthed(false) }}><LogOut size={18} /> Sign out</button>
        <div className="foot">Mode: {DATA_MODE === 'firebase' ? 'Firebase (live)' : 'Local demo'}</div>
      </aside>

      <main className="content">
        <div className="topbar">
          <div>
            <h1>{section === 'dashboard' ? 'Dashboard' : section === 'customers' ? 'Customers' : section === 'notifications' ? 'Notifications' : CONFIGS[section].title}</h1>
            <div className="sub">Changes save to the database and update every app instantly.</div>
          </div>
          <span className={`mode-badge ${DATA_MODE}`}>{DATA_MODE === 'firebase' ? '● Connected to Firebase' : '● Demo mode (local DB)'}</span>
        </div>

        {section === 'dashboard' && <Dashboard />}
        {CONFIGS[section] && <Crud key={section} cfg={CONFIGS[section]} />}
        {section === 'customers' && <Customers />}
        {section === 'notifications' && <Notifications />}
      </main>
    </div>
  )
}

// --- Login ------------------------------------------------------------------
function Login({ onOk }) {
  const [pw, setPw] = useState(''); const [err, setErr] = useState('')
  const submit = () => (pw === ADMIN_PASSWORD ? onOk() : setErr('Incorrect password'))
  return (
    <div className="login">
      <div className="box">
        <h2>Admin Console</h2>
        <p>Pearl Energy Rewards — staff access</p>
        {err && <div className="err">{err}</div>}
        <input type="password" placeholder="Admin password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <button className="btn" onClick={submit}>Sign in</button>
        <div className="hint">Demo password: <b>pearl-admin</b><br />Production uses Firebase Auth with an <b>admin</b> claim.</div>
      </div>
    </div>
  )
}

// --- Dashboard --------------------------------------------------------------
function useLive(subscribe) {
  const [rows, setRows] = useState([])
  useEffect(() => subscribe(setRows), [subscribe])
  return rows
}
function Dashboard() {
  const products = useLive(data.subscribeMenu)
  const offers = useLive(data.subscribeOffers)
  const rewards = useLive(data.subscribeRewards)
  const [customers, setCustomers] = useState([])
  useEffect(() => { data.adminListCustomers().then(setCustomers) }, [])
  const totalPoints = customers.reduce((s, c) => s + (c.points || 0), 0)

  const stats = [
    { k: 'Customers', v: customers.length, d: 'registered members' },
    { k: 'Points in circulation', v: totalPoints.toLocaleString(), d: 'across all members' },
    { k: 'Products', v: products.length, d: 'in the menu' },
    { k: 'Active offers', v: offers.length, d: 'live promotions' },
  ]
  const checks = readiness()
  const liveCount = checks.filter((c) => c.ready).length

  return (
    <>
      <div className="cards">{stats.map((s) => <div className="stat" key={s.k}><div className="k">{s.k}</div><div className="v">{s.v}</div><div className="d">{s.d}</div></div>)}</div>

      <div className="panel" style={{ marginBottom: 22 }}>
        <div className="phead"><h3>Launch readiness</h3><span className="tag">{liveCount}/{checks.length} live</span></div>
        <table>
          <tbody>
            {checks.map((c) => (
              <tr key={c.id}>
                <td style={{ width: 40 }}>{c.ready ? '✅' : '⚪'}</td>
                <td>{c.label}</td>
                <td style={{ textAlign: 'right' }}>
                  <span className="tag" style={c.ready ? { background: '#e7f7ee', color: '#1e8e4e' } : { background: '#fff4e5', color: '#b9742f' }}>
                    {c.ready ? 'Connected' : 'Add keys in .env'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="phead"><h3>Recent members</h3></div>
        <table>
          <thead><tr><th>Customer #</th><th>Name</th><th>Tier</th><th>Points</th><th>Email</th></tr></thead>
          <tbody>
            {customers.slice(0, 8).map((c) => (
              <tr key={c.uid}><td>{c.customerNumber}</td><td>{c.name}</td><td><span className="tag">{c.tier}</span></td><td>{c.points?.toLocaleString()}</td><td>{c.email || '—'}</td></tr>
            ))}
            {!customers.length && <tr><td colSpan="5" style={{ color: '#8a93a6' }}>No customers yet — sign up in the app to create one.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

// --- Generic CRUD -----------------------------------------------------------
function Crud({ cfg }) {
  const rows = useLive(cfg.subscribe)
  const [editing, setEditing] = useState(null) // row object or {} for new

  const remove = async (id) => { if (confirm('Delete this item?')) await data.adminRemove(cfg.name, id) }

  return (
    <div className="panel">
      <div className="phead">
        <h3>{rows.length} item{rows.length === 1 ? '' : 's'}</h3>
        <button className="btn" onClick={() => setEditing({})}><Plus size={16} /> Add new</button>
      </div>
      <table>
        <thead><tr>{cfg.columns.map(([k, l]) => <th key={k}>{l}</th>)}<th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {cfg.columns.map(([k]) => (
                <td key={k}>
                  {k === 'img' ? <span className="emoji">{r[k]}</span>
                    : k === 'group' ? groupLabel(r[k])
                    : (k === 'avail' || k === 'open') ? <span className="tag" style={{ background: r[k] ? '#e7f7ee' : '#fdecea', color: r[k] ? '#1e8e4e' : '#c0392b' }}>{r[k] ? 'Yes' : 'No'}</span>
                    : k === 'trend' ? `${r[k] > 0 ? '+' : ''}${r[k]}`
                    : k === 'color' || k === 'accent' ? <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 4, background: r[k], verticalAlign: 'middle' }} />
                    : String(r[k] ?? '')}
                </td>
              ))}
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="btn ghost sm" onClick={() => setEditing(r)}><Pencil size={14} /></button>{' '}
                <button className="btn danger sm" onClick={() => remove(r.id)}><Trash2 size={14} /></button>
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={cfg.columns.length + 1} style={{ color: '#8a93a6' }}>Nothing here yet — click “Add new”.</td></tr>}
        </tbody>
      </table>
      {editing && <EditModal cfg={cfg} row={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function EditModal({ cfg, row, onClose }) {
  const init = {}
  cfg.fields.forEach((f) => { init[f.key] = f.type === 'csv' ? (row[f.key] || []).join(', ') : row[f.key] ?? (f.type === 'bool' ? true : f.type === 'number' ? 0 : f.type === 'select' && f.options ? f.options[0].value : '') })
  const [form, setForm] = useState(init)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // live category options for dropdowns marked optionsFrom: 'categories'
  const liveCats = useLive(data.subscribeCategories)
  const optionsFor = (f) => f.optionsFrom === 'categories'
    ? liveCats.map((c) => ({ value: c.key, label: `${c.emoji || ''} ${c.label}`.trim() }))
    : (f.options || [])
  useEffect(() => {
    cfg.fields.forEach((f) => {
      if (f.type === 'select' && f.optionsFrom) {
        const opts = optionsFor(f)
        if (opts.length && !form[f.key]) setForm((p) => ({ ...p, [f.key]: opts[0].value }))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveCats])

  const save = async () => {
    const out = { ...row }
    cfg.fields.forEach((f) => {
      let v = form[f.key]
      if (f.type === 'number') v = Number(v)
      if (f.type === 'csv') v = String(v).split(',').map((s) => s.trim()).filter(Boolean)
      out[f.key] = v
    })
    if (cfg.idFrom && out[cfg.idFrom]) out.id = String(out[cfg.idFrom]).trim().toLowerCase().replace(/\s+/g, '-')
    await data.adminUpsert(cfg.name, out)
    onClose()
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{row.id ? 'Edit' : 'New'} item</h3>
        <div className="row2">
          {cfg.fields.map((f) => (
            <div className="field" key={f.key} style={f.full ? { gridColumn: '1 / 3' } : undefined}>
              <label>{f.label}</label>
              {f.type === 'textarea' ? <textarea rows="2" value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} />
                : f.type === 'select' ? <select value={form[f.key]} onChange={(e) => set(f.key, e.target.value)}>{optionsFor(f).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                : f.type === 'bool' ? <select value={form[f.key] ? '1' : '0'} onChange={(e) => set(f.key, e.target.value === '1')}><option value="1">Yes</option><option value="0">No</option></select>
                : f.type === 'color' ? <input type="color" value={form[f.key] || '#0057b8'} onChange={(e) => set(f.key, e.target.value)} style={{ height: 42, padding: 4 }} />
                : <input type={f.type === 'number' ? 'number' : 'text'} step={f.step} placeholder={f.placeholder} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} />}
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}

// --- Customers --------------------------------------------------------------
function Customers() {
  const [customers, setCustomers] = useState([])
  const [q, setQ] = useState('')
  const [adjust, setAdjust] = useState(null)
  const refresh = () => data.adminListCustomers().then(setCustomers)
  useEffect(() => { refresh() }, [])

  const list = customers.filter((c) => !q || c.customerNumber?.includes(q) || c.name?.toLowerCase().includes(q.toLowerCase()) || c.email?.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="panel">
      <div className="phead">
        <h3>{customers.length} customers</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f4f6fb', borderRadius: 10, padding: '8px 12px' }}>
          <Search size={16} color="#8a93a6" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number / name / email" style={{ border: 'none', background: 'transparent', outline: 'none', width: 220 }} />
        </div>
      </div>
      <table>
        <thead><tr><th>Customer #</th><th>Name</th><th>Tier</th><th>Points</th><th>Lifetime</th><th>Email</th><th></th></tr></thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.uid}>
              <td>{c.customerNumber}</td><td>{c.name}</td><td><span className="tag">{c.tier}</span></td>
              <td>{c.points?.toLocaleString()}</td><td>{c.lifetimePoints?.toLocaleString()}</td><td>{c.email || '—'}</td>
              <td style={{ textAlign: 'right' }}><button className="btn ghost sm" onClick={() => setAdjust(c)}>Adjust points</button></td>
            </tr>
          ))}
          {!list.length && <tr><td colSpan="7" style={{ color: '#8a93a6' }}>No customers found.</td></tr>}
        </tbody>
      </table>
      {adjust && <AdjustModal customer={adjust} onClose={() => { setAdjust(null); refresh() }} />}
    </div>
  )
}

function AdjustModal({ customer, onClose }) {
  const [delta, setDelta] = useState('')
  const [note, setNote] = useState('')
  const apply = async () => { const d = Number(delta); if (!d) return onClose(); await data.adminAdjustPoints(customer.uid, d, { store: note || 'Admin adjustment' }); onClose() }
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Adjust points — {customer.name}</h3>
        <p style={{ color: '#8a93a6', fontSize: 13, marginBottom: 16 }}>Current balance: <b>{customer.points?.toLocaleString()} pts</b> · Customer #{customer.customerNumber}</p>
        <div className="field"><label>Points to add (use a negative number to subtract)</label><input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. 100 or -50" /></div>
        <div className="field"><label>Note / reason</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="In-store purchase" /></div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={apply}>Apply</button>
        </div>
      </div>
    </div>
  )
}

// --- Notifications ----------------------------------------------------------
function Notifications() {
  const sent = useLive(data.subscribeNotifications)
  const [form, setForm] = useState({ icon: '📣', title: '', body: '' })
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const send = async () => { if (!form.title) return; await data.adminBroadcast(form); setForm({ icon: '📣', title: '', body: '' }) }
  return (
    <>
      <div className="panel" style={{ marginBottom: 22 }}>
        <div className="phead"><h3>Send a notification</h3></div>
        <div style={{ padding: 20 }}>
          <div className="row2">
            <div className="field" style={{ gridColumn: '1 / 3' }}><label>Title</label><input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Weekend fuel special starts today" /></div>
            <div className="field" style={{ gridColumn: '1 / 3' }}><label>Message</label><input value={form.body} onChange={(e) => set('body', e.target.value)} placeholder="Members save 6¢/L all weekend" /></div>
            <div className="field"><label>Emoji</label><input value={form.icon} onChange={(e) => set('icon', e.target.value)} /></div>
          </div>
          <button className="btn" onClick={send}><Bell size={16} /> Broadcast to all members</button>
        </div>
      </div>
      <div className="panel">
        <div className="phead"><h3>Sent ({sent.length})</h3></div>
        <table>
          <thead><tr><th></th><th>Title</th><th>Message</th><th>When</th></tr></thead>
          <tbody>
            {sent.map((n) => <tr key={n.id}><td className="emoji">{n.icon}</td><td>{n.title}</td><td>{n.body}</td><td>{n.time}</td></tr>)}
          </tbody>
        </table>
      </div>
    </>
  )
}
