import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { data, DATA_MODE } from '../services/data'
import { offers as seedOffers, rewards as seedRewards, fuelTypes as seedFuel, menuItems as seedMenu, menuGroups as seedCats, notifications as seedNotifs, stations as seedStations } from '../data/mockData'

const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

export function AppProvider({ children }) {
  const [tab, setTab] = useState('home')
  const [overlay, setOverlay] = useState(null)
  const [overlayArg, setOverlayArg] = useState(null)
  const [toast, setToast] = useState(null)

  const [user, setUser] = useState(undefined)
  const [member, setMember] = useState(null)

  // Pending rewards (redeemed but not yet scanned at POS)
  const [pendingRewards, setPendingRewards] = useState([])

  // Keep coupon state subscribed to the server projection. POS/reward services
  // are authoritative; the browser never marks a coupon consumed on its own.
  useEffect(() => {
    if (!user) { setPendingRewards([]); return }
    if (data.subscribePendingCoupons) {
      return data.subscribePendingCoupons(user.uid, (rows) => setPendingRewards(rows || []))
    }
    if (data.getPendingCoupons) {
      data.getPendingCoupons(user.uid).then(r => {
        setPendingRewards(r || [])
      }).catch(() => {})
    }
  }, [user])

  const [offers, setOffers] = useState(seedOffers)
  const [rewards, setRewards] = useState(seedRewards)
  const [fuelPrices, setFuelPrices] = useState(seedFuel)
  const [menu, setMenu] = useState(seedMenu)
  const [categories, setCategories] = useState(seedCats)
  const [stations, setStations] = useState(seedStations)
  const [notifications, setNotifications] = useState(seedNotifs)

  const notify = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(null), 2400) }, [])

  useEffect(() => data.onAuth(setUser), [])

  useEffect(() => {
    if (!user) { setMember(null); return }
    return data.subscribeCustomer(user.uid, setMember)
  }, [user])

  useEffect(() => {
    if (!user) return undefined
    const unsubscribes = [
      data.subscribeOffers(setOffers), data.subscribeRewards(setRewards),
      data.subscribeFuel(setFuelPrices), data.subscribeMenu(setMenu),
      data.subscribeCategories(setCategories), data.subscribeStations(setStations),
      data.subscribeNotifications(setNotifications),
    ]
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe?.())
  }, [user])

  const signup = useCallback(async (fields) => {
    await data.signUp(fields); notify('Welcome to Pearl Energy Rewards ✨')
  }, [notify])

  const login = useCallback(async (creds) => {
    await data.signIn(creds); notify('Welcome back 👋')
  }, [notify])

  const loginProvider = useCallback(async (name) => {
    await data.signInWithProvider(name); notify(`Signed in with ${name}`)
  }, [notify])

  const logout = useCallback(async () => { await data.signOutUser(); setTab('home'); setOverlay(null); notify('Logged out') }, [notify])

  // Firebase performs this as one atomic server operation: ledger, balance,
  // redemption and coupon either all commit or none of them do.
  const redeemReward = useCallback(async (reward) => {
    if (!member) return { ok: false, message: 'Please log in first' }
    const result = await data.redeemReward(member.uid, reward)
    if (!result?.ok) return result || { ok: false, message: 'Redemption failed' }
    if (result.coupon) {
      setPendingRewards((previous) => previous.some((item) => item.id === result.coupon.id)
        ? previous
        : [result.coupon, ...previous])
    }
    notify(`✅ ${reward.title} is active in My Coupons — valid for 7 days, auto-applies at POS.`)
    return { ...result, reward: result.coupon }
  }, [member, notify])

  // Activate a pending reward (called when scanned at POS)
  const activateReward = useCallback(async (rewardId) => {
    setPendingRewards(prev => prev.map(r => 
      r.id === rewardId ? { ...r, status: 'active', activatedAt: new Date().toISOString() } : r
    ))
    if (data.activatePendingCoupon && member) {
      data.activatePendingCoupon(member.uid, rewardId).catch(e => console.error('Failed to persist activation', e))
    }
    notify('✅ Reward activated!')
    return { ok: true }
  }, [member, notify])

  // Mark reward as fully redeemed (used)
  const useReward = useCallback(async (rewardId) => {
    setPendingRewards(prev => prev.map(r => 
      r.id === rewardId ? { ...r, status: 'redeemed', usedAt: new Date().toISOString() } : r
    ))
    if (data.usePendingCoupon && member) {
      data.usePendingCoupon(member.uid, rewardId).catch(e => console.error('Failed to persist use', e))
    }
    notify('✅ Reward redeemed!')
    return { ok: true }
  }, [member, notify])

  // Remove expired/used rewards
  const removeReward = useCallback(async (rewardId) => {
    setPendingRewards(prev => prev.filter(r => r.id !== rewardId))
    if (data.removePendingCoupon && member) {
      data.removePendingCoupon(member.uid, rewardId).catch(e => console.error('Failed to persist removal', e))
    }
  }, [member])

  const lookupCustomer = useCallback((customerNumber) => data.lookupCustomer(customerNumber), [])

  const updateProfile = useCallback(async (fields) => {
    if (!member) return { ok: false, message: 'Please log in first' }
    await data.updateProfile(member.uid, fields)
    notify('Profile updated ✅')
    return { ok: true }
  }, [member, notify])

  const value = {
    mode: DATA_MODE,
    tab, setTab, overlay, setOverlay, overlayArg, setOverlayArg, toast, notify,
    user, member, authed: !!member, resolving: user === undefined,
    offers, rewards, fuelPrices, menu, categories, stations, notifications,
    pendingRewards, setPendingRewards, redeemReward, activateReward, useReward, removeReward,
    signup, login, loginProvider, logout, lookupCustomer, updateProfile,
  }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
