// Seed Firestore catalogs (offers, rewards, fuelPrices) so the app shows live data.
//
// Usage:
//   1) npm i -D firebase-admin
//   2) Firebase console → Project settings → Service accounts → Generate new private key
//      → save it as scripts/serviceAccount.json  (DO NOT commit this file)
//   3) node scripts/seed.mjs
//
import { readFile } from 'node:fs/promises'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const sa = JSON.parse(await readFile(new URL('./serviceAccount.json', import.meta.url)))
initializeApp({ credential: cert(sa) })
const db = getFirestore()

// keep these in sync with src/data/mockData.js
const offers = [
  { id: '1', cat: 'Coffee Deals', title: 'Barista Coffee + Muffin', sub: 'Any size, any day', price: '$6.50', img: '☕', accent: '#7a4a2b', expiry: '30 Jun 2026', tag: 'POPULAR' },
  { id: '2', cat: 'Fuel Deals', title: '6¢ off per litre', sub: 'Weekend fuel special', price: 'Save big', img: '⛽', accent: '#0057B8', expiry: '08 Jun 2026', tag: 'ENDING SOON' },
  { id: '3', cat: 'Food Deals', title: 'Meal Combo', sub: 'Burger + Chips + Drink', price: '$11.90', img: '🍔', accent: '#c0392b', expiry: '21 Jun 2026', tag: 'COMBO' },
  { id: '4', cat: 'Imported Products', title: 'Imported Snack Box', sub: 'Japan & Korea range', price: '$14.00', img: '🍫', accent: '#6c3483', expiry: '15 Jul 2026', tag: 'NEW' },
  { id: '5', cat: 'Seasonal Specials', title: 'Winter Energy Bundle', sub: '2 Energy drinks + bar', price: '$8.50', img: '⚡', accent: '#1f7be0', expiry: '31 Jul 2026', tag: 'SEASONAL' },
]
const rewards = [
  { id: '1', cat: 'Free Coffee', title: 'Free Barista Coffee', cost: 500, img: '☕', color: '#7a4a2b' },
  { id: '2', cat: 'Fuel Discount', title: '$10 Fuel Voucher', cost: 1000, img: '⛽', color: '#0057B8' },
  { id: '3', cat: 'Food Discount', title: '$8 Off Any Meal', cost: 800, img: '🍔', color: '#c0392b' },
  { id: '4', cat: 'Merchandise', title: 'Pearl Drink Bottle', cost: 1500, img: '🥤', color: '#16a085' },
  { id: '5', cat: 'Partner Rewards', title: '$25 Movie Voucher', cost: 2500, img: '🎬', color: '#6c3483' },
]
const fuelPrices = [
  { id: 'ulp91', code: 'ULP 91', price: 1.879, trend: -0.04, color: '#27ae60' },
  { id: 'p95', code: 'Premium 95', price: 1.989, trend: 0.02, color: '#0057B8' },
  { id: 'p98', code: 'Premium 98', price: 2.079, trend: -0.01, color: '#6c3483' },
  { id: 'diesel', code: 'Diesel', price: 1.949, trend: 0.03, color: '#34495e' },
  { id: 'lpg', code: 'LPG', price: 0.929, trend: -0.02, color: '#e67e22' },
]

async function seed(name, rows) {
  const batch = db.batch()
  rows.forEach((r) => batch.set(db.collection(name).doc(r.id), r))
  await batch.commit()
  console.log(`✓ seeded ${rows.length} → ${name}`)
}

await seed('offers', offers)
await seed('rewards', rewards)
await seed('fuelPrices', fuelPrices)
console.log('Done. Edit any doc in the Firebase console and the app updates instantly.')
process.exit(0)
