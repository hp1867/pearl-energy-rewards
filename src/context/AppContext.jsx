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

  useEffect(() => data.subscribeOffers(setOffers), [])
  useEffect(() => data.subscribeRewards(setRewards), [])
  useEffect(() => data.subscribeFuel(setFuelPrices), [])
  useEffect(() => data.subscribeMenu(setMenu), [])
  useEffect(() => data.subscribeCategories(setCategories), [])
  useEffect(() => data.subscribeStations(setStations), [])
  useEffect(() => data.subscribeNotifications(setNotifications), [])

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

  // Redeem a reward (points-based) - adds to pending rewards
  const redeemReward = useCallback(async (reward) => {
    if (!member) return { ok: false, message: 'Please log in first' }
    if (member.points < reward.cost) {
      return { ok: false, message: `Need ${reward.cost - member.points} more points` }
    }
    
    // Deduct points locally immediately
    const newPoints = member.points - reward.cost
    const newLifetimePoints = member.lifetimePoints // Don't reduce lifetime
    
    // Add to pending rewards
    const newPendingReward = {
      id: Date.now(),
      rewardId: reward.id,
      title: reward.title,
      cat: reward.cat,
      cost: reward.cost,
      img: reward.img,
      color: reward.color,
      status: 'not_active', // not_active | active | redeemed
      redeemedAt: new Date().toISOString(),
      activatedAt: null,
    }
    
    setPendingRewards(prev => [...prev, newPendingReward])
    
    // Update member points
    setMember(prev => prev ? { ...prev, points: newPoints, lifetimePoints: newLifetimePoints } : null)
    
    // Also persist to backend
    try {
      await data.adminAdjustPoints(member.uid, -reward.cost, { 
        store: 'Reward Redeemed', 
        amount: 0, 
        type: `Reward: ${reward.title}` 
      })
    } catch (e) {
      console.error('Failed to persist points deduction', e)
    }
    
    notify(`✅ ${reward.title} added to My Rewards. Scan at POS to activate.`)
    return { ok: true, reward: newPendingReward }
  }, [member, notify])

  // Activate a pending reward (called when scanned at POS)
  const activateReward = useCallback(async (rewardId) => {
    setPendingRewards(prev => prev.map(r => 
      r.id === rewardId ? { ...r, status: 'active', activatedAt: new Date().toISOString() } : r
    ))
    notify('✅ Reward activated!')
    return { ok: true }
  }, [notify])

  // Mark reward as fully redeemed (used)
  const useReward = useCallback(async (rewardId) => {
    setPendingRewards(prev => prev.map(r => 
      r.id === rewardId ? { ...r, status: 'redeemed', usedAt: new Date().toISOString() } : r
    ))
    notify('✅ Reward redeemed!')
    return { ok: true }
  }, [notify])

  // Remove expired/used rewards
  const removeReward = useCallback((rewardId) => {
    setPendingRewards(prev => prev.filter(r => r.id !== rewardId))
  }, [])

  const lookupCustomer = useCallback((customerNumber) => data.lookupCustomer(customerNumber), [])

  const value = {
    mode: DATA_MODE,
    tab, setTab, overlay, setOverlay, overlayArg, setOverlayArg, toast, notify,
    user, member, authed: !!member, resolving: user === undefined,
    offers, rewards, fuelPrices, menu, categories, stations, notifications,
    pendingRewards, redeemReward, activateReward, useReward, removeReward,
    signup, login, loginProvider, logout, lookupCustomer,
  }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}