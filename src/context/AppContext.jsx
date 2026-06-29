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

  const [user, setUser] = useState(undefined)   // undefined = still resolving
  const [member, setMember] = useState(null)     // live customer doc

  // live catalogs (instant updates — no app redeploy needed)
  const [offers, setOffers] = useState(seedOffers)
  const [rewards, setRewards] = useState(seedRewards)
  const [fuelPrices, setFuelPrices] = useState(seedFuel)
  const [menu, setMenu] = useState(seedMenu)
  const [categories, setCategories] = useState(seedCats)
  const [stations, setStations] = useState(seedStations)
  const [notifications, setNotifications] = useState(seedNotifs)

  const notify = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(null), 2400) }, [])

  // auth state
  useEffect(() => data.onAuth(setUser), [])

  // live customer doc for the signed-in user
  useEffect(() => {
    if (!user) { setMember(null); return }
    return data.subscribeCustomer(user.uid, setMember)
  }, [user])

  // live catalogs
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

  const redeem = useCallback(async (reward) => {
    if (!member) return
    const res = await data.redeemReward(member.uid, reward)
    notify(res.message)
    return res.ok
  }, [member, notify])

  const lookupCustomer = useCallback((customerNumber) => data.lookupCustomer(customerNumber), [])

  const value = {
    mode: DATA_MODE,
    tab, setTab, overlay, setOverlay, overlayArg, setOverlayArg, toast, notify,
    user, member, authed: !!member, resolving: user === undefined,
    offers, rewards, fuelPrices, menu, categories, stations, notifications,
    signup, login, loginProvider, logout, redeem, lookupCustomer,
  }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
