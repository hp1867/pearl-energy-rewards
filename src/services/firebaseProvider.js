// Real provider: Firebase Authentication + Cloud Firestore (live).
import {
  onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, GoogleAuthProvider, OAuthProvider, signInWithPopup,
} from 'firebase/auth'
import {
  doc, setDoc, getDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, runTransaction, addDoc, serverTimestamp,
} from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import { buildNewCustomer, buildQrData, tierForPoints } from './ids'
import { offers as seedOffers, rewards as seedRewards, fuelTypes as seedFuel, menuItems as seedMenu, menuGroups, notifications as seedNotifs, stations as seedStations } from '../data/mockData'

const seedCategories = menuGroups.map((g) => ({ id: g.key, ...g }))

// admin "name" → Firestore collection
const COLL = { offers: 'offers', rewards: 'rewards', fuel: 'fuelPrices', menu: 'menu', categories: 'categories', stations: 'stations', notifs: 'notifications' }
const customerRef = (uid) => doc(db, 'customers', uid)

async function ensureCustomerDoc(user, extra = {}) {
  const ref = customerRef(user.uid)
  const snap = await getDoc(ref)
  if (snap.exists()) return snap.data()
  const c = buildNewCustomer({ uid: user.uid, email: user.email, firstName: extra.firstName || user.displayName?.split(' ')[0], lastName: extra.lastName || user.displayName?.split(' ')[1], mobile: extra.mobile, dob: extra.dob })
  await setDoc(ref, c)
  return c
}

const liveCollection = (name, seed, cb) => onSnapshot(collection(db, name), (s) => cb(s.empty ? seed : s.docs.map((d) => ({ id: d.id, ...d.data() }))))

export function createFirebaseProvider() {
  return {
    mode: 'firebase',

    onAuth(cb) { return onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email } : null)) },

    async signUp(fields) {
      const cred = await createUserWithEmailAndPassword(auth, fields.email, fields.password)
      return ensureCustomerDoc(cred.user, fields)
    },
    async signIn({ email, password }) {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      return ensureCustomerDoc(cred.user)
    },
    async signInWithProvider(name) {
      const provider = name === 'apple' ? new OAuthProvider('apple.com') : new GoogleAuthProvider()
      const cred = await signInWithPopup(auth, provider)
      return ensureCustomerDoc(cred.user)
    },
    async signOutUser() { return signOut(auth) },

    subscribeCustomer(uid, cb) { return onSnapshot(customerRef(uid), (snap) => cb(snap.exists() ? snap.data() : null)) },

    async lookupCustomer(customerNumber) {
      const q = query(collection(db, 'customers'), where('customerNumber', '==', String(customerNumber).trim()))
      const res = await getDocs(q)
      return res.empty ? null : res.docs[0].data()
    },

    async redeemReward(uid, reward) {
      let result = { ok: false, message: 'Customer not found' }
      await runTransaction(db, async (tx) => {
        const ref = customerRef(uid); const snap = await tx.get(ref)
        if (!snap.exists()) return
        const c = snap.data()
        if (c.points < reward.cost) { result = { ok: false, message: `Need ${reward.cost - c.points} more points` }; return }
        const points = c.points - reward.cost
        tx.update(ref, {
          points, qrData: buildQrData(c.membershipId, c.customerNumber, points),
          rewardsRedeemed: [{ id: Date.now(), title: reward.title, cost: reward.cost, at: new Date().toISOString() }, ...(c.rewardsRedeemed || [])],
          updatedAt: Date.now(),
        })
        result = { ok: true, message: `🎉 Redeemed: ${reward.title}` }
      })
      return result
    },

    subscribeOffers(cb) { return liveCollection('offers', seedOffers, cb) },
    subscribeRewards(cb) { return liveCollection('rewards', seedRewards, cb) },
    subscribeFuel(cb) { return liveCollection('fuelPrices', seedFuel, cb) },
    subscribeMenu(cb) { return liveCollection('menu', seedMenu, cb) },
    subscribeCategories(cb) { return liveCollection('categories', seedCategories, cb) },
    subscribeStations(cb) { return liveCollection('stations', seedStations, cb) },
    subscribeNotifications(cb) { return liveCollection('notifications', seedNotifs, cb) },

    // ---------- admin / write API ----------
    async adminUpsert(name, item) {
      const coll = COLL[name] || name
      const id = String(item.id || doc(collection(db, coll)).id)
      const next = { ...item, id, updatedAt: Date.now() }
      await setDoc(doc(db, coll, id), next)
      return next
    },
    async adminRemove(name, id) { await deleteDoc(doc(db, COLL[name] || name, String(id))) },
    async adminListCustomers() { const s = await getDocs(collection(db, 'customers')); return s.docs.map((d) => d.data()) },
    async adminAdjustPoints(uid, delta, meta = {}) {
      await runTransaction(db, async (tx) => {
        const ref = customerRef(uid); const snap = await tx.get(ref); if (!snap.exists()) return
        const c = snap.data()
        const points = c.points + delta, lifetimePoints = c.lifetimePoints + Math.max(0, delta)
        const transactions = [{ id: Date.now(), store: meta.store || 'Admin adjustment', amount: meta.amount || 0, points: delta, date: new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }), type: meta.type || 'Adjustment' }, ...(c.transactions || [])]
        tx.update(ref, { points, lifetimePoints, tier: tierForPoints(lifetimePoints), qrData: buildQrData(c.membershipId, c.customerNumber, points), transactions, updatedAt: Date.now() })
      })
    },
    async adminBroadcast(notif) { await addDoc(collection(db, 'notifications'), { ...notif, time: 'just now', createdAt: serverTimestamp() }) },
  }
}
