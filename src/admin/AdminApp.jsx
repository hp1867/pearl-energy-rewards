import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Package, LayoutGrid, Tag, Award, Fuel, MapPin, Users, Bell, Plus, Pencil, Trash2,
  LogOut, ExternalLink, Search, MoonStar, ShieldCheck, UserPlus,
} from 'lucide-react'
import { data, DATA_MODE } from '../services/data'
import { readiness } from '../config/integrations'
import { menuGroups } from '../data/mockData'
import { NIGHT_DEAL_PERMISSION, newNightDealDefaults, normaliseNightDeal, toDateTimeLocalValue } from '../services/nightDeals'

// Live staff access is checked against Supabase role tables on every request.

const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: true },
  { id: 'nightDeals', label: 'Tonight Only', icon: MoonStar, permission: NIGHT_DEAL_PERMISSION },
  { id: 'products', label: 'Products', icon: Package, adminOnly: true },
  { id: 'categories', label: 'Categories', icon: LayoutGrid, adminOnly: true },
  { id: 'offers', label: 'Offers', icon: Tag, adminOnly: true },
  { id: 'rewards', label: 'Rewards', icon: Award, adminOnly: true },
  { id: 'fuel', label: 'Fuel Prices', icon: Fuel, adminOnly: true },
  { id: 'stations', label: 'Stores', icon: MapPin, adminOnly: true },
  { id: 'customers', label: 'Customers', icon: Users, adminOnly: true },
  { id: 'notifications', label: 'Notifications', icon: Bell, adminOnly: true },
  { id: 'staffAccess', label: 'Staff Access', icon: ShieldCheck, adminOnly: true },
  { id: 'campaigns', label: 'Loyalty Campaigns', icon: Award, adminOnly: true },
]

// CRUD field configs ---------------------------------------------------------
const CONFIGS = {
  nightDeals: {
    name: 'nightDeals', subscribe: data.subscribeNightDealsAdmin, title: 'Tonight Only Deals',
    description: 'Publish once and choose an end time. The offer then disappears automatically from every customer screen.',
    columns: [['img', ''], ['productName', 'Item'], ['stationId', 'Station'], ['dealPriceCents', 'Deal price'], ['quantityAvailable', 'Left'], ['sellUntil', 'Ends'], ['status', 'Status']],
    create: () => newNightDealDefaults(),
    prepare: (row) => normaliseNightDeal(row),
    fields: [
      { key: 'stationId', label: 'Station', type: 'select', optionsFrom: 'stations', required: true, full: true },
      { key: 'productName', label: 'Product name', placeholder: 'Classic Beef Pie', required: true },
      { key: 'img', label: 'Emoji / icon', placeholder: '🥧' },
      { key: 'description', label: 'Short customer message', type: 'textarea', full: true },
      { key: 'originalPriceCents', label: 'Regular price ($)', type: 'currency', step: '0.01', required: true },
      { key: 'dealPriceCents', label: 'Tonight price ($)', type: 'currency', step: '0.01', required: true },
      { key: 'quantityAvailable', label: 'Quantity available', type: 'number', step: '1', required: true },
      { key: 'status', label: 'Status', type: 'select', options: [
        { value: 'active', label: 'Active — visible to customers' },
        { value: 'paused', label: 'Paused — hidden temporarily' },
        { value: 'sold_out', label: 'Sold out — hidden' },
        { value: 'expired', label: 'Expired — hidden' },
      ] },
      { key: 'startsAt', label: 'Show offer from', type: 'datetime-local', required: true },
      { key: 'sellUntil', label: 'Offer ends at', type: 'datetime-local', required: true },
      { key: 'safetyCutoffAt', label: 'Food-safety cutoff (cannot be exceeded)', type: 'datetime-local', required: true, full: true },
    ],
  },
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
      { key: 'endsAt', label: 'Offer end date & time', type: 'datetime-local', required: true }, { key: 'tag', label: 'Badge', placeholder: 'NEW' },
    ],
  },
  rewards: {
    name: 'rewards', subscribe: data.subscribeRewards, title: 'Rewards Catalog',
    columns: [['img', ''], ['title', 'Reward'], ['cat', 'Category'], ['cost', 'Points']],
    fields: [
      { key: 'title', label: 'Reward title' }, { key: 'cat', label: 'Category' },
      { key: 'cost', label: 'Cost (points)', type: 'number', step: '1', required: true }, { key: 'img', label: 'Emoji', placeholder: '⛽' },
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
      { key: 'timezone', label: 'IANA timezone', placeholder: 'Australia/Sydney' },
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

for (const name of ['products','categories','offers','rewards','fuel','stations']) {
  CONFIGS[name].fields.push({ key: 'active', label: 'Published to customers', type: 'bool' })
}
const groupLabel = (k) => { const g = menuGroups.find((x) => x.key === k); return g ? `${g.emoji} ${g.label}` : (k || '—') }

export default function AdminApp() {
  const [access, setAccess] = useState(undefined)
  const [section, setSection] = useState(null)
  const [connectionError, setConnectionError] = useState('')
  useEffect(() => data.onError?.(setConnectionError), [])

  useEffect(() => data.adminOnAuth(setAccess), [])

  const allowedSections = access ? SECTIONS.filter((item) => {
    if (access.admin) return true
    if (item.adminOnly) return false
    return !item.permission || access.permissions?.includes(item.permission)
  }) : []

  useEffect(() => {
    if (!access) return
    if (!allowedSections.some((item) => item.id === section)) setSection(access.admin ? 'dashboard' : allowedSections[0]?.id)
  }, [access, section])

  if (access === undefined) return <div className="login"><div className="box"><h2>Staff Console</h2><p>Checking access…</p></div></div>
  if (!access) return <Login onOk={value => { setAccess(value); setConnectionError('') }} connectionError={connectionError} />

  const current = allowedSections.find((item) => item.id === section)
  const title = section === 'dashboard' ? 'Dashboard'
    : section === 'customers' ? 'Customers'
      : section === 'notifications' ? 'Notifications'
        : section === 'staffAccess' ? 'Staff Access'
          : CONFIGS[section]?.title || current?.label || 'Staff Console'

  const signOutAdmin = async () => {
    await data.adminSignOut()
    setAccess(null)
    setSection(null)
  }

  return (
    <div className="admin">
      <aside className="side">
        <div className="brand">
          <Fuel size={26} />
          <div><b>Pearl Energy</b><span>{access.admin ? 'ADMIN CONSOLE' : 'BRANCH CONSOLE'}</span></div>
        </div>
        {allowedSections.map((s) => {
          const Icon = s.icon
          return (
            <button key={s.id} className={`nav-item ${section === s.id ? 'active' : ''}`} onClick={() => setSection(s.id)}>
              <Icon size={18} /> {s.label}
            </button>
          )
        })}
        <a className="nav-item" href="/index.html" target="_blank" rel="noreferrer"><ExternalLink size={18} /> Open the app</a>
        <button className="nav-item" onClick={signOutAdmin}><LogOut size={18} /> Sign out</button>
        <div className="foot"><b>{access.displayName}</b><br />{access.admin ? 'Main admin · all stations' : 'Branch manager · limited access'}<br /><br />Mode: {DATA_MODE === 'supabase' ? 'Supabase (live)' : 'Local demo'}</div>
      </aside>

      <main className="content">
        <div className="topbar">
          <div>
            <h1>{title}</h1>
            <div className="sub">{access.admin ? 'Changes save to the database and refresh connected apps automatically.' : 'You can manage Tonight Only offers for your assigned station only.'}</div>
          </div>
          <span className={`mode-badge ${DATA_MODE}`}>{DATA_MODE === 'supabase' ? '● Supabase mode' : '● Demo mode (local DB)'}</span>
        </div>

        {connectionError && <div role="alert" className="panel-error">{connectionError} <button onClick={() => window.location.reload()}>Reload</button></div>}
        {section === 'dashboard' && <Dashboard />}
        {CONFIGS[section] && <Crud key={section} cfg={CONFIGS[section]} access={access} />}
        {section === 'customers' && <Customers />}
        {section === 'notifications' && <Notifications />}
        {section === 'staffAccess' && <StaffAccess />}
        {section === 'campaigns' && <Campaigns />}
      </main>
    </div>
  )
}

// --- Login ------------------------------------------------------------------
function Login({ onOk, connectionError }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setErr(''); setBusy(true)
    try { onOk(await data.adminSignIn({ email, password: pw })) }
    catch (error) { setErr(error.message || 'Sign-in failed') }
    finally { setBusy(false) }
  }
  return (
    <div className="login">
      <div className="box">
        <h2>Staff Console</h2>
        <p>Pearl Energy Rewards — permission-controlled access</p>
        {(err || connectionError) && <div role="alert" className="err">{err || connectionError}</div>}
        {DATA_MODE === 'supabase' && <input type="email" placeholder="Staff email" value={email} onChange={(e) => setEmail(e.target.value)} />}
        <input type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <button className="btn" onClick={submit} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {DATA_MODE === 'local'
          ? <div className="hint">Main admin: <b>pearl-admin</b><br />Altona manager: <b>altona-manager</b></div>
          : <div className="hint">Production access uses Supabase Auth and live database permissions assigned by the main admin.</div>}
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
  const nightDeals = useLive(data.subscribeNightDeals)
  const [customers, setCustomers] = useState([])
  const [summary, setSummary] = useState(null)
  useEffect(() => { data.adminListCustomers().then(setCustomers).catch(() => {}); data.adminSummary?.().then(setSummary).catch(() => {}) }, [])
  const totalPoints = summary?.points ?? customers.reduce((s, c) => s + (c.points || 0), 0)
  const publishedNow = row => row.active !== false && (!row.startsAt || new Date(row.startsAt).getTime() <= Date.now()) && (!row.endsAt || new Date(row.endsAt).getTime() > Date.now())

  const stats = [
    { k: 'Customers', v: summary?.customers ?? customers.length, d: 'registered members' },
    { k: 'Points in circulation', v: totalPoints.toLocaleString(), d: 'across all members' },
    { k: 'Products', v: products.filter(publishedNow).length, d: 'published menu items' },
    { k: 'Active offers', v: offers.filter(publishedNow).length, d: 'published promotions' },
    { k: 'Tonight Only', v: nightDeals.filter(row => row.status === 'active' && row.quantityAvailable > 0 && new Date(row.startsAt).getTime() <= Date.now() && new Date(row.sellUntil).getTime() > Date.now() && new Date(row.safetyCutoffAt).getTime() > Date.now()).length, d: 'current selling window' },
  ]
  const checks = readiness()
  const liveCount = checks.filter((c) => c.ready).length

  return (
    <>
      <div className="cards">{stats.map((s) => <div className="stat" key={s.k}><div className="k">{s.k}</div><div className="v">{s.v}</div><div className="d">{s.d}</div></div>)}</div>

      <div className="panel" style={{ marginBottom: 22 }}>
        <div className="phead"><h3>Integration configuration</h3><span className="tag">{liveCount}/{checks.length} configured</span></div>
        <table>
          <tbody>
            {checks.map((c) => (
              <tr key={c.id}>
                <td style={{ width: 40 }}>{c.ready ? '✅' : '⚪'}</td>
                <td>{c.label}</td>
                <td style={{ textAlign: 'right' }}>
                  <span className="tag" style={c.ready ? { background: '#e7f7ee', color: '#1e8e4e' } : { background: '#fff4e5', color: '#b9742f' }}>
                    {c.ready ? 'Configured — verify before launch' : 'Setup required'}
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
              <tr key={c.customerId || c.uid}><td>{c.customerNumber}</td><td>{c.name}</td><td><span className="tag">{c.tier}</span></td><td>{c.points?.toLocaleString()}</td><td>{c.email || '—'}</td></tr>
            ))}
            {!customers.length && <tr><td colSpan="5" style={{ color: '#8a93a6' }}>No customers yet — sign up in the app to create one.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

// --- Generic CRUD -----------------------------------------------------------
function formatAdminDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney', day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit',
  })
}

function Crud({ cfg, access }) {
  const rows = useLive(cfg.subscribe)
  const stations = useLive(data.subscribeStations)
  const liveCategories = useLive(data.subscribeCategories)
  const visibleRows = cfg.name === 'nightDeals' && !access.admin
    ? rows.filter((row) => access.stationIds?.map(String).includes(String(row.stationId)))
    : rows
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  const stationName = (id) => stations.find((station) => String(station.id) === String(id))?.name || id
  const remove = async (id) => {
    if (!confirm('Archive this item? Historical receipts and coupons will be kept.')) return
    setError('')
    try { await data.adminRemove(cfg.name, id) } catch (err) { setError(err.message || 'Delete failed') }
  }

  const cell = (key, row) => {
    if (key === 'img') return <span className="emoji">{row[key]}</span>
    if (key === 'group') { const category = liveCategories.find(item => item.key === row[key]); return category ? `${category.emoji || ''} ${category.label}`.trim() : groupLabel(row[key]) }
    if (key === 'stationId') return stationName(row[key])
    if (key === 'dealPriceCents' || key === 'originalPriceCents') return `$${(Number(row[key] || 0) / 100).toFixed(2)}`
    if (key === 'sellUntil' || key === 'startsAt') return formatAdminDate(row[key])
    if (key === 'status') {
      const derivedStatus = row[key] === 'active' && new Date(row.sellUntil).getTime() <= Date.now() ? 'expired' : row[key]
      const active = derivedStatus === 'active'
      return <span className="tag" style={{ background: active ? '#e7f7ee' : '#eef2f7', color: active ? '#1e8e4e' : '#667085' }}>{String(derivedStatus || 'unknown').replace('_', ' ')}</span>
    }
    if (key === 'avail' || key === 'open') return <span className="tag" style={{ background: row[key] ? '#e7f7ee' : '#fdecea', color: row[key] ? '#1e8e4e' : '#c0392b' }}>{row[key] ? 'Yes' : 'No'}</span>
    if (key === 'trend') return `${row[key] > 0 ? '+' : ''}${row[key]}`
    if (key === 'color' || key === 'accent') return <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 4, background: row[key], verticalAlign: 'middle' }} />
    return String(row[key] ?? '')
  }

  return (
    <div className="panel">
      <div className="phead">
        <div><h3>{visibleRows.length} item{visibleRows.length === 1 ? '' : 's'}</h3>{cfg.description && <p className="panel-description">{cfg.description}</p>}</div>
        <button className="btn" onClick={() => setEditing(cfg.create ? cfg.create() : {})}><Plus size={16} /> Add new</button>
      </div>
      {error && <div className="panel-error">{error}</div>}
      <div className="table-scroll">
        <table>
          <thead><tr>{cfg.columns.map(([key, label]) => <th key={key}>{label}</th>)}<th></th></tr></thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>
                {cfg.columns.map(([key]) => <td key={key}>{cell(key, row)}</td>)}
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn ghost sm" onClick={() => setEditing(row)} aria-label="Edit"><Pencil size={14} /></button>{' '}
                  {(access.admin || cfg.name !== 'nightDeals') && <button className="btn danger sm" onClick={() => remove(row.id)} aria-label="Archive"><Trash2 size={14} /></button>}
                </td>
              </tr>
            ))}
            {!visibleRows.length && <tr><td colSpan={cfg.columns.length + 1} style={{ color: '#8a93a6' }}>Nothing here yet — click “Add new”.</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && <EditModal cfg={cfg} row={editing} access={access} onClose={() => setEditing(null)} />}
    </div>
  )
}

function EditModal({ cfg, row, access, onClose }) {
  const init = {}
  cfg.fields.forEach((field) => {
    const value = row[field.key]
    init[field.key] = field.type === 'csv' ? (value || []).join(', ')
      : field.type === 'currency' ? (Number(value || 0) / 100).toFixed(2)
        : field.type === 'datetime-local' ? toDateTimeLocalValue(value)
          : value ?? (field.type === 'bool' ? true : field.type === 'number' ? 0 : field.type === 'select' && field.options ? field.options[0].value : '')
  })
  const [form, setForm] = useState(init)
  const [draftId] = useState(() => row.id || crypto.randomUUID())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const liveCats = useLive(data.subscribeCategories)
  const liveStations = useLive(data.subscribeStations)
  const allowedStations = access.admin ? liveStations : liveStations.filter((station) => access.stationIds?.map(String).includes(String(station.id)))
  const optionsFor = (field) => field.optionsFrom === 'categories'
    ? liveCats.map((category) => ({ value: category.key, label: `${category.emoji || ''} ${category.label}`.trim() }))
    : field.optionsFrom === 'stations'
      ? allowedStations.map((station) => ({ value: String(station.id), label: `${station.name} — ${station.city}` }))
      : (field.options || [])

  useEffect(() => {
    cfg.fields.forEach((field) => {
      if (field.type === 'select' && field.optionsFrom) {
        const options = optionsFor(field)
        if (options.length && !form[field.key]) setForm((current) => ({ ...current, [field.key]: options[0].value }))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveCats, liveStations])

  const setMidnight = () => {
    const defaults = newNightDealDefaults()
    setForm((current) => ({
      ...current,
      sellUntil: toDateTimeLocalValue(defaults.sellUntil),
      safetyCutoffAt: current.safetyCutoffAt || toDateTimeLocalValue(defaults.safetyCutoffAt),
    }))
  }

  const save = async () => {
    setBusy(true); setError('')
    try {
      let out = { ...row, id: draftId }
      cfg.fields.forEach((field) => {
        let value = form[field.key]
        if (field.type === 'number') value = Number(value)
        if (field.type === 'currency') value = Math.round(Number(value) * 100)
        if (field.type === 'csv') value = String(value).split(',').map((item) => item.trim()).filter(Boolean)
        out[field.key] = value
      })
      if (cfg.idFrom && out[cfg.idFrom]) out.id = String(out[cfg.idFrom]).trim().toLowerCase().replace(/\s+/g, '-')
      if (cfg.prepare) out = { ...out, ...cfg.prepare(out) }
      await data.adminUpsert(cfg.name, out)
      onClose()
    } catch (err) {
      setError(err.message || 'The item could not be saved.')
    } finally { setBusy(false) }
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h3>{row.id ? 'Edit' : 'New'} {cfg.name === 'nightDeals' ? 'Tonight Only deal' : 'item'}</h3>
        {cfg.name === 'nightDeals' && <div className="info-note"><MoonStar size={17} /> Save it once: customers stop seeing it automatically at “Offer ends at”. Use Sold out only if stock finishes early.</div>}
        {error && <div className="err">{error}</div>}
        <div className="row2">
          {cfg.fields.map((field) => (
            <div className="field" key={field.key} style={field.full ? { gridColumn: '1 / 3' } : undefined}>
              <label>{field.label}{field.required ? ' *' : ''}</label>
              {field.type === 'textarea' ? <textarea rows="2" value={form[field.key]} onChange={(event) => set(field.key, event.target.value)} />
                : field.type === 'select' ? <select value={form[field.key]} onChange={(event) => set(field.key, event.target.value)}>{optionsFor(field).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                : field.type === 'bool' ? <select value={form[field.key] ? '1' : '0'} onChange={(event) => set(field.key, event.target.value === '1')}><option value="1">Yes</option><option value="0">No</option></select>
                : field.type === 'color' ? <input type="color" value={form[field.key] || '#0057b8'} onChange={(event) => set(field.key, event.target.value)} style={{ height: 42, padding: 4 }} />
                : <input required={field.required} type={field.type === 'number' || field.type === 'currency' ? 'number' : field.type === 'datetime-local' ? 'datetime-local' : 'text'} step={field.step} placeholder={field.placeholder} value={form[field.key]} onChange={(event) => set(field.key, event.target.value)} />}
              {field.key === 'sellUntil' && <button className="inline-action" type="button" onClick={setMidnight}>Set to tonight at midnight</button>}
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save & publish'}</button>
        </div>
      </div>
    </div>
  )
}

// --- Main-admin staff access ------------------------------------------------
function StaffAccess() {
  const staff = useLive(data.subscribeStaff)
  const stations = useLive(data.subscribeStations)
  const [form, setForm] = useState({ email: '', displayName: '', stationId: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!form.stationId && stations.length) {
      const altona = stations.find((station) => station.name.includes('Altona')) || stations[0]
      setForm((current) => ({ ...current, stationId: String(altona.id) }))
    }
  }, [stations, form.stationId])

  const stationNames = (ids = []) => ids.map((id) => stations.find((station) => String(station.id) === String(id))?.name || id).join(', ')
  const save = async () => {
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await data.adminSetStaffAccess({
        email: form.email, displayName: form.displayName,
        stationIds: [form.stationId], permissions: [NIGHT_DEAL_PERMISSION], enabled: true,
      })
      setMessage(result.inviteLink
        ? `Access granted. Send this one-time password setup link securely to the manager: ${result.inviteLink}`
        : 'Branch-manager access saved. Database permissions take effect immediately.')
      setForm((current) => ({ ...current, email: '', displayName: '' }))
    } catch (err) { setError(err.message || 'Access could not be saved.') }
    finally { setBusy(false) }
  }

  const revoke = async (row) => {
    if (!confirm(`Remove Tonight Only access for ${row.email}?`)) return
    setError(''); setMessage('')
    try {
      await data.adminSetStaffAccess({ email: row.email, displayName: row.displayName, stationIds: [], permissions: [], enabled: false })
      setMessage('Access revoked. Database requests from existing sessions are blocked immediately.')
    } catch (err) { setError(err.message || 'Access could not be revoked.') }
  }

  return (
    <>
      <div className="panel" style={{ marginBottom: 22 }}>
        <div className="phead"><div><h3>Grant limited branch access</h3><p className="panel-description">Managers receive only Tonight Only access for the selected station. They cannot view customers, points, rewards, fuel prices or other branches.</p></div></div>
        <div style={{ padding: 20 }}>
          {error && <div className="err">{error}</div>}
          {message && <div className="success-note">{message}</div>}
          <div className="row2">
            <div className="field"><label>Manager name</label><input value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} placeholder="Altona Night Manager" /></div>
            <div className="field"><label>Confirmed Supabase account email *</label><input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="manager@example.com" /></div>
            <div className="field" style={{ gridColumn: '1 / 3' }}><label>Assigned station *</label><select value={form.stationId} onChange={(event) => setForm((current) => ({ ...current, stationId: event.target.value }))}>{stations.map((station) => <option key={station.id} value={station.id}>{station.name} — {station.city}</option>)}</select></div>
          </div>
          <button className="btn" onClick={save} disabled={busy || !form.email || !form.stationId}><UserPlus size={16} /> {busy ? 'Saving…' : 'Grant Tonight Only access'}</button>
        </div>
      </div>

      <div className="panel">
        <div className="phead"><h3>Branch managers ({staff.length})</h3></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Manager</th><th>Email</th><th>Station access</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {staff.map((row) => <tr key={row.id || row.uid}>
                <td>{row.displayName || 'Branch manager'}</td><td>{row.email}</td><td>{stationNames(row.stationIds)}</td>
                <td><span className="tag" style={{ background: row.active ? '#e7f7ee' : '#eef2f7', color: row.active ? '#1e8e4e' : '#667085' }}>{row.active ? 'Active' : 'Revoked'}</span></td>
                <td style={{ textAlign: 'right' }}>{row.active && <button className="btn danger sm" onClick={() => revoke(row)}>Revoke</button>}</td>
              </tr>)}
              {!staff.length && <tr><td colSpan="5" style={{ color: '#8a93a6' }}>No branch managers have been assigned.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// --- Customers --------------------------------------------------------------
function Customers() {
  const [customers, setCustomers] = useState([])
  const [q, setQ] = useState('')
  const [adjust, setAdjust] = useState(null)
  const [offset, setOffset] = useState(0), [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const refresh = () => { setLoading(true); return data.adminListCustomers({ search: q, offset }).then(setCustomers).catch(e => setError(e.message)).finally(() => setLoading(false)) }
  useEffect(() => { const timer = setTimeout(refresh, 250); return () => clearTimeout(timer) }, [q, offset])

  const list = customers.filter((c) => !q || c.customerNumber?.includes(q) || c.name?.toLowerCase().includes(q.toLowerCase()) || c.email?.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="panel">
      <div className="phead">
        <h3>{loading ? 'Loading customers…' : `${customers.length} customers on this page`}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f4f6fb', borderRadius: 10, padding: '8px 12px' }}>
          <Search size={16} color="#8a93a6" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setOffset(0) }} placeholder="Search number / name / email" style={{ border: 'none', background: 'transparent', outline: 'none', width: 220 }} />
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
      {error && <p className="panel-error">{error}</p>}
      {DATA_MODE === 'supabase' && <div className="modal-actions"><button className="btn ghost" disabled={offset === 0 || loading} onClick={() => setOffset(value => Math.max(0, value - 100))}>Previous</button><button className="btn ghost" disabled={customers.length < 100 || loading} onClick={() => setOffset(value => value + 100)}>Next page</button></div>}
      {adjust && <AdjustModal customer={adjust} onClose={() => { setAdjust(null); refresh() }} />}
    </div>
  )
}

function AdjustModal({ customer, onClose }) {
  const [delta, setDelta] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const apply = async () => {
    if (busy) return
    const d = Number(delta)
    if (!Number.isSafeInteger(d) || !d || Math.abs(d) > 1000000 || note.trim().length < 5) { setError('Enter a nonzero whole-point amount and a reason of at least 5 characters.'); return }
    setBusy(true); setError('')
    try { await data.adminAdjustPoints(DATA_MODE === 'local' ? customer.uid : customer.customerId, d, { store: note.trim() }); onClose() }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Adjust points — {customer.name}</h3>
        <p style={{ color: '#8a93a6', fontSize: 13, marginBottom: 16 }}>Current balance: <b>{customer.points?.toLocaleString()} pts</b> · Customer #{customer.customerNumber}</p>
        <div className="field"><label>Points to add (use a negative number to subtract)</label><input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. 100 or -50" /></div>
        <div className="field"><label>Note / reason</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="In-store purchase" /></div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          {error && <p className="err">{error}</p>}<button className="btn" disabled={busy} onClick={apply}>{busy ? 'Applying…' : 'Apply'}</button>
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
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const send = async () => {
    if (!form.title || busy) return
    setBusy(true); setError('')
    try { await data.adminBroadcast({ ...form, id: requestId }); setForm({ icon: '📣', title: '', body: '' }); setRequestId(crypto.randomUUID()) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <>
      <div className="panel" style={{ marginBottom: 22 }}>
        <div className="phead"><h3>Publish an in-app notification</h3></div>
        <div style={{ padding: 20 }}>
          <div className="row2">
            <div className="field" style={{ gridColumn: '1 / 3' }}><label>Title</label><input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Weekend fuel special starts today" /></div>
            <div className="field" style={{ gridColumn: '1 / 3' }}><label>Message</label><input value={form.body} onChange={(e) => set('body', e.target.value)} placeholder="Members save 6¢/L all weekend" /></div>
            <div className="field"><label>Emoji</label><input value={form.icon} onChange={(e) => set('icon', e.target.value)} /></div>
          </div>
          {error && <p className="err">{error}</p>}<button className="btn" disabled={busy} onClick={send}><Bell size={16} /> {busy ? 'Publishing…' : 'Publish to member inboxes'}</button>
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

function Campaigns() {
  const [rows, setRows] = useState([]), [reviews, setReviews] = useState([])
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const loadReviews = () => data.adminPromotionReviews?.().then(setReviews).catch(e => setError(e.message))
  useEffect(() => { loadReviews(); return data.subscribeCampaigns?.(setRows) }, [])
  const change = async (row) => {
    setBusy(true); setError('')
    try { await data.adminSetCampaign(row.id, !row.active) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const resolve = async (row) => {
    const reason = window.prompt('Document how this refunded promotional benefit was resolved (minimum 5 characters).')
    if (!reason) return
    setBusy(true); setError('')
    try { await data.adminResolvePromotion(row.id, reason); await loadReviews() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <>
    {error && <p role="alert" className="panel-error">{error}</p>}
    <div className="panel" style={{ marginBottom: 22 }}><div className="phead"><h3>Server-controlled campaigns</h3></div>
      <p style={{ padding: 20 }}>Qualifying purchases come from signed POS events. Prize rules are versioned; customers cannot grant themselves spins or prizes.</p>
      <table><thead><tr><th>Campaign</th><th>Version</th><th>Status</th><th></th></tr></thead><tbody>
        {rows.map(row => <tr key={row.id}><td>{row.id === 'fuel_mission' ? 'Fuel Mission' : 'Spin & Win'}</td><td>{row.version}</td><td>{row.active ? 'Active' : 'Paused'}</td><td><button disabled={busy} className="btn ghost sm" onClick={() => change(row)}>{row.active ? 'Pause' : 'Enable'}</button></td></tr>)}
        {!rows.length && <tr><td colSpan="4">Live campaign configuration is available in Supabase mode after the migrations are applied.</td></tr>}
      </tbody></table>
    </div>
    <div className="panel"><div className="phead"><h3>Refunded prize reviews ({reviews.length})</h3><button className="btn ghost sm" onClick={loadReviews}>Refresh</button></div>
      <table><thead><tr><th>Customer ID</th><th>Reason</th><th></th></tr></thead><tbody>
        {reviews.map(row => <tr key={row.id}><td>{row.customer_id}</td><td>{row.reason}</td><td><button disabled={busy} className="btn ghost sm" onClick={() => resolve(row)}>Resolve</button></td></tr>)}
        {!reviews.length && <tr><td colSpan="3">No pending reviews.</td></tr>}
      </tbody></table>
    </div>
  </>
}
