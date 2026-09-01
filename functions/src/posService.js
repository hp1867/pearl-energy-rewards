import { createHmac, timingSafeEqual } from 'node:crypto'
import express from 'express'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { db } from './firebase.js'
import {
  COLLECTIONS, POS_CONTRACT_VERSION, PROGRAM_ID, PROGRAM_VERSION, SCHEMA_VERSION,
  TENANT_ID,
} from './constants.js'
import {
  calculatePointsDelta, canonicalizePosEvent, defaultProgram, normalizeMembershipCode,
  stableHash, tierForLifetimePoints, ValidationError,
} from './domain.js'

const MAX_CLOCK_SKEW_SECONDS = 5 * 60
const EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000
const IDEMPOTENCY_RETENTION_MS = 400 * 24 * 60 * 60 * 1000
const OUTBOX_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

function safeEqualHex(actual, expected) {
  if (!/^[a-f0-9]{64}$/.test(actual) || !/^[a-f0-9]{64}$/.test(expected)) return false
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
}

function verifyRequest(req, secret) {
  if (!secret) throw Object.assign(new Error('POS integration secret is not configured'), { status: 503 })
  const timestampText = String(req.get('x-pearl-timestamp') || '')
  const timestamp = Number(timestampText)
  if (!Number.isSafeInteger(timestamp)) throw Object.assign(new Error('Invalid POS timestamp'), { status: 401 })
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS) {
    throw Object.assign(new Error('POS timestamp is outside the allowed window'), { status: 401 })
  }

  const presented = String(req.get('x-pearl-signature') || '').replace(/^sha256=/i, '').toLowerCase()
  const rawBody = Buffer.isBuffer(req.rawBody)
    ? req.rawBody
    : (Buffer.isBuffer(req.pearlRawBody) ? req.pearlRawBody : Buffer.from(JSON.stringify(req.body || {})))
  const expected = createHmac('sha256', secret)
    .update(timestampText)
    .update('.')
    .update(rawBody)
    .digest('hex')
  if (!safeEqualHex(presented, expected)) {
    throw Object.assign(new Error('Invalid POS signature'), { status: 401 })
  }
  return { rawBody, rawPayloadHash: stableHash(rawBody) }
}

function isoDate(date) {
  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney',
  }).format(date)
}

function duplicateResult(data) {
  return { ...(data.result || data), ok: true, duplicate: true }
}

async function processPosEvent(event, rawPayloadHash) {
  const eventDocumentId = stableHash(`${event.provider}|${event.eventId}`)
  const operationKey = [
    event.provider, event.eventType, event.externalTransactionId,
    event.originalExternalTransactionId || '',
  ].join('|')
  const idempotencyDocumentId = stableHash(operationKey)
  const transactionId = stableHash(`${TENANT_ID}|${operationKey}`)
  const ledgerId = stableHash(`pos-ledger|${idempotencyDocumentId}`)
  const outboxId = stableHash(`pos-outbox|${idempotencyDocumentId}`)
  const occurredAt = Timestamp.fromDate(event.occurredAt)
  const now = Date.now()

  return db.runTransaction(async (transaction) => {
    const eventRef = db.collection(COLLECTIONS.integrationEvents).doc(eventDocumentId)
    const idempotencyRef = db.collection(COLLECTIONS.idempotencyKeys).doc(idempotencyDocumentId)
    const saleRef = db.collection(COLLECTIONS.transactions).doc(transactionId)
    const eventSnap = await transaction.get(eventRef)
    const idempotencySnap = await transaction.get(idempotencyRef)
    const saleSnap = await transaction.get(saleRef)

    if (eventSnap.exists) return duplicateResult(eventSnap.data())
    if (idempotencySnap.exists) return duplicateResult(idempotencySnap.data())
    if (saleSnap.exists) return duplicateResult(saleSnap.data())

    let customer = null
    let account = null
    if (event.membershipCode) {
      const membershipRef = db.collection(COLLECTIONS.membershipCodes)
        .doc(normalizeMembershipCode(event.membershipCode))
      const membershipSnap = await transaction.get(membershipRef)
      if (membershipSnap.exists && membershipSnap.data().status === 'active') {
        const link = membershipSnap.data()
        const customerRef = db.collection(COLLECTIONS.customers).doc(link.customerUid)
        const accountRef = db.collection(COLLECTIONS.loyaltyAccounts).doc(link.loyaltyAccountId)
        const customerSnap = await transaction.get(customerRef)
        const accountSnap = await transaction.get(accountRef)
        if (customerSnap.exists && accountSnap.exists) {
          customer = { ref: customerRef, ...customerSnap.data() }
          account = { ref: accountRef, ...accountSnap.data() }
        }
      }
    }

    const programRef = db.collection(COLLECTIONS.loyaltyPrograms).doc(PROGRAM_ID)
    const programSnap = await transaction.get(programRef)
    const program = programSnap.exists ? programSnap.data() : defaultProgram()
    const { eligibleCents, pointsDelta: computedDelta } = calculatePointsDelta(event, program)
    const pointsDelta = customer ? computedDelta : 0
    const balanceBefore = account?.balancePoints ?? null
    const balanceAfter = account ? account.balancePoints + pointsDelta : null
    const result = {
      ok: true,
      duplicate: false,
      transactionId,
      customerMatched: Boolean(customer),
      pointsDelta,
      balanceAfter,
    }

    const transactionData = {
      transactionId,
      tenantId: TENANT_ID,
      customerId: customer?.customerId || null,
      customerUid: customer?.uid || null,
      loyaltyAccountId: customer?.loyaltyAccountId || null,
      eventType: event.eventType,
      status: 'committed',
      businessDate: event.businessDate,
      storeId: event.storeId,
      terminalId: event.terminalId,
      receiptNumber: event.receiptNumber,
      currency: event.currency,
      subtotalCents: event.subtotalCents,
      taxCents: event.taxCents,
      totalCents: event.totalCents,
      eligibleCents,
      pointsDelta,
      itemCount: event.items.length,
      payments: event.payments,
      originalExternalTransactionId: event.originalExternalTransactionId,
      source: {
        provider: event.provider,
        eventId: event.eventId,
        externalTransactionId: event.externalTransactionId,
        rawPayloadHash,
        contractVersion: event.contractVersion,
      },
      occurredAt,
      receivedAt: FieldValue.serverTimestamp(),
      schemaVersion: SCHEMA_VERSION,
      result,
    }

    transaction.create(saleRef, transactionData)
    event.items.forEach((item) => {
      const lineDocumentId = stableHash(`${transactionId}|${item.lineId}`)
      transaction.create(saleRef.collection('items').doc(lineDocumentId), {
        ...item,
        transactionId,
        customerId: customer?.customerId || null,
        occurredAt,
        schemaVersion: SCHEMA_VERSION,
      })
    })
    transaction.create(eventRef, {
      eventDocumentId,
      tenantId: TENANT_ID,
      status: 'processed',
      source: {
        provider: event.provider,
        eventId: event.eventId,
        rawPayloadHash,
        contractVersion: event.contractVersion,
      },
      transactionId,
      result,
      receivedAt: FieldValue.serverTimestamp(),
      processedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(now + EVENT_RETENTION_MS),
      schemaVersion: SCHEMA_VERSION,
    })
    transaction.create(idempotencyRef, {
      keyHash: idempotencyDocumentId,
      operation: 'pos.transaction',
      transactionId,
      result,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(now + IDEMPOTENCY_RETENTION_MS),
      schemaVersion: SCHEMA_VERSION,
    })

    if (customer && account) {
      const lifetimeBefore = customer.lifetimePoints || 0
      const lifetimeAfter = event.eventType === 'sale'
        ? lifetimeBefore + Math.max(0, pointsDelta)
        : Math.max(0, lifetimeBefore + Math.min(0, pointsDelta))
      const tier = tierForLifetimePoints(lifetimeAfter)
      const ledgerRef = db.collection(COLLECTIONS.loyaltyLedger).doc(ledgerId)
      const activityRef = customer.ref.collection('activity').doc(ledgerId)

      transaction.update(account.ref, {
        balancePoints: balanceAfter,
        availablePoints: balanceAfter,
        lifetimeEarnedPoints: event.eventType === 'sale'
          ? (account.lifetimeEarnedPoints || 0) + Math.max(0, pointsDelta)
          : Math.max(0, (account.lifetimeEarnedPoints || 0) + Math.min(0, pointsDelta)),
        version: (account.version || 0) + 1,
        updatedAt: FieldValue.serverTimestamp(),
      })
      transaction.update(customer.ref, {
        points: balanceAfter,
        availablePoints: balanceAfter,
        lifetimePoints: lifetimeAfter,
        tier,
        updatedAt: FieldValue.serverTimestamp(),
      })
      transaction.create(ledgerRef, {
        entryId: ledgerId,
        tenantId: TENANT_ID,
        customerId: customer.customerId,
        customerUid: customer.uid,
        loyaltyAccountId: customer.loyaltyAccountId,
        entryType: event.eventType === 'sale' ? 'earn' : 'refund',
        status: 'committed',
        deltaPoints: pointsDelta,
        balanceBefore,
        balanceAfter,
        transactionId,
        causationId: event.eventId,
        correlationId: event.externalTransactionId,
        programId: program.programId || PROGRAM_ID,
        programVersion: program.version || PROGRAM_VERSION,
        actor: { type: 'pos', provider: event.provider, storeId: event.storeId },
        occurredAt,
        recordedAt: FieldValue.serverTimestamp(),
        schemaVersion: SCHEMA_VERSION,
      })
      transaction.create(activityRef, {
        id: ledgerId,
        transactionId,
        kind: event.eventType === 'sale' ? 'purchase' : 'refund',
        title: event.eventType === 'sale' ? 'Purchase' : 'Refund',
        store: event.storeId,
        amountCents: event.eventType === 'sale' ? event.totalCents : -event.totalCents,
        amount: (event.eventType === 'sale' ? event.totalCents : -event.totalCents) / 100,
        points: pointsDelta,
        type: event.items.some((item) => item.fuel) ? 'Fuel + Store' : 'Store',
        date: isoDate(event.occurredAt),
        occurredAt,
        createdAt: FieldValue.serverTimestamp(),
        schemaVersion: SCHEMA_VERSION,
      })
      transaction.create(db.collection(COLLECTIONS.outbox).doc(outboxId), {
        type: 'loyalty.balance_changed',
        aggregateType: 'loyaltyAccount',
        aggregateId: customer.loyaltyAccountId,
        customerUid: customer.uid,
        status: 'pending',
        attempts: 0,
        payload: { transactionId, ledgerEntryId: ledgerId, pointsDelta, balanceAfter },
        availableAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(now + OUTBOX_RETENTION_MS),
        schemaVersion: SCHEMA_VERSION,
      })
    }

    return result
  })
}

export function createPosApp(secretParameter) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({
    limit: '256kb',
    verify: (req, _res, buffer) => { req.pearlRawBody = Buffer.from(buffer) },
  }))

  app.post('/v1/pos/transactions', async (req, res) => {
    try {
      const contractVersion = Number(req.get('x-pearl-contract-version'))
      if (contractVersion !== POS_CONTRACT_VERSION) {
        return res.status(400).json({ error: 'unsupported_contract_version', supported: POS_CONTRACT_VERSION })
      }
      const provider = String(req.get('x-pearl-pos-provider') || 'generic')
      const verified = verifyRequest(req, secretParameter.value())
      const event = canonicalizePosEvent(req.body, provider)
      const result = await processPosEvent(event, verified.rawPayloadHash)
      return res.status(result.duplicate ? 200 : 201).json(result)
    } catch (error) {
      const status = error.status || (error instanceof ValidationError ? 400 : 500)
      if (status >= 500) logger.error('POS transaction ingestion failed', error)
      else logger.warn('POS transaction rejected', { message: error.message, field: error.field || null })
      return res.status(status).json({
        error: status >= 500 ? 'internal_error' : 'invalid_request',
        message: error.message,
        field: error.field || undefined,
      })
    }
  })

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'pearl-pos-ingestion', contractVersion: 1 }))
  return app
}

export { processPosEvent, verifyRequest }

