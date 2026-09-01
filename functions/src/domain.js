import { createHash, randomInt, randomUUID } from 'node:crypto'
import { POS_CONTRACT_VERSION, PROGRAM_ID, PROGRAM_VERSION } from './constants.js'

const MEMBER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const FORBIDDEN_PAYMENT_KEYS = new Set([
  'accountnumber', 'cardnumber', 'cardtoken', 'cvv', 'cvc', 'expiry', 'magstripe',
  'pan', 'pin', 'track1', 'track2', 'trackdata', 'paymenttoken',
])

export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
  }
}

export function stableHash(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

export function randomDocumentId(prefix = '') {
  return `${prefix}${randomUUID().replaceAll('-', '')}`
}

export function normalizeMembershipCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function generateCustomerNumber() {
  return String(randomInt(10_000_000, 100_000_000))
}

function memberBlock() {
  let value = ''
  for (let i = 0; i < 4; i += 1) value += MEMBER_ALPHABET[randomInt(0, MEMBER_ALPHABET.length)]
  return value
}

export function generateMembershipId() {
  return `PE-${memberBlock()}-${memberBlock()}-${memberBlock()}`
}

export function buildQrData(membershipId) {
  // This is an identifier, not proof of entitlement. POS must validate it server-side.
  return `PEARL|1|${membershipId}`
}

export function tierForLifetimePoints(value) {
  const points = Math.max(0, Number.isSafeInteger(value) ? value : 0)
  if (points >= 10_000) return 'Immortal'
  if (points >= 5_000) return 'Diamond'
  if (points >= 2_500) return 'Gold'
  if (points >= 1_000) return 'Silver'
  return 'Blue'
}

function requireString(value, field, maxLength = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new ValidationError(`${field} must be a non-empty string up to ${maxLength} characters`, field)
  }
  return value.trim()
}

function optionalString(value, field, maxLength = 200) {
  if (value == null || value === '') return null
  return requireString(value, field, maxLength)
}

function requireInteger(value, field, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${field} must be an integer between ${min} and ${max}`, field)
  }
  return value
}

function rejectSensitivePaymentData(value, path = 'request') {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (FORBIDDEN_PAYMENT_KEYS.has(normalized)) {
      throw new ValidationError(`Sensitive payment field '${path}.${key}' is not accepted`, `${path}.${key}`)
    }
    if (typeof child === 'object') rejectSensitivePaymentData(child, `${path}.${key}`)
  }
}

function parseIsoTimestamp(value, field) {
  const text = requireString(value, field, 40)
  const ms = Date.parse(text)
  if (!Number.isFinite(ms)) throw new ValidationError(`${field} must be an ISO-8601 timestamp`, field)
  return new Date(ms)
}

function canonicalizeLine(item, index) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new ValidationError(`items[${index}] must be an object`, `items[${index}]`)
  }
  const lineId = requireString(item.lineId, `items[${index}].lineId`, 80)
  const totalCents = requireInteger(item.totalCents, `items[${index}].totalCents`, { min: 0, max: 100_000_000 })
  const quantityMilli = requireInteger(item.quantityMilli ?? 1000, `items[${index}].quantityMilli`, { min: 0, max: 1_000_000_000 })
  const unitPriceMicros = requireInteger(item.unitPriceMicros ?? 0, `items[${index}].unitPriceMicros`, { min: 0, max: 10_000_000_000 })
  const fuel = item.fuel == null ? null : {
    gradeCode: requireString(item.fuel.gradeCode, `items[${index}].fuel.gradeCode`, 32),
    litresMilli: requireInteger(item.fuel.litresMilli, `items[${index}].fuel.litresMilli`, { min: 0, max: 1_000_000_000 }),
  }
  return {
    lineId,
    sku: optionalString(item.sku, `items[${index}].sku`, 100),
    description: requireString(item.description, `items[${index}].description`, 240),
    category: requireString(item.category, `items[${index}].category`, 80).toLowerCase(),
    quantityMilli,
    unitPriceMicros,
    totalCents,
    eligibleForPoints: item.eligibleForPoints !== false,
    fuel,
  }
}

export function canonicalizePosEvent(input, provider = 'generic') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Request body must be a JSON object')
  }
  rejectSensitivePaymentData(input)

  const eventType = requireString(input.eventType, 'eventType', 20).toLowerCase()
  if (!['sale', 'refund', 'void'].includes(eventType)) {
    throw new ValidationError('eventType must be sale, refund, or void', 'eventType')
  }
  const originalExternalTransactionId = optionalString(
    input.originalExternalTransactionId,
    'originalExternalTransactionId',
    160,
  )
  if (eventType !== 'sale' && !originalExternalTransactionId) {
    throw new ValidationError('Refunds and voids require originalExternalTransactionId', 'originalExternalTransactionId')
  }

  const businessDate = requireString(input.businessDate, 'businessDate', 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new ValidationError('businessDate must use YYYY-MM-DD', 'businessDate')
  }
  const currency = requireString(input.currency, 'currency', 3).toUpperCase()
  if (currency !== 'AUD') throw new ValidationError('Only AUD is currently supported', 'currency')

  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 200) {
    throw new ValidationError('items must contain between 1 and 200 receipt lines', 'items')
  }
  const items = input.items.map(canonicalizeLine)
  const lineIds = new Set(items.map((item) => item.lineId))
  if (lineIds.size !== items.length) throw new ValidationError('Each receipt lineId must be unique', 'items')

  const subtotalCents = requireInteger(input.subtotalCents, 'subtotalCents', { min: 0, max: 100_000_000 })
  const taxCents = requireInteger(input.taxCents ?? 0, 'taxCents', { min: 0, max: 100_000_000 })
  const totalCents = requireInteger(input.totalCents, 'totalCents', { min: 0, max: 100_000_000 })
  const lineTotal = items.reduce((sum, item) => sum + item.totalCents, 0)
  if (Math.abs(lineTotal - totalCents) > 2) {
    throw new ValidationError('Receipt line totals must equal totalCents within two cents', 'totalCents')
  }

  const paymentsInput = input.payments ?? []
  if (!Array.isArray(paymentsInput) || paymentsInput.length > 10) {
    throw new ValidationError('payments must be an array with at most 10 entries', 'payments')
  }
  const payments = paymentsInput.map((payment, index) => ({
    method: requireString(payment.method, `payments[${index}].method`, 40).toLowerCase(),
    amountCents: requireInteger(payment.amountCents, `payments[${index}].amountCents`, { min: 0, max: 100_000_000 }),
  }))

  return {
    contractVersion: POS_CONTRACT_VERSION,
    provider: requireString(provider, 'provider', 80).toLowerCase(),
    eventId: requireString(input.eventId, 'eventId', 160),
    eventType,
    occurredAt: parseIsoTimestamp(input.occurredAt, 'occurredAt'),
    externalTransactionId: requireString(input.externalTransactionId, 'externalTransactionId', 160),
    originalExternalTransactionId,
    businessDate,
    storeId: requireString(input.storeId, 'storeId', 100),
    terminalId: requireString(input.terminalId, 'terminalId', 100),
    receiptNumber: requireString(input.receiptNumber, 'receiptNumber', 100),
    currency,
    subtotalCents,
    taxCents,
    totalCents,
    membershipCode: input.membershipCode ? normalizeMembershipCode(input.membershipCode) : null,
    items,
    payments,
  }
}

export function calculatePointsDelta(event, program = {}) {
  const excluded = new Set((program.excludedCategories || []).map((value) => String(value).toLowerCase()))
  const eligibleCents = event.items
    .filter((item) => item.eligibleForPoints && !excluded.has(item.category))
    .reduce((sum, item) => sum + item.totalCents, 0)
  const numerator = Number.isSafeInteger(program.pointsNumerator) ? program.pointsNumerator : 1
  const denominator = Number.isSafeInteger(program.pointsDenominator) && program.pointsDenominator > 0
    ? program.pointsDenominator
    : 1
  const absolutePoints = Math.floor((eligibleCents * numerator) / (100 * denominator))
  const sign = event.eventType === 'sale' ? 1 : -1
  return { eligibleCents, pointsDelta: sign * absolutePoints }
}

export function defaultProgram() {
  return {
    programId: PROGRAM_ID,
    version: PROGRAM_VERSION,
    pointsNumerator: 1,
    pointsDenominator: 1,
    excludedCategories: ['tobacco', 'lottery', 'gift-card', 'cash-out'],
  }
}

