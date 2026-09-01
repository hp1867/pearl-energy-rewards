import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { db } from './firebase.js'
import {
  COLLECTIONS, PROGRAM_ID, PROGRAM_VERSION, SCHEMA_VERSION, TENANT_ID,
} from './constants.js'
import { randomDocumentId, tierForLifetimePoints, ValidationError } from './domain.js'

function integer(value, field, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${field} must be an integer between ${min} and ${max}`, field)
  }
  return value
}

function requiredText(value, field, max = 300) {
  const text = String(value || '').trim()
  if (!text || text.length > max) throw new ValidationError(`${field} is required`, field)
  return text
}

function activityDate(date) {
  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney',
  }).format(date)
}

export async function redeemReward(authUid, rewardIdInput) {
  const rewardId = requiredText(rewardIdInput, 'rewardId', 120)
  const redemptionId = randomDocumentId('red_')
  const ledgerId = randomDocumentId('led_')
  const auditId = randomDocumentId('aud_')
  const occurred = new Date()
  const expiresAt = Timestamp.fromMillis(occurred.getTime() + (7 * 24 * 60 * 60 * 1000))

  return db.runTransaction(async (transaction) => {
    const customerRef = db.collection(COLLECTIONS.customers).doc(authUid)
    const rewardRef = db.collection('rewards').doc(rewardId)
    const customerSnap = await transaction.get(customerRef)
    const rewardSnap = await transaction.get(rewardRef)
    if (!customerSnap.exists) throw new ValidationError('Customer profile was not found')
    if (!rewardSnap.exists) throw new ValidationError('Reward was not found', 'rewardId')

    const customer = customerSnap.data()
    const reward = rewardSnap.data()
    const accountRef = db.collection(COLLECTIONS.loyaltyAccounts).doc(customer.loyaltyAccountId)
    const accountSnap = await transaction.get(accountRef)
    if (!accountSnap.exists) throw new Error('Loyalty account is missing')
    const account = accountSnap.data()

    if ((reward.status || 'active') !== 'active') throw new ValidationError('Reward is not active')
    const cost = integer(reward.cost, 'reward.cost', 1, 10_000_000)
    if (account.availablePoints < cost) {
      throw new ValidationError(`Need ${cost - account.availablePoints} more points`)
    }

    const balanceBefore = account.balancePoints
    const balanceAfter = balanceBefore - cost
    const availableAfter = account.availablePoints - cost
    const title = requiredText(reward.title, 'reward.title', 160)
    const redemptionRef = db.collection(COLLECTIONS.redemptions).doc(redemptionId)
    const ledgerRef = db.collection(COLLECTIONS.loyaltyLedger).doc(ledgerId)
    const couponRef = customerRef.collection('coupons').doc(redemptionId)
    const activityRef = customerRef.collection('activity').doc(ledgerId)
    const auditRef = db.collection(COLLECTIONS.auditLogs).doc(auditId)

    transaction.update(accountRef, {
      balancePoints: balanceAfter,
      availablePoints: availableAfter,
      lifetimeRedeemedPoints: (account.lifetimeRedeemedPoints || 0) + cost,
      version: (account.version || 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.update(customerRef, {
      points: balanceAfter,
      availablePoints: availableAfter,
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.create(ledgerRef, {
      entryId: ledgerId,
      tenantId: TENANT_ID,
      customerId: customer.customerId,
      customerUid: authUid,
      loyaltyAccountId: customer.loyaltyAccountId,
      entryType: 'redeem',
      status: 'committed',
      deltaPoints: -cost,
      balanceBefore,
      balanceAfter,
      causationId: redemptionId,
      correlationId: redemptionId,
      programId: customer.programId || PROGRAM_ID,
      programVersion: customer.programVersion || PROGRAM_VERSION,
      actor: { type: 'customer', authUid },
      occurredAt: Timestamp.fromDate(occurred),
      recordedAt: FieldValue.serverTimestamp(),
      schemaVersion: SCHEMA_VERSION,
    })
    transaction.create(redemptionRef, {
      redemptionId,
      tenantId: TENANT_ID,
      customerId: customer.customerId,
      customerUid: authUid,
      loyaltyAccountId: customer.loyaltyAccountId,
      rewardId,
      rewardSnapshot: {
        title,
        category: reward.cat || reward.category || null,
        image: reward.img || null,
        color: reward.color || null,
        costPoints: cost,
      },
      status: 'active',
      costPoints: cost,
      ledgerEntryId: ledgerId,
      createdAt: FieldValue.serverTimestamp(),
      activatedAt: FieldValue.serverTimestamp(),
      expiresAt,
      schemaVersion: SCHEMA_VERSION,
    })
    transaction.create(couponRef, {
      id: redemptionId,
      redemptionId,
      rewardId,
      title,
      cat: reward.cat || reward.category || 'Reward',
      cost,
      img: reward.img || null,
      color: reward.color || null,
      status: 'active',
      redeemedAt: Timestamp.fromDate(occurred),
      activatedAt: Timestamp.fromDate(occurred),
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
      schemaVersion: SCHEMA_VERSION,
    })
    transaction.create(activityRef, {
      id: ledgerId,
      kind: 'reward_redemption',
      title,
      store: 'Pearl Energy Rewards',
      amountCents: 0,
      amount: 0,
      points: -cost,
      type: `Reward: ${title}`,
      date: activityDate(occurred),
      occurredAt: Timestamp.fromDate(occurred),
      createdAt: FieldValue.serverTimestamp(),
      schemaVersion: SCHEMA_VERSION,
    })
    transaction.create(auditRef, {
      action: 'loyalty.reward_redeemed',
      actor: { type: 'customer', authUid },
      subject: { type: 'redemption', id: redemptionId },
      metadata: { rewardId, costPoints: cost, ledgerEntryId: ledgerId },
      occurredAt: FieldValue.serverTimestamp(),
      schemaVersion: SCHEMA_VERSION,
    })

    return {
      ok: true,
      message: `Redeemed: ${title}`,
      points: balanceAfter,
      redemptionId,
      coupon: {
        id: redemptionId,
        rewardId,
        title,
        cat: reward.cat || reward.category || 'Reward',
        cost,
        img: reward.img || null,
        color: reward.color || null,
        status: 'active',
        redeemedAt: occurred.toISOString(),
        activatedAt: occurred.toISOString(),
        expiresAt: expiresAt.toDate().toISOString(),
      },
    }
  })
}

export async function adjustPoints(actor, input) {
  const customerUid = requiredText(input.customerUid, 'customerUid', 160)
  const deltaPoints = integer(input.deltaPoints, 'deltaPoints', -1_000_000, 1_000_000)
  if (deltaPoints === 0) throw new ValidationError('deltaPoints cannot be zero', 'deltaPoints')
  const reason = requiredText(input.reason, 'reason', 300)
  const countsTowardTier = input.countsTowardTier === true
  const ledgerId = randomDocumentId('led_')
  const auditId = randomDocumentId('aud_')
  const occurred = new Date()

  return db.runTransaction(async (transaction) => {
    const customerRef = db.collection(COLLECTIONS.customers).doc(customerUid)
    const customerSnap = await transaction.get(customerRef)
    if (!customerSnap.exists) throw new ValidationError('Customer was not found', 'customerUid')
    const customer = customerSnap.data()
    const accountRef = db.collection(COLLECTIONS.loyaltyAccounts).doc(customer.loyaltyAccountId)
    const accountSnap = await transaction.get(accountRef)
    if (!accountSnap.exists) throw new Error('Loyalty account is missing')
    const account = accountSnap.data()

    const balanceBefore = account.balancePoints
    const balanceAfter = balanceBefore + deltaPoints
    if (balanceAfter < 0) throw new ValidationError('Adjustment would create a negative balance')
    const lifetimePoints = countsTowardTier && deltaPoints > 0
      ? (customer.lifetimePoints || 0) + deltaPoints
      : (customer.lifetimePoints || 0)
    const tier = tierForLifetimePoints(lifetimePoints)
    const ledgerRef = db.collection(COLLECTIONS.loyaltyLedger).doc(ledgerId)
    const activityRef = customerRef.collection('activity').doc(ledgerId)
    const auditRef = db.collection(COLLECTIONS.auditLogs).doc(auditId)

    transaction.update(accountRef, {
      balancePoints: balanceAfter,
      availablePoints: balanceAfter,
      lifetimeEarnedPoints: countsTowardTier && deltaPoints > 0
        ? (account.lifetimeEarnedPoints || 0) + deltaPoints
        : (account.lifetimeEarnedPoints || 0),
      lifetimeRedeemedPoints: deltaPoints < 0
        ? (account.lifetimeRedeemedPoints || 0) + Math.abs(deltaPoints)
        : (account.lifetimeRedeemedPoints || 0),
      version: (account.version || 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.update(customerRef, {
      points: balanceAfter,
      availablePoints: balanceAfter,
      lifetimePoints,
      tier,
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.create(ledgerRef, {
      entryId: ledgerId,
      tenantId: TENANT_ID,
      customerId: customer.customerId,
      customerUid,
      loyaltyAccountId: customer.loyaltyAccountId,
      entryType: 'adjustment',
      status: 'committed',
      deltaPoints,
      balanceBefore,
      balanceAfter,
      reason,
      causationId: auditId,
      correlationId: auditId,
      programId: customer.programId || PROGRAM_ID,
      programVersion: customer.programVersion || PROGRAM_VERSION,
      actor: { type: 'staff', authUid: actor.uid },
      occurredAt: Timestamp.fromDate(occurred),
      recordedAt: FieldValue.serverTimestamp(),
      schemaVersion: SCHEMA_VERSION,
    })
    transaction.create(activityRef, {
      id: ledgerId,
      kind: 'points_adjustment',
      title: reason,
      store: 'Admin adjustment',
      amountCents: 0,
      amount: 0,
      points: deltaPoints,
      type: 'Adjustment',
      date: activityDate(occurred),
      occurredAt: Timestamp.fromDate(occurred),
      createdAt: FieldValue.serverTimestamp(),
      schemaVersion: SCHEMA_VERSION,
    })
    transaction.create(auditRef, {
      action: 'loyalty.points_adjusted',
      actor: { type: 'staff', authUid: actor.uid },
      subject: { type: 'customer', id: customer.customerId, authUid: customerUid },
      metadata: { deltaPoints, reason, countsTowardTier, ledgerEntryId: ledgerId },
      occurredAt: FieldValue.serverTimestamp(),
      schemaVersion: SCHEMA_VERSION,
    })
    return { ok: true, points: balanceAfter, lifetimePoints, tier, ledgerEntryId: ledgerId }
  })
}

