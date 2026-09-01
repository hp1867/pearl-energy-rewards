// Production provider: Firebase Authentication, Cloud Firestore read models,
// and server-authoritative callable functions for every loyalty mutation.
import {
  onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, GoogleAuthProvider, OAuthProvider, signInWithPopup,
} from 'firebase/auth'
import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy,
  query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from '../firebase/config'
import {
  offers as seedOffers, rewards as seedRewards, fuelTypes as seedFuel,
  menuItems as seedMenu, menuGroups, notifications as seedNotifs,
  stations as seedStations,
} from '../data/mockData'

const seedCategories = menuGroups.map((group) => ({ id: group.key, ...group }))
const COLL = {
  offers: 'offers', rewards: 'rewards', fuel: 'fuelPrices', menu: 'menu',
  categories: 'categories', stations: 'stations', notifs: 'notifications',
}
const customerRef = (uid) => doc(db, 'customers', uid)

function call(name, payload = {}) {
  if (!functions) throw new Error('Firebase Functions is not configured')
  return httpsCallable(functions, name)(payload).then((result) => result.data)
}
function dateValue(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function isoValue(value) {
  const date = dateValue(value)
  return date ? date.toISOString() : value
}

function activityRow(id, data) {
  return {
    id,
    ...data,
    date: data.date || dateValue(data.occurredAt)?.toLocaleDateString('en-AU', {
      day: '2-digit', month: 'short', year: 'numeric',
    }),
  }
}

function couponRow(id, data) {
  return {
    id,
    ...data,
    redeemedAt: isoValue(data.redeemedAt),
    activatedAt: isoValue(data.activatedAt),
    expiresAt: isoValue(data.expiresAt),
    usedAt: isoValue(data.usedAt),
  }
}

async function ensureCustomerDoc(user, extra = {}) {
  const existing = await getDoc(customerRef(user.uid))
  if (existing.exists()) return existing.data()
  await call('ensureCustomerProfile', {
    firstName: extra.firstName || user.displayName?.split(' ')[0] || '',
    lastName: extra.lastName || user.displayName?.split(' ').slice(1).join(' ') || '',
    mobile: extra.mobile || '',
    dob: extra.dob || '',
  })
  const created = await getDoc(customerRef(user.uid))
  if (!created.exists()) throw new Error('Customer profile creation did not complete')
  return created.data()
}

function liveCollection(name, seed, cb) {
  return onSnapshot(
    collection(db, name),
    (snapshot) => cb(snapshot.empty ? seed : snapshot.docs.map((row) => ({ id: row.id, ...row.data() }))),
    (error) => {
      console.error(`Firestore subscription failed for ${name}`, error)
      cb(seed)
    },
  )
}

export function createFirebaseProvider() {
  return {
    mode: 'firebase',

    onAuth(cb) {
      return onAuthStateChanged(auth, (user) => cb(user ? { uid: user.uid, email: user.email } : null))
    },

    async signUp(fields) {
      const credential = await createUserWithEmailAndPassword(auth, fields.email, fields.password)
      return ensureCustomerDoc(credential.user, fields)
    },

    async signIn({ email, password }) {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      return ensureCustomerDoc(credential.user)
    },

    async signInWithProvider(name) {
      const provider = name === 'apple' ? new OAuthProvider('apple.com') : new GoogleAuthProvider()
      const credential = await signInWithPopup(auth, provider)
      return ensureCustomerDoc(credential.user)
    },

    async signOutUser() { return signOut(auth) },

    subscribeCustomer(uid, cb) {
      let customer = null
      let transactions = []
      const emit = () => cb(customer ? { ...customer, transactions } : null)
      const unsubscribeCustomer = onSnapshot(customerRef(uid), (snapshot) => {
        customer = snapshot.exists() ? snapshot.data() : null
        emit()
      })
      const historyQuery = query(
        collection(customerRef(uid), 'activity'),
        orderBy('occurredAt', 'desc'),
        limit(50),
      )
      const unsubscribeHistory = onSnapshot(historyQuery, (snapshot) => {
        transactions = snapshot.docs.map((row) => activityRow(row.id, row.data()))
        emit()
      })
      return () => { unsubscribeCustomer(); unsubscribeHistory() }
    },

    async lookupCustomer(customerNumber) {
      const lookup = query(
        collection(db, 'customers'),
        where('customerNumber', '==', String(customerNumber).trim()),
        limit(1),
      )
      const result = await getDocs(lookup)
      return result.empty ? null : result.docs[0].data()
    },

    async updateProfile(uid, fields) {
      if (auth.currentUser?.uid !== uid) throw new Error('Profile ownership check failed')
      const existing = await getDoc(customerRef(uid))
      if (!existing.exists()) return null
      const current = existing.data()
      const allowed = {}
      for (const key of ['firstName', 'lastName', 'mobile', 'dob', 'security', 'preferences']) {
        if (fields[key] !== undefined) allowed[key] = fields[key]
      }
      const firstName = allowed.firstName ?? current.firstName
      const lastName = allowed.lastName ?? current.lastName
      await updateDoc(customerRef(uid), {
        ...allowed,
        name: `${firstName} ${lastName}`.trim(),
        updatedAt: serverTimestamp(),
      })
      return { ...current, ...allowed, name: `${firstName} ${lastName}`.trim() }
    },

    async redeemReward(uid, reward) {
      if (auth.currentUser?.uid !== uid) throw new Error('Reward ownership check failed')
      return call('redeemReward', { rewardId: String(reward.id) })
    },

    subscribePendingCoupons(uid, cb) {
      const couponQuery = query(
        collection(customerRef(uid), 'coupons'),
        orderBy('createdAt', 'desc'),
        limit(100),
      )
      return onSnapshot(couponQuery, (snapshot) => {
        cb(snapshot.docs.map((row) => couponRow(row.id, row.data())))
      })
    },

    async getPendingCoupons(uid) {
      const couponQuery = query(
        collection(customerRef(uid), 'coupons'),
        orderBy('createdAt', 'desc'),
        limit(100),
      )
      const snapshot = await getDocs(couponQuery)
      return snapshot.docs.map((row) => couponRow(row.id, row.data()))
    },

    // Coupons are issued and changed by loyalty/POS services. These methods fail
    // closed instead of letting a browser claim that a coupon was consumed.
    async activatePendingCoupon() { return { ok: false, message: 'Coupon activation is controlled by POS' } },
    async usePendingCoupon() { return { ok: false, message: 'Coupon redemption is controlled by POS' } },
    async removePendingCoupon() { return { ok: false, message: 'Coupon history is retained for audit' } },
    async recordFuelPurchase() { return { ok: false, message: 'Purchases are recorded by POS' } },
    async recordShopPurchase() { return { ok: false, message: 'Purchases are recorded by POS' } },
    async spinWheel() { return { ok: false, message: 'Server-side prize processing is not enabled yet' } },

    subscribeOffers(cb) { return liveCollection('offers', seedOffers, cb) },
    subscribeRewards(cb) { return liveCollection('rewards', seedRewards, cb) },
    subscribeFuel(cb) { return liveCollection('fuelPrices', seedFuel, cb) },
    subscribeMenu(cb) { return liveCollection('menu', seedMenu, cb) },
    subscribeCategories(cb) { return liveCollection('categories', seedCategories, cb) },
    subscribeStations(cb) { return liveCollection('stations', seedStations, cb) },
    subscribeNotifications(cb) { return liveCollection('notifications', seedNotifs, cb) },

    async adminUpsert(name, item) {
      const collectionName = COLL[name] || name
      const id = String(item.id || doc(collection(db, collectionName)).id)
      const next = { ...item, id, schemaVersion: 1, updatedAt: serverTimestamp() }
      await setDoc(doc(db, collectionName, id), next, { merge: true })
      return { ...item, id, schemaVersion: 1 }
    },

    async adminRemove(name, id) {
      await deleteDoc(doc(db, COLL[name] || name, String(id)))
    },

    async adminListCustomers() {
      const snapshot = await getDocs(query(collection(db, 'customers'), limit(200)))
      return snapshot.docs.map((row) => row.data())
    },

    async adminAdjustPoints(uid, delta, meta = {}) {
      return call('adminAdjustPoints', {
        customerUid: uid,
        deltaPoints: Number(delta),
        reason: meta.store || meta.type || 'Admin adjustment',
        countsTowardTier: meta.countsTowardTier === true,
      })
    },

    async adminBroadcast(notification) {
      const ref = doc(collection(db, 'notifications'))
      await setDoc(ref, {
        ...notification,
        id: ref.id,
        time: 'just now',
        schemaVersion: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    },
  }
}
