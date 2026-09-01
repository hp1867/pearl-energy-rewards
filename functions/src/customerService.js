import { FieldValue } from 'firebase-admin/firestore'
import { db } from './firebase.js'
import {
  COLLECTIONS, PROGRAM_ID, PROGRAM_VERSION, SCHEMA_VERSION, TENANT_ID,
} from './constants.js'
import {
  buildQrData, generateCustomerNumber, generateMembershipId, normalizeMembershipCode,
  randomDocumentId,
} from './domain.js'

function cleanText(value, fallback, maxLength) {
  const text = String(value || '').trim()
  return (text || fallback).slice(0, maxLength)
}

function profileFrom(auth, input = {}) {
  const tokenName = String(auth.token?.name || '').trim().split(/\s+/)
  const firstName = cleanText(input.firstName, tokenName[0] || 'New', 80)
  const lastName = cleanText(input.lastName, tokenName.slice(1).join(' ') || 'Member', 80)
  const email = cleanText(auth.token?.email, '', 320).toLowerCase()
  const mobile = cleanText(input.mobile, '', 32)
  const dob = cleanText(input.dob, '', 10)
  return { firstName, lastName, name: `${firstName} ${lastName}`, email, mobile, dob }
}

function callableCustomer(customer) {
  return {
    uid: customer.uid,
    customerId: customer.customerId,
    customerNumber: customer.customerNumber,
    membershipId: customer.membershipId,
    loyaltyAccountId: customer.loyaltyAccountId,
    firstName: customer.firstName,
    lastName: customer.lastName,
    name: customer.name,
    email: customer.email,
    mobile: customer.mobile,
    dob: customer.dob,
    points: customer.points,
    lifetimePoints: customer.lifetimePoints,
    tier: customer.tier,
    qrData: customer.qrData,
    joined: customer.joined,
    schemaVersion: customer.schemaVersion,
  }
}

export async function ensureCustomer(auth, input = {}) {
  const customerRef = db.collection(COLLECTIONS.customers).doc(auth.uid)
  const existing = await customerRef.get()
  if (existing.exists) return callableCustomer(existing.data())

  const profile = profileFrom(auth, input)

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const customerId = randomDocumentId('cus_')
    const accountId = randomDocumentId('lac_')
    const customerNumber = generateCustomerNumber()
    const membershipId = generateMembershipId()
    const membershipKey = normalizeMembershipCode(membershipId)
    const auditId = randomDocumentId('aud_')
    const joined = new Date().toISOString()

    const numberRef = db.collection(COLLECTIONS.customerNumbers).doc(customerNumber)
    const membershipRef = db.collection(COLLECTIONS.membershipCodes).doc(membershipKey)
    const accountRef = db.collection(COLLECTIONS.loyaltyAccounts).doc(accountId)
    const authLinkRef = db.collection(COLLECTIONS.authLinks).doc(auth.uid)
    const auditRef = db.collection(COLLECTIONS.auditLogs).doc(auditId)

    try {
      const created = await db.runTransaction(async (transaction) => {
        // Firestore requires every read before the first write.
        const customerSnap = await transaction.get(customerRef)
        const numberSnap = await transaction.get(numberRef)
        const membershipSnap = await transaction.get(membershipRef)

        if (customerSnap.exists) return callableCustomer(customerSnap.data())
        if (numberSnap.exists || membershipSnap.exists) {
          const error = new Error('IDENTIFIER_COLLISION')
          error.code = 'IDENTIFIER_COLLISION'
          throw error
        }

        const customer = {
          uid: auth.uid,
          authUid: auth.uid,
          customerId,
          loyaltyAccountId: accountId,
          tenantId: TENANT_ID,
          programId: PROGRAM_ID,
          programVersion: PROGRAM_VERSION,
          customerNumber,
          membershipId,
          qrData: buildQrData(membershipId),
          ...profile,
          status: 'active',
          points: 0,
          availablePoints: 0,
          lifetimePoints: 0,
          tier: 'Blue',
          missionStart: null,
          missionCount: 0,
          missionRewarded: false,
          missionPrize: null,
          wheelSpins: 0,
          monthlyDrawEntries: 0,
          doublePointsNext: false,
          preferences: {
            marketingEmail: false,
            marketingPush: false,
          },
          joined,
          joinedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          schemaVersion: SCHEMA_VERSION,
        }

        transaction.create(customerRef, customer)
        transaction.create(accountRef, {
          accountId,
          customerId,
          customerUid: auth.uid,
          tenantId: TENANT_ID,
          programId: PROGRAM_ID,
          programVersion: PROGRAM_VERSION,
          status: 'active',
          balancePoints: 0,
          availablePoints: 0,
          lifetimeEarnedPoints: 0,
          lifetimeRedeemedPoints: 0,
          version: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          schemaVersion: SCHEMA_VERSION,
        })
        transaction.create(numberRef, {
          customerId,
          customerUid: auth.uid,
          membershipId,
          createdAt: FieldValue.serverTimestamp(),
          schemaVersion: SCHEMA_VERSION,
        })
        transaction.create(membershipRef, {
          customerId,
          customerUid: auth.uid,
          loyaltyAccountId: accountId,
          membershipId,
          status: 'active',
          createdAt: FieldValue.serverTimestamp(),
          schemaVersion: SCHEMA_VERSION,
        })
        transaction.create(authLinkRef, {
          authUid: auth.uid,
          customerId,
          loyaltyAccountId: accountId,
          provider: auth.token?.firebase?.sign_in_provider || 'unknown',
          createdAt: FieldValue.serverTimestamp(),
          schemaVersion: SCHEMA_VERSION,
        })
        transaction.create(auditRef, {
          action: 'customer.created',
          actor: { type: 'customer', authUid: auth.uid },
          subject: { type: 'customer', id: customerId, authUid: auth.uid },
          metadata: { customerNumber, membershipId },
          occurredAt: FieldValue.serverTimestamp(),
          schemaVersion: SCHEMA_VERSION,
        })
        return callableCustomer(customer)
      })
      return created
    } catch (error) {
      if (error.code === 'IDENTIFIER_COLLISION') continue
      throw error
    }
  }

  throw new Error('Could not allocate unique customer identifiers after multiple attempts')
}

