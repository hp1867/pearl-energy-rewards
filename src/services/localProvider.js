// Local demo database — mimics the Firebase/Firestore provider using
// localStorage so the app is fully functional before real keys are added.
// Live updates are simulated with an in-memory pub/sub (+ cross-tab storage events).
import { buildNewCustomer, buildQrData, tierForPoints } from './ids'
import { offers as seedOffers, rewards as seedRewards, fuelTypes as seedFuel, menuItems as seedMenu, menuGroups, notifications as seedNotifs, stations as seedStations } from '../data/mockData'

const seedCategories = menuGroups.map((g) => ({ id: g.key, ...g }))

const K = {
  customers: 'pe_customers', session: 'pe_session',
  offers: 'pe_offers', rewards: 'pe_rewards', fuel: 'pe_fuel', menu: 'pe_menu', categories: 'pe_categories', stations: 'pe_stations', notifs: 'pe_notifs', pendingCoupons: 'pe_pendingCoupons',
}
const SEED = { [K.offers]: seedOffers, [K.rewards]: seedRewards, [K.fuel]: seedFuel, [K.menu]: seedMenu, [K.categories]: seedCategories, [K.stations]: seedStations, [K.notifs]: seedNotifs, [K.pendingCoupons]: [] }

const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback } catch { return fallback } }
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v))

// seed catalogs once; bump SEED_VERSION to refresh demo data after changes
const SEED_VERSION = '4'
if (localStorage.getItem('pe_seedver') !== SEED_VERSION) {
  Object.entries(SEED).forEach(([k, v]) => write(k, v))
  localStorage.setItem('pe_seedver', SEED_VERSION)
} else {
  Object.entries(SEED).forEach(([k, v]) => { if (!localStorage.getItem(k)) write(k, v) })
}

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
  { type: 'points', value: 200, label: '200 Bonus Points', img: '⚡', weight: 30 },
  { type: 'points', value: 500, label: '500 Bonus Points', img: '💎', weight: 10 },
  { type: 'coupon', label: 'Free Regular Coffee', img: '☕', color: '#7a4a2b', weight: 15 },
  { type: 'coupon', label: 'Free Car Wash', img: '🚗', color: '#3498db', weight: 5 },
]

function drawMissionPrize() {
  const total = MISSION_PRIZES.reduce((s, p) => s + p.weight, 0)
  let roll = Math.random() * total
  for (const p of MISSION_PRIZES) { roll -= p.weight; if (roll <= 0) return p }
  return MISSION_PRIZES[0]
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

export function createLocalProvider() {
  const base = {
    mode: 'local',

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

    async redeemReward(uid, reward) {
      const customers = getCustomers(); const c = customers[uid]
      if (!c) return { ok: false, message: 'Customer not found' }
      if (c.points < reward.cost) return { ok: false, message: `Need ${reward.cost - c.points} more points` }
      c.points -= reward.cost
      c.rewardsRedeemed = [{ id: Date.now(), title: reward.title, cost: reward.cost, at: new Date().toISOString() }, ...(c.rewardsRedeemed || [])]
      syncDerived(c); saveCustomers(customers)
      return { ok: true, message: `🎉 Redeemed: ${reward.title}`, customer: c }
    },

    // Record a fuel purchase — earns points and advances the 2-week Fuel Mission
    async recordFuelPurchase(uid, purchaseData = {}) {
      const customers = getCustomers(); const c = customers[uid]
      if (!c) return { ok: false, message: 'Customer not found' }

      const today = new Date().toISOString().split('T')[0]
      const fuelType = purchaseData.fuelType || 'ULP 91'
      const amount = purchaseData.amount || 0
      const litres = purchaseData.litres || 0
      const points = Math.floor(amount) // 1 point per dollar

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
        type: `Fuel (${fuelType})`,
        litres,
      }, ...(c.transactions || [])]

      syncDerived(c); saveCustomers(customers)

      return { ok: true, customer: c, pointsEarned: points, missionPrize, missionCount: c.missionCount }
    },

    subscribeOffers(cb) { return subscribeKey(K.offers, cb) },
    subscribeRewards(cb) { return subscribeKey(K.rewards, cb) },
    subscribeFuel(cb) { return subscribeKey(K.fuel, cb) },
    subscribeMenu(cb) { return subscribeKey(K.menu, cb) },
    subscribeCategories(cb) { return subscribeKey(K.categories, cb) },
    subscribeStations(cb) { return subscribeKey(K.stations, cb) },
    subscribeNotifications(cb) { return subscribeKey(K.notifs, cb) },
    subscribePendingCoupons(cb) { return subscribeKey(K.pendingCoupons, cb) },

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
      const key = K[name] || 'pe_' + name
      const rows = read(key, SEED[key] || [])
      const id = item.id || String(Date.now())
      const next = { ...item, id }
      const i = rows.findIndex((r) => String(r.id) === String(id))
      if (i >= 0) rows[i] = next; else rows.push(next)
      saveCollection(key, rows)
      return next
    },
    async adminRemove(name, id) {
      const key = K[name] || 'pe_' + name
      saveCollection(key, read(key, []).filter((r) => String(r.id) !== String(id)))
    },
    async adminListCustomers() { return Object.values(getCustomers()) },
    async adminAdjustPoints(uid, delta, meta = {}) {
      const customers = getCustomers(); const c = customers[uid]; if (!c) return
      c.points += delta; c.lifetimePoints += Math.max(0, delta)
      c.transactions = [{ id: Date.now(), store: meta.store || 'Admin adjustment', amount: meta.amount || 0, points: delta, date: new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }), type: meta.type || 'Adjustment' }, ...(c.transactions || [])]
      syncDerived(c); saveCustomers(customers)
    },
    async adminBroadcast(notif) {
      const rows = read(K.notifs, seedNotifs)
      saveCollection(K.notifs, [{ id: Date.now(), time: 'just now', ...notif }, ...rows])
    },
  }
  return base
}
