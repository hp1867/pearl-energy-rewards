import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore'

const projectId = 'pearl-energy-rules-test'
let environment

function nightDeal(stationId = 's17', overrides = {}) {
  return {
    id: 'deal-1', stationId, productName: 'Classic Beef Pie', description: 'Tonight only', img: 'pie',
    originalPriceCents: 650, dealPriceCents: 250, quantityAvailable: 6, status: 'active',
    startsAt: new Date(Date.now() - 60_000), sellUntil: new Date(Date.now() + 3_600_000),
    safetyCutoffAt: new Date(Date.now() + 3_600_000), businessDate: '2026-09-04',
    timezone: 'Australia/Sydney', schemaVersion: 1,
    createdAt: serverTimestamp(), createdBy: 'manager',
    updatedAt: serverTimestamp(), updatedBy: 'manager',
    ...overrides,
  }
}

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

beforeEach(async () => {
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'customers', 'alice'), {
      uid: 'alice', authUid: 'alice', customerId: 'cus_alice', loyaltyAccountId: 'lac_alice',
      firstName: 'Alice', lastName: 'Member', name: 'Alice Member', mobile: '', dob: '',
      points: 1000, availablePoints: 1000, lifetimePoints: 2000, tier: 'Silver',
      customerNumber: '10000001', membershipId: 'PE-AAAA-BBBB-CCCC', updatedAt: new Date(),
    })
    await setDoc(doc(db, 'customers', 'bob'), {
      uid: 'bob', authUid: 'bob', customerId: 'cus_bob', loyaltyAccountId: 'lac_bob',
      firstName: 'Bob', lastName: 'Member', name: 'Bob Member', mobile: '', dob: '',
      points: 500, availablePoints: 500, lifetimePoints: 500, tier: 'Blue',
      customerNumber: '10000002', membershipId: 'PE-DDDD-EEEE-FFFF', updatedAt: new Date(),
    })
    await setDoc(doc(db, 'loyaltyLedger', 'entry-alice'), {
      customerUid: 'alice', customerId: 'cus_alice', loyaltyAccountId: 'lac_alice',
      deltaPoints: 1000,
    })
    await setDoc(doc(db, 'customers', 'alice', 'activity', 'event-1'), {
      points: 1000, occurredAt: new Date(),
    })
    await setDoc(doc(db, 'rewards', 'coffee'), { title: 'Coffee', cost: 500 })
    await setDoc(doc(db, 'stations', 's17'), { name: 'Pearl Energy Altona' })
    await setDoc(doc(db, 'stations', 's7'), { name: 'Pearl Energy Melbourne CBD' })
  })
})

after(async () => environment?.cleanup())

test('anonymous clients cannot read customer or catalog data', async () => {
  const db = environment.unauthenticatedContext().firestore()
  await assertFails(getDoc(doc(db, 'customers', 'alice')))
  await assertFails(getDocs(collection(db, 'rewards')))
})

test('a customer reads only their own profile and history', async () => {
  const alice = environment.authenticatedContext('alice').firestore()
  await assertSucceeds(getDoc(doc(alice, 'customers', 'alice')))
  await assertSucceeds(getDoc(doc(alice, 'customers', 'alice', 'activity', 'event-1')))
  await assertFails(getDoc(doc(alice, 'customers', 'bob')))
  await assertFails(getDocs(collection(alice, 'customers')))
})

test('a customer can update allowlisted profile fields only', async () => {
  const db = environment.authenticatedContext('alice').firestore()
  await assertSucceeds(updateDoc(doc(db, 'customers', 'alice'), {
    firstName: 'Alicia', name: 'Alicia Member', updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(doc(db, 'customers', 'alice'), {
    points: 999999, updatedAt: serverTimestamp(),
  }))
  await assertFails(setDoc(doc(db, 'customers', 'mallory'), {
    uid: 'alice', firstName: 'Mallory', lastName: 'Member', name: 'Mallory Member',
    points: 0, lifetimePoints: 0, tier: 'Blue', updatedAt: serverTimestamp(),
  }))
})

test('financial writes are denied even to admin client sessions', async () => {
  const admin = environment.authenticatedContext('admin', { admin: true }).firestore()
  await assertFails(setDoc(doc(admin, 'loyaltyLedger', 'forged'), {
    customerUid: 'alice', deltaPoints: 1_000_000,
  }))
  await assertFails(updateDoc(doc(admin, 'customers', 'alice'), { points: 1_000_000 }))
})

test('staff can inspect customers but cannot alter financial state', async () => {
  const staff = environment.authenticatedContext('staff', { staff: true }).firestore()
  await assertSucceeds(getDocs(collection(staff, 'customers')))
  await assertSucceeds(getDoc(doc(staff, 'loyaltyLedger', 'entry-alice')))
  await assertFails(updateDoc(doc(staff, 'customers', 'alice'), { points: 0 }))
})

test('admin catalog writes are allowed and ordinary customer writes are denied', async () => {
  const admin = environment.authenticatedContext('admin', { admin: true }).firestore()
  const alice = environment.authenticatedContext('alice').firestore()
  await assertSucceeds(setDoc(doc(admin, 'rewards', 'fuel-voucher'), { title: 'Fuel voucher', cost: 1000 }))
  await assertFails(setDoc(doc(alice, 'rewards', 'forged'), { title: 'Free fuel', cost: 0 }))
})

test('customers can read Tonight Only deals but cannot publish them', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'nightDeals', 'deal-1'), nightDeal('s17', {
      createdAt: new Date(), updatedAt: new Date(), createdBy: 'admin', updatedBy: 'admin',
    }))
  })
  const alice = environment.authenticatedContext('alice').firestore()
  await assertSucceeds(getDoc(doc(alice, 'nightDeals', 'deal-1')))
  await assertFails(setDoc(doc(alice, 'nightDeals', 'forged'), nightDeal('s17', { id: 'forged', createdBy: 'alice', updatedBy: 'alice' })))
})

test('a branch manager can publish only valid deals for an assigned station', async () => {
  const manager = environment.authenticatedContext('manager', {
    branchManager: true, permissions: ['nightDeals.manage'], stationIds: ['s17'],
  }).firestore()

  await assertSucceeds(setDoc(doc(manager, 'nightDeals', 'deal-1'), nightDeal()))
  await assertFails(setDoc(doc(manager, 'nightDeals', 'wrong-station'), nightDeal('s7', { id: 'wrong-station' })))
  await assertFails(setDoc(doc(manager, 'nightDeals', 'bad-price'), nightDeal('s17', {
    id: 'bad-price', dealPriceCents: 700,
  })))
  await assertFails(setDoc(doc(manager, 'nightDeals', 'too-long'), nightDeal('s17', {
    id: 'too-long', sellUntil: new Date(Date.now() + 26 * 3_600_000),
    safetyCutoffAt: new Date(Date.now() + 27 * 3_600_000),
  })))
})

test('a branch manager may end or shorten a deal but cannot extend its safety cutoff or delete it', async () => {
  const manager = environment.authenticatedContext('manager', {
    branchManager: true, permissions: ['nightDeals.manage'], stationIds: ['s17'],
  }).firestore()
  const ref = doc(manager, 'nightDeals', 'deal-1')
  await assertSucceeds(setDoc(ref, nightDeal()))
  await assertSucceeds(updateDoc(ref, { status: 'sold_out', quantityAvailable: 0, updatedAt: serverTimestamp(), updatedBy: 'manager' }))
  await assertFails(updateDoc(ref, { safetyCutoffAt: new Date(Date.now() + 7_200_000), updatedAt: serverTimestamp(), updatedBy: 'manager' }))
  await assertFails(deleteDoc(ref))
})

test('a Tonight Only branch manager cannot read customer or financial records', async () => {
  const manager = environment.authenticatedContext('manager', {
    branchManager: true, permissions: ['nightDeals.manage'], stationIds: ['s17'],
  }).firestore()
  await assertFails(getDocs(collection(manager, 'customers')))
  await assertFails(getDoc(doc(manager, 'customers', 'alice')))
  await assertFails(getDoc(doc(manager, 'loyaltyLedger', 'entry-alice')))
})

test('unknown collections are denied by default', async () => {
  const admin = environment.authenticatedContext('admin', { admin: true }).firestore()
  await assertFails(setDoc(doc(admin, 'futureCollection', 'doc'), { value: true }))
  await assertFails(getDoc(doc(admin, 'futureCollection', 'doc')))
  assert.ok(true)
})
