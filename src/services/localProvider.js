// Local demo database — mimics the Firebase/Firestore provider using
// localStorage so the app is fully functional before real keys are added.
// Live updates are simulated with an in-memory pub/sub (+ cross-tab storage events).
import { buildNewCustomer, buildQrData, tierForPoints } from './ids'
import { offers as seedOffers, rewards as seedRewards, fuelTypes as seedFuel, menuItems as seedMenu, menuGroups, notifications as seedNotifs, stations as seedStations } from '../data/mockData'
import { asDate, buildDemoNightDeals, NIGHT_DEAL_PERMISSION, normaliseNightDeal } from './nightDeals'

const seedCategories = menuGroups.map((g) => ({ id: g.key, ...g }))

const K = {
  customers: 'pe_customers', session: 'pe_session',
  offers: 'pe_offers', rewards: 'pe_rewards', fuel: 'pe_fuel', menu: 'pe_menu', categories: 'pe_categories', stations: 'pe_stations', notifs: 'pe_notifs', pendingCoupons: 'pe_pendingCoupons',
  nightDeals: 'pe_nightDeals', staff: 'pe_staff',
}
const seedStaff = [{
  id: 'demo-altona-manager', uid: 'demo-altona-manager',
  email: 'altona.manager@pearlenergy.com.au', displayName: 'Altona Night Manager',
  role: 'branch_manager', permissions: [NIGHT_DEAL_PERMISSION], stationIds: ['s17'], active: true,
}]
const SEED = {
  [K.offers]: seedOffers, [K.rewards]: seedRewards, [K.fuel]: seedFuel,
  [K.menu]: seedMenu, [K.categories]: seedCategories, [K.stations]: seedStations,
  [K.notifs]: seedNotifs, [K.pendingCoupons]: [],
  [K.nightDeals]: buildDemoNightDeals(), [K.staff]: seedStaff,
}

const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback } catch { return fallback } }
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v))
const ADMIN_SESSION_KEY = 'pe_admin_access'
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'pearl-admin'
const ALTONA_MANAGER_PASSWORD = import.meta.env.VITE_ALTONA_MANAGER_PASSWORD || 'altona-manager'

const mainAdminAccess = {
  uid: 'demo-main-admin', email: 'admin@pearlenergy.com.au', displayName: 'Main Admin',
  role: 'admin', admin: true, permissions: ['*'], stationIds: ['*'],
}
const altonaManagerAccess = {
  uid: 'demo-altona-manager', email: 'altona.manager@pearlenergy.com.au',
  displayName: 'Altona Night Manager', role: 'branch_manager', branchManager: true,
  permissions: [NIGHT_DEAL_PERMISSION], stationIds: ['s17'],
}

const getAdminAccess = () => {
  try { return JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY)) || null } catch { return null }
}

function canManageNightDeal(access, stationId) {
  return access?.admin === true || (
    access?.permissions?.includes(NIGHT_DEAL_PERMISSION)
    && access?.stationIds?.map(String).includes(String(stationId))
  )
}

function requireAdminWrite(name, item = {}) {
  const access = getAdminAccess()
  if (access?.admin === true) return access
  if (name === 'nightDeals' && canManageNightDeal(access, item.stationId)) return access
  throw new Error('You do not have permission to make this change.')
}

// seed catalogs once; bump SEED_VERSION to refresh demo data after changes
const SEED_VERSION = '6' // added Tonight Only deals, Altona station and branch access
if (localStorage.getItem('pe_seedver') !== SEED_VERSION) {
  Object.entries(SEED).forEach(([k, v]) => write(k, v))
  localStorage.setItem('pe_seedver', SEED_VERSION)
} else {
  Object.entries(SEED).forEach(([k, v]) => { if (!localStorage.getItem(k)) write(k, v) })
}

// Roll only the built-in preview rows to the new Sydney business day. Manager-
// created rows remain untouched, including their audit history and status.
const freshDemoDeals = SEED[K.nightDeals]
const freshById = new Map(freshDemoDeals.map((deal) => [String(deal.id), deal]))
const storedNightDeals = read(K.nightDeals, freshDemoDeals)
let refreshedDemoDeals = false
const rolledNightDeals = storedNightDeals.map((deal) => {
  const fresh = freshById.get(String(deal.id))
  if (!fresh || deal.businessDate === fresh.businessDate) return deal
  refreshedDemoDeals = true
  return fresh
})
if (refreshedDemoDeals) write(K.nightDeals, rolledNightDeals)

const bus = new EventTarget()
const emit = (type) => bus.dispatchEvent(new Event(type))
window.addEventListener('storage', (e) => {
  if (e.key === K.customers) emit('customer')
  else if (e.key === K.session) emit('auth')
  else if (e.key) emit('catalog:' + e.key)
})

const getCustomers = () => read(K.customers, {})
const saveCustomers = (m) => { write(K.customers, m); emit('customer') }

function syncDerived(c) {
  c.name = `${c.firstName} ${c.lastName}`
  c.tier = tierForPoints(c.lifetimePoints)
  c.qrData = buildQrData(c.membershipId, c.customerNumber, c.points)
  c.updatedAt = Date.now()
  return c
}

// 2-week Fuel Mission: fill up MISSION_TARGET times within MISSION_WINDOW_DAYS
// of the first fill-up → a MYSTERY prize, drawn at random on completion.
export const MISSION_TARGET = 4
const MISSION_WINDOW_DAYS = 14

// The prize pool shown in the "how it works" popup. Weights set rarity —
// which prize the customer actually gets stays secret until they finish.
export const MISSION_PRIZES = [
  { type: 'points', value: 100, label: '100 Bonus Points', img: '⭐', weight: 40 },
  { type: 'points', value: 200, label: '200 Bonus Points', img: '⚡', weight: 25 },
  { type: 'points', value: 500, label: '500 Bonus Points', img: '💎', weight: 10 },
  { type: 'coupon', label: 'Free Regular Coffee', img: '☕', color: '#7a4a2b', weight: 20 },
  { type: 'coupon', label: 'Free Snack', img: '🍫', color: '#8e44ad', weight: 5 },
]

function drawMissionPrize() {
  const total = MISSION_PRIZES.reduce((s, p) => s + p.weight, 0)
  let roll = Math.random() * total
  for (const p of MISSION_PRIZES) { roll -= p.weight; if (roll <= 0) return p }
  return MISSION_PRIZES[0]
}

// Spin the Wheel: a spin is earned by buying from a qualifying category
// (lollies / snacks / biscuits / bakery) or any shop of $50+. Prizes are
// weighted; coupon prizes drop into My Coupons with the standard 7-day expiry.
export const WHEEL_PRIZES = [
  { id: 'disc5', label: '5% Off', img: '🏷️', color: '#0057b8', weight: 25, type: 'coupon', title: '5% Off Next Purchase' },
  { id: 'drink', label: 'Free Drink', img: '🥤', color: '#16a085', weight: 20, type: 'coupon', title: 'Free Drink (600ml)' },
  { id: 'double', label: 'Double Points', img: '⚡', color: '#f39c12', weight: 20, type: 'double' },
  { id: 'gift', label: 'Mystery Gift', img: '🎁', color: '#8e44ad', weight: 10, type: 'coupon', title: 'Mystery Gift — reveal in store' },
  { id: 'entries', label: '5 Draw Entries', img: '🎟️', color: '#c0392b', weight: 25, type: 'entries', value: 5 },
]
export const WHEEL_QUALIFYING_CATS = ['lollies', 'snacks', 'biscuits', 'bakery']
export const WHEEL_MIN_SPEND = 50

function drawWheelPrize() {
  const total = WHEEL_PRIZES.reduce((s, p) => s + p.weight, 0)
  let roll = Math.random() * total
  for (const p of WHEEL_PRIZES) { roll -= p.weight; if (roll <= 0) return p }
  return WHEEL_PRIZES[0]
}

function addCoupon(uid, { title, img, color }) {
  const now = new Date()
  const coupons = read(K.pendingCoupons, [])
  coupons.push({
    id: Date.now() + Math.floor(Math.random() * 1000), uid, rewardId: 'wheel_prize', title,
    cat: 'Wheel Prize', cost: 0, img, color: color || '#0057b8',
    status: 'active', redeemedAt: now.toISOString(), activatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), createdAt: Date.now(),
  })
  saveCollection(K.pendingCoupons, coupons)
}

function updateMission(c, todayStr) {
  const start = c.missionStart ? new Date(c.missionStart) : null
  const expired = !start || (new Date(todayStr) - start) / 86400000 >= MISSION_WINDOW_DAYS
  if (expired) { c.missionStart = todayStr; c.missionCount = 0; c.missionRewarded = false; c.missionPrize = null }
  c.missionCount = (c.missionCount || 0) + 1
  if (c.missionCount >= MISSION_TARGET && !c.missionRewarded) {
    c.missionRewarded = true
    const prize = drawMissionPrize()
    c.missionPrize = { type: prize.type, value: prize.value || 0, label: prize.label, img: prize.img, at: todayStr }
    if (prize.type === 'points') {
      c.points += prize.value
      c.lifetimePoints += prize.value
      c.transactions = [{
        id: Date.now() + 1, store: 'Fuel Mission', date: todayStr, amount: 0,
        points: prize.value, type: `Mission prize: ${prize.label}`,
      }, ...(c.transactions || [])]
    } else {
      // Item prize → drop a ready-to-use coupon into My Coupons (7-day validity)
      const now = new Date()
      const coupons = read(K.pendingCoupons, [])
      coupons.push({
        id: Date.now() + 1, uid: c.uid, rewardId: 'mission_prize', title: prize.label,
        cat: 'Mission Prize', cost: 0, img: prize.img, color: prize.color || '#f7931e',
        status: 'active', redeemedAt: now.toISOString(), activatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), createdAt: Date.now(),
      })
      saveCollection(K.pendingCoupons, coupons)
    }
    return prize
  }
  return null
}

// generic live collection subscribe (same-tab + cross-tab)
function subscribeKey(key, cb) {
  const fire = () => cb(read(key, SEED[key] || []))
  bus.addEventListener('catalog:' + key, fire); fire()
  return () => bus.removeEventListener('catalog:' + key, fire)
}
function saveCollection(key, rows) { write(key, rows); emit('catalog:' + key) }

function subscribeNightDeals(cb, adminView = false) {
  const access = getAdminAccess()
  const fire = () => {
    let rows = read(K.nightDeals, SEED[K.nightDeals] || [])
    if (!adminView) {
      const now = Date.now()
      rows = rows.filter((deal) => deal.status === 'active'
        && Number(deal.quantityAvailable) > 0
        && asDate(deal.sellUntil)?.getTime() > now
        && asDate(deal.safetyCutoffAt)?.getTime() > now)
    }
    else if (!access?.admin) rows = rows.filter((deal) => canManageNightDeal(access, deal.stationId))
    cb(rows)
  }
  bus.addEventListener('catalog:' + K.nightDeals, fire)
  const timer = window.setInterval(fire, 30000)
  fire()
  return () => {
    bus.removeEventListener('catalog:' + K.nightDeals, fire)
    window.clearInterval(timer)
  }
}

export function createLocalProvider() {
  const base = {
    mode: 'local',

    adminOnAuth(cb) {
      cb(getAdminAccess())
      return () => {}
    },

    async adminSignIn({ password }) {
      const access = password === ADMIN_PASSWORD
        ? mainAdminAccess
        : password === ALTONA_MANAGER_PASSWORD ? altonaManagerAccess : null
      if (!access) throw new Error('Incorrect email or password.')
      sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(access))
      return access
    },

    async adminSignOut() {
      sessionStorage.removeItem(ADMIN_SESSION_KEY)
    },

    onAuth(cb) {
      const fire = () => { const uid = read(K.session, null); cb(uid ? { uid } : null) }
      bus.addEventListener('auth', fire); fire()
      return () => bus.removeEventListener('auth', fire)
    },

    async signUp(fields) {
      const customers = getCustomers()
      if (fields.email && Object.values(customers).some((c) => c.email === fields.email))
        throw new Error('An account with this email already exists')
      const c = syncDerived(buildNewCustomer(fields))
      customers[c.uid] = c; saveCustomers(customers)
      write(K.session, c.uid); emit('auth')
      return c
    },

    async signIn({ email }) {
      const customers = getCustomers()
      let c = Object.values(customers).find((x) => x.email === email)
      if (!c) { c = syncDerived(buildNewCustomer({ firstName: 'Demo', lastName: 'Member', email })); customers[c.uid] = c; saveCustomers(customers) }
      write(K.session, c.uid); emit('auth')
      return c
    },

    async signInWithProvider(name) { return this.signIn({ email: `${name.toLowerCase()}-demo@pearlenergy.com.au` }) },
    async signOutUser() { localStorage.removeItem(K.session); emit('auth') },

    subscribeCustomer(uid, cb) {
      const fire = () => cb(getCustomers()[uid] || null)
      bus.addEventListener('customer', fire); fire()
      return () => bus.removeEventListener('customer', fire)
    },

    async lookupCustomer(customerNumber) {
      return Object.values(getCustomers()).find((c) => c.customerNumber === String(customerNumber).trim()) || null
    },

    // Update editable profile fields (identity/points fields are not touchable here)
    async updateProfile(uid, fields) {
      const customers = getCustomers(); const c = customers[uid]
      if (!c) return null
      for (const k of ['firstName', 'lastName', 'mobile', 'dob', 'security']) {
        if (fields[k] !== undefined) c[k] = fields[k]
      }
      syncDerived(c); saveCustomers(customers)
      return c
    },

    async redeemReward(uid, reward) {
      const customers = getCustomers(); const c = customers[uid]
      if (!c) return { ok: false, message: 'Customer not found' }
      if (c.points < reward.cost) return { ok: false, message: `Need ${reward.cost - c.points} more points` }
      const now = new Date()
      const coupon = {
        id: Date.now(), uid, rewardId: reward.id, title: reward.title,
        cat: reward.cat, cost: reward.cost, img: reward.img, color: reward.color,
        status: 'active', redeemedAt: now.toISOString(), activatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: Date.now(),
      }
      c.points -= reward.cost
      c.rewardsRedeemed = [{ id: Date.now(), title: reward.title, cost: reward.cost, at: new Date().toISOString() }, ...(c.rewardsRedeemed || [])]
      syncDerived(c); saveCustomers(customers)
      saveCollection(K.pendingCoupons, [coupon, ...read(K.pendingCoupons, [])])
      return { ok: true, message: `🎉 Redeemed: ${reward.title}`, customer: c, coupon }
    },

    // Record a fuel purchase — earns points and advances the 2-week Fuel Mission
    async recordFuelPurchase(uid, purchaseData = {}) {
      const customers = getCustomers(); const c = customers[uid]
      if (!c) return { ok: false, message: 'Customer not found' }

      const today = new Date().toISOString().split('T')[0]
      const fuelType = purchaseData.fuelType || 'ULP 91'
      const amount = purchaseData.amount || 0
      const litres = purchaseData.litres || 0
      let points = Math.floor(amount) // 1 point per dollar
      let doubled = false
      if (c.doublePointsNext && points > 0) { points *= 2; c.doublePointsNext = false; doubled = true } // wheel prize

      // Advance the 2-week fuel mission (may draw and award a mystery prize)
      const missionPrize = updateMission(c, today)

      // Add points
      c.points += points
      c.lifetimePoints += points

      // Add transaction
      c.transactions = [{
        id: Date.now(),
        store: purchaseData.store || 'Pearl Energy Station',
        date: today,
        amount,
        points,
        type: `Fuel (${fuelType})${doubled ? ' · 2x points' : ''}`,
        litres,
      }, ...(c.transactions || [])]

      syncDerived(c); saveCustomers(customers)

      return { ok: true, customer: c, pointsEarned: points, missionPrize, missionCount: c.missionCount }
    },

    // Record a shop (non-fuel) purchase — earns points and may earn a wheel
    // spin: qualifying category (lollies/snacks/biscuits/bakery) or $50+ spend.
    async recordShopPurchase(uid, { amount = 0, categories = [], store } = {}) {
      const customers = getCustomers(); const c = customers[uid]
      if (!c) return { ok: false, message: 'Customer not found' }

      const today = new Date().toISOString().split('T')[0]
      let points = Math.floor(amount)
      let doubled = false
      if (c.doublePointsNext && points > 0) { points *= 2; c.doublePointsNext = false; doubled = true }

      const qualifies = amount >= WHEEL_MIN_SPEND ||
        categories.some((cat) => WHEEL_QUALIFYING_CATS.includes(String(cat).toLowerCase()))
      if (qualifies) c.wheelSpins = (c.wheelSpins || 0) + 1

      c.points += points
      c.lifetimePoints += points
      c.transactions = [{
        id: Date.now(), store: store || 'Pearl Energy Shop', date: today, amount, points,
        type: `Shop${doubled ? ' · 2x points' : ''}${qualifies ? ' · 🎡 spin earned' : ''}`,
      }, ...(c.transactions || [])]

      syncDerived(c); saveCustomers(customers)
      return { ok: true, customer: c, pointsEarned: points, spinEarned: qualifies, wheelSpins: c.wheelSpins || 0 }
    },

    // Spend one wheel spin → draw and apply a prize.
    async spinWheel(uid) {
      const customers = getCustomers(); const c = customers[uid]
      if (!c) return { ok: false, message: 'Customer not found' }
      if (!c.wheelSpins) return { ok: false, message: 'No spins available yet' }

      c.wheelSpins -= 1
      const prize = drawWheelPrize()
      if (prize.type === 'coupon') {
        addCoupon(uid, { title: prize.title, img: prize.img, color: prize.color })
      } else if (prize.type === 'double') {
        c.doublePointsNext = true
      } else if (prize.type === 'entries') {
        c.monthlyDrawEntries = (c.monthlyDrawEntries || 0) + prize.value
      }
      syncDerived(c); saveCustomers(customers)
      return { ok: true, prize, wheelSpins: c.wheelSpins }
    },

    subscribeOffers(cb) { return subscribeKey(K.offers, cb) },
    subscribeRewards(cb) { return subscribeKey(K.rewards, cb) },
    subscribeFuel(cb) { return subscribeKey(K.fuel, cb) },
    subscribeMenu(cb) { return subscribeKey(K.menu, cb) },
    subscribeCategories(cb) { return subscribeKey(K.categories, cb) },
    subscribeStations(cb) { return subscribeKey(K.stations, cb) },
    subscribeNotifications(cb) { return subscribeKey(K.notifs, cb) },
    subscribeNightDeals(cb) { return subscribeNightDeals(cb, false) },
    subscribeNightDealsAdmin(cb) { return subscribeNightDeals(cb, true) },
    subscribeStaff(cb) {
      const access = getAdminAccess()
      if (!access?.admin) { cb([]); return () => {} }
      return subscribeKey(K.staff, cb)
    },
    subscribePendingCoupons(uid, cb) {
      return subscribeKey(K.pendingCoupons, (rows) => {
        cb(rows.filter((coupon) => coupon.uid === uid))
      })
    },

    // ---------- pending coupons ----------
    async addPendingCoupon(uid, coupon) {
      const coupons = read(K.pendingCoupons, [])
      const newCoupon = { ...coupon, uid, createdAt: Date.now() }
      saveCollection(K.pendingCoupons, [...coupons, newCoupon])
      return newCoupon
    },
    async activatePendingCoupon(uid, couponId) {
      const coupons = read(K.pendingCoupons, [])
      const updated = coupons.map(c => 
        c.id === couponId && c.uid === uid ? { ...c, status: 'active', activatedAt: new Date().toISOString() } : c
      )
      saveCollection(K.pendingCoupons, updated)
      return { ok: true }
    },
    async usePendingCoupon(uid, couponId) {
      const coupons = read(K.pendingCoupons, [])
      const updated = coupons.map(c => 
        c.id === couponId && c.uid === uid ? { ...c, status: 'redeemed', usedAt: new Date().toISOString() } : c
      )
      saveCollection(K.pendingCoupons, updated)
      return { ok: true }
    },
    async removePendingCoupon(uid, couponId) {
      const coupons = read(K.pendingCoupons, [])
      saveCollection(K.pendingCoupons, coupons.filter(c => !(c.id === couponId && c.uid === uid)))
      return { ok: true }
    },
    async getPendingCoupons(uid) {
      const coupons = read(K.pendingCoupons, [])
      return coupons.filter(c => c.uid === uid)
    },

    // ---------- admin / write API ----------
    async adminUpsert(name, item) {
      const access = requireAdminWrite(name, item)
      const key = K[name] || 'pe_' + name
      const rows = read(key, SEED[key] || [])
      const id = item.id || String(Date.now())
      const i = rows.findIndex((r) => String(r.id) === String(id))
      let next = { ...item, id }
      if (name === 'nightDeals') {
        const previous = i >= 0 ? rows[i] : null
        if (previous && !access.admin && String(previous.stationId) !== String(item.stationId)) {
          throw new Error('A branch manager cannot move a deal to another station.')
        }
        next = normaliseNightDeal({
          ...next,
          createdAt: previous?.createdAt || new Date().toISOString(),
          createdBy: previous?.createdBy || access.uid,
          updatedAt: new Date().toISOString(), updatedBy: access.uid,
        })
      }
      if (i >= 0) rows[i] = next; else rows.push(next)
      saveCollection(key, rows)
      return next
    },
    async adminRemove(name, id) {
      const access = getAdminAccess()
      if (!access?.admin) throw new Error('Only the main admin can delete records. Mark the deal sold out or paused instead.')
      const key = K[name] || 'pe_' + name
      saveCollection(key, read(key, []).filter((r) => String(r.id) !== String(id)))
    },
    async adminListCustomers() {
      requireAdminWrite('customers')
      return Object.values(getCustomers())
    },
    async adminSetStaffAccess({ email, displayName = '', stationIds = [], enabled = true }) {
      requireAdminWrite('staff')
      const cleanEmail = String(email || '').trim().toLowerCase()
      if (!cleanEmail || !cleanEmail.includes('@')) throw new Error('Enter a valid staff email address.')
      if (enabled && !stationIds.length) throw new Error('Assign at least one station.')
      const rows = read(K.staff, [])
      const existingIndex = rows.findIndex((staff) => staff.email === cleanEmail)
      const previous = existingIndex >= 0 ? rows[existingIndex] : null
      const next = {
        id: previous?.id || `demo-${Date.now()}`, uid: previous?.uid || `demo-${Date.now()}`,
        email: cleanEmail, displayName: String(displayName || previous?.displayName || cleanEmail),
        role: 'branch_manager', permissions: enabled ? [NIGHT_DEAL_PERMISSION] : [],
        stationIds: enabled ? stationIds.map(String) : [], active: Boolean(enabled),
        updatedAt: new Date().toISOString(),
      }
      if (existingIndex >= 0) rows[existingIndex] = next; else rows.push(next)
      saveCollection(K.staff, rows)
      return { ...next, demoPassword: cleanEmail === altonaManagerAccess.email ? ALTONA_MANAGER_PASSWORD : null }
    },
    async adminAdjustPoints(uid, delta, meta = {}) {
      requireAdminWrite('customers')
      const customers = getCustomers(); const c = customers[uid]; if (!c) return
      c.points += delta; c.lifetimePoints += Math.max(0, delta)
      c.transactions = [{ id: Date.now(), store: meta.store || 'Admin adjustment', amount: meta.amount || 0, points: delta, date: new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }), type: meta.type || 'Adjustment' }, ...(c.transactions || [])]
      syncDerived(c); saveCustomers(customers)
    },
    async adminBroadcast(notif) {
      requireAdminWrite('notifications')
      const rows = read(K.notifs, seedNotifs)
      saveCollection(K.notifs, [{ id: Date.now(), time: 'just now', ...notif }, ...rows])
    },
  }
  return base
}
