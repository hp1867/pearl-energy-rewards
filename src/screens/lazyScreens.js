import { lazy } from 'react'

// Code only: this never prefetches private data or runs a redemption.
const loaders = {
  offers: () => import('./OffersScreen'),
  menu: () => import('./MenuScreen'),
  rewards: () => import('./RewardsScreen'),
  profile: () => import('./ProfileScreen'),
  nightdeals: () => import('./NightDealsScreen'),
}
export const lazyTabs = Object.fromEntries(['offers', 'menu', 'rewards', 'profile'].map(name => [name, lazy(loaders[name])]))
const overlay = name => lazy(() => import('./Overlays').then(module => ({ default: module[name] })))
export const lazyOverlays = {
  fuel: overlay('FuelPrices'), locator: overlay('StoreLocator'), wallet: overlay('WalletCard'),
  scan: overlay('ScanModal'), receipts: overlay('Receipts'), notifications: overlay('Notifications'),
  coupons: overlay('MyCoupons'), editprofile: overlay('EditProfile'), help: overlay('HelpSupport'),
  tiers: overlay('TiersInfo'), wheel: overlay('SpinWheel'), itemdetails: overlay('ItemDetails'),
  nightdeals: lazy(loaders.nightdeals),
}
export function preloadTab(name) {
  // Best-effort on focus/pointer intent; failures are handled by the screen boundary.
  if (loaders[name]) void loaders[name]().catch(() => {})
}
