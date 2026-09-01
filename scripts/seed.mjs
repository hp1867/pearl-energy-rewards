// Idempotent baseline seed for Pearl Energy's catalogs and loyalty program.
//
// Live usage (recommended):
//   set GOOGLE_APPLICATION_CREDENTIALS=C:\secure\pearl-seed-service-account.json
//   npm run firebase:seed
//
// Emulator usage:
//   set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
//   npm run firebase:seed
//
// The service identity should have only the permissions required to seed these
// controlled collections. Never commit its credential file.
import { access, readFile } from 'node:fs/promises'
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import {
  fuelTypes, menuGroups, menuItems, notifications, offers, rewards, stations,
} from '../src/data/mockData.js'

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'pearl-energy-app'
const SCHEMA_VERSION = 1
const serviceAccountUrl = new URL('./serviceAccount.json', import.meta.url)

async function credentials() {
  if (process.env.FIRESTORE_EMULATOR_HOST) return { projectId: PROJECT_ID }
  try {
    await access(serviceAccountUrl)
    return {
      projectId: PROJECT_ID,
      credential: cert(JSON.parse(await readFile(serviceAccountUrl, 'utf8'))),
    }
  } catch {
    return { projectId: PROJECT_ID, credential: applicationDefault() }
  }
}

if (!getApps().length) initializeApp(await credentials())
const db = getFirestore()

const nowFields = () => ({
  schemaVersion: SCHEMA_VERSION,
  updatedAt: FieldValue.serverTimestamp(),
})

const collections = {
  offers: offers.map((row) => ({ ...row, status: 'active', ...nowFields() })),
  rewards: rewards.map((row) => ({ ...row, status: 'active', ...nowFields() })),
  fuelPrices: fuelTypes.map((row) => ({ ...row, status: 'active', currency: 'AUD', ...nowFields() })),
  menu: menuItems.map((row) => ({ ...row, status: row.avail === false ? 'inactive' : 'active', ...nowFields() })),
  categories: menuGroups.map((row) => ({ id: row.key, ...row, status: 'active', ...nowFields() })),
  stations: stations.map((row) => ({ ...row, status: 'active', ...nowFields() })),
  notifications: notifications.map((row) => ({ ...row, audience: 'all', status: 'published', ...nowFields() })),
}

const writer = db.bulkWriter()
writer.onWriteError((error) => {
  if (error.failedAttempts < 3) return true
  console.error(`Seed write failed for ${error.documentRef.path}`, error)
  return false
})

for (const [collectionName, rows] of Object.entries(collections)) {
  for (const row of rows) {
    const id = String(row.id)
    writer.set(db.collection(collectionName).doc(id), row, { merge: true })
  }
}

writer.set(db.collection('loyaltyPrograms').doc('pearl-rewards-au'), {
  programId: 'pearl-rewards-au',
  tenantId: 'pearl-energy',
  version: 1,
  status: 'active',
  currency: 'AUD',
  pointsNumerator: 1,
  pointsDenominator: 1,
  rounding: 'floor',
  excludedCategories: ['tobacco', 'lottery', 'gift-card', 'cash-out'],
  tiers: [
    { name: 'Blue', minimumLifetimePoints: 0 },
    { name: 'Silver', minimumLifetimePoints: 1000 },
    { name: 'Gold', minimumLifetimePoints: 2500 },
    { name: 'Diamond', minimumLifetimePoints: 5000 },
    { name: 'Immortal', minimumLifetimePoints: 10000 },
  ],
  effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
  schemaVersion: SCHEMA_VERSION,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
}, { merge: true })

writer.set(db.collection('system').doc('schema'), {
  currentVersion: SCHEMA_VERSION,
  minimumReaderVersion: SCHEMA_VERSION,
  minimumWriterVersion: SCHEMA_VERSION,
  updatedAt: FieldValue.serverTimestamp(),
}, { merge: true })

writer.set(db.collection('schemaMigrations').doc('0001-production-baseline'), {
  migrationId: '0001-production-baseline',
  version: SCHEMA_VERSION,
  status: 'complete',
  checksum: 'pearl-energy-schema-v1',
  appliedAt: FieldValue.serverTimestamp(),
}, { merge: true })

await writer.close()
console.log('Pearl Energy Firestore baseline seeded successfully.')
