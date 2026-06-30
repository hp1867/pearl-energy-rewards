// Local demo database — mimics the Firebase/Firestore provider using
// localStorage so the app is fully functional before real keys are added.
// Live updates are simulated with an in-memory pub/sub (+ cross-tab storage events).
import { buildNewCustomer, buildQrData, tierForPoints } from './ids'
import { offers as seedOffers, rewards as seedRewards, fuelTypes as seedFuel, menuItems as seedMenu, menuGroups, notifications as seedNotifs, stations as seedStations, streakRewards as seedStreakRewards } from '../data/mockData'

const seedCategories = menuGroups.map((g) => ({ id: g.key, ...g }))

const K = {
  customers: 'pe_customers', session: 'pe_session',
  offers: 'pe_offers', rewards: 'pe_rewards', fuel: 'pe_fuel', menu: 'pe_menu', categories: 'pe_categories', stations: 'pe_stations', notifs: 'pe_notifs', streakRewards: 'pe_streakRewards',
}
const SEED = { [K.offers]: seedOffers, [K.rewards]: seedRewards, [K.fuel]: seedFuel, [K.menu]: seedMenu, [K.categories]: seedCategories, [K.stations]: seedStations, [K.notifs]: seedNotifs, [K.streakRewards]: seedStreakRewards }

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

// Streak tracking logic
function updateStreaks(c, fuelDate = new Date().toISOString().split('T')[0]) {
  const today = fuelDate
  const lastDate = c.lastFuelDate
  
  // Update fuel streak (consecutive days)
  if (lastDate) {
    const last = new Date(lastDate)
    const current = new Date(today)
    const diffDays = Math.floor((current - last) / (1000 * 60 * 60 * 24))
    
    if (diffDays === 1) {
      // Consecutive day - increment streak
      c.fuelStreak = (c.fuelStreak || 0) + 1
    } else if (diffDays > 1) {
      // Streak broken - reset to 1
      c.fuelStreak = 1
    }
    // If diffDays === 0 (same day), don't change streak
  } else {
    // First fuel purchase
    c.fuelStreak = 1
  }
  
  c.lastFuelDate = today
  
  // Update weekly fuel count
  const weekStart = getWeekStart(today)
  if (c.weekStartDate !== weekStart) {
    // New week - reset count
    c.weeklyFuelCount = 1
    c.weekStartDate = weekStart
  } else {
    c.weeklyFuelCount = (c.weeklyFuelCount || 0) + 1
  }
  
  return c
}

function getWeekStart(dateStr) {
  const date = new Date(dateStr)
  const day = date.getDay() // 0 = Sunday
  const diff = date.getDate() - day + (day === 0 ? -6 : 1) // Adjust to Monday
  const monday = new Date(date.setDate(diff))
  return monday.toISOString().split('T')[0]
}

function checkStreakRewards(c) {
  const earned = []
  const claimed = c.streakRewardsClaimed || []
  
  // Check fuel streak rewards
  seedStreakRewards.filter(r => r.type === 'fuel_streak').forEach(r => {
    if (c.fuelStreak >= r.trigger && !claimed.includes(r.id)) {
      earned.push(r)
    }
  })
  
  // Check weekly fuel rewards
  seedStreakRewards.filter(r => r.type === 'weekly_fuel').forEach(r => {
    if (c.weeklyFuelCount >= r.trigger && !claimed.includes(r.id)) {
      earned.push(r)
    }
  })
  
  return earned
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

    // Record a fuel purchase and update streaks
    async recordFuelPurchase(uid, purchaseData = {}) {
      const customers = getCustomers(); const c = customers[uid]
      if (!c) return { ok: false, message: 'Customer not found' }
      
      const today = new Date().toISOString().split('T')[0]
      const fuelType = purchaseData.fuelType || 'ULP 91'
      const amount = purchaseData.amount || 0
      const litres = purchaseData.litres || 0
      const points = Math.floor(amount) // 1 point per dollar
      
      // Update streaks
      updateStreaks(c, today)
      
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
      
      // Check for earned streak rewards
      const earned = checkStreakRewards(c)
      
      syncDerived(c); saveCustomers(customers)
      
      return { ok: true, customer: c, pointsEarned: points, streakRewards: earned, fuelStreak: c.fuelStreak, weeklyFuelCount: c.weeklyFuelCount }
    },

    // Claim a streak reward
    async claimStreakReward(uid, rewardId) {
      const customers = getCustomers(); const c = customers[uid]
      if (!c) return { ok: false, message: 'Customer not found' }
      
      const reward = seedStreakRewards.find(r => r.id === rewardId)
      if (!reward) return { ok: false, message: 'Reward not found' }
      
      const earned = checkStreakRewards(c)
      if (!earned.some(r => r.id === rewardId)) {
        return { ok: false, message: 'Reward not yet earned' }
      }
      
      // Award the reward
      if (reward.rewardType === 'points') {
        c.points += reward.value
        c.lifetimePoints += reward.value
        c.transactions = [{
          id: Date.now(),
          store: 'Streak Reward',
          date: new Date().toISOString().split('T')[0],
          amount: 0,
          points: reward.value,
          type: `Streak Bonus: ${reward.title}`,
        }, ...(c.transactions || [])]
      } else if (reward.rewardType === 'free_wash') {
        // Add as a special reward that can be redeemed
        c.rewardsRedeemed = [{ id: Date.now(), title: reward.title, cost: 0, at: new Date().toISOString(), type: 'free_wash' }, ...(c.rewardsRedeemed || [])]
      }
      
      // Mark as claimed
      c.streakRewardsClaimed = [...(c.streakRewardsClaimed || []), rewardId]
      
      syncDerived(c); saveCustomers(customers)
      
      return { ok: true, message: `🎉 Claimed: ${reward.title}`, customer: c }
    },

    // Get available streak rewards
    async getStreakRewards(uid) {
      const customers = getCustomers(); const c = customers[uid]
      if (!c) return { earned: [], available: [] }
      
      const earned = checkStreakRewards(c)
      const claimed = c.streakRewardsClaimed || []
      const available = earned.filter(r => !claimed.includes(r.id))
      
      return {
        earned,
        available,
        fuelStreak: c.fuelStreak || 0,
        weeklyFuelCount: c.weeklyFuelCount || 0,
        streakRewards: seedStreakRewards,
      }
    },

    subscribeOffers(cb) { return subscribeKey(K.offers, cb) },
    subscribeRewards(cb) { return subscribeKey(K.rewards, cb) },
    subscribeFuel(cb) { return subscribeKey(K.fuel, cb) },
    subscribeMenu(cb) { return subscribeKey(K.menu, cb) },
    subscribeCategories(cb) { return subscribeKey(K.categories, cb) },
    subscribeStations(cb) { return subscribeKey(K.stations, cb) },
    subscribeNotifications(cb) { return subscribeKey(K.notifs, cb) },
    subscribeStreakRewards(cb) { return subscribeKey(K.streakRewards, cb) },

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
