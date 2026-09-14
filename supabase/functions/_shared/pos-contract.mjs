// Shared by the Edge Function and Node contract tests. No Firebase dependency.
const sensitive = new Set(['accountnumber','cardnumber','cardtoken','cvv','cvc','expiry','magstripe','pan','pin','track1','track2','trackdata','paymenttoken'])
export class PosError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}
const string = (value, field, max = 160) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new PosError(`Invalid ${field}`)
  return value.trim()
}
const integer = (value, field, max = 100_000_000, min = 0) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new PosError(`Invalid ${field}`)
  return value
}
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const object = (value, field) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PosError(`Invalid ${field}`)
  return value
}
function rejectSensitive(value, depth = 0) {
  if (depth > 15) throw new PosError('Payload is nested too deeply')
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (sensitive.has(key.toLowerCase().replace(/[^a-z0-9]/g, ''))) throw new PosError('Card credentials and payment tokens must not be sent to the loyalty API')
    rejectSensitive(child, depth + 1)
  }
}
export function normalizeMembership(value) {
  if (!value) return null
  let code = string(value, 'membershipCode', 160).toUpperCase()
  if (code.startsWith('PEARL|1|')) code = code.slice(8)
  // Legacy demo QR payloads include client-supplied balances. They are not live identities.
  if (code.includes('|') || !/^[A-Z0-9-]+$/.test(code)) throw new PosError('Unsupported membership code')
  return code.replaceAll('-', '')
}
export function canonicalizePosEvent(input, provider) {
  rejectSensitive(input)
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PosError('Expected a JSON object')
  const eventType = string(input.eventType, 'eventType', 10).toLowerCase()
  if (!['sale','refund','void'].includes(eventType)) throw new PosError('Unsupported event type')
  if (input.contractVersion != null && input.contractVersion !== 1) throw new PosError('Unsupported contract version')
  const businessDate = string(input.businessDate, 'businessDate', 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate) || !Number.isFinite(Date.parse(businessDate)) || new Date(businessDate).toISOString().slice(0, 10) !== businessDate) throw new PosError('Invalid business date')
  const timestamp = string(input.occurredAt, 'occurredAt', 40)
  if (!/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) throw new PosError('occurredAt needs an ISO timestamp with timezone')
  if (Date.parse(timestamp) > Date.now() + 300_000) throw new PosError('Purchase timestamp is in the future')
  if (input.currency !== 'AUD') throw new PosError('Only AUD is supported')
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 200) throw new PosError('Expected 1–200 receipt lines')
  const items = input.items.map((item) => {
    object(item, 'receipt line')
    if (item.fuel != null) object(item.fuel, 'fuel details')
    if (item.eligibleForPoints != null && typeof item.eligibleForPoints !== 'boolean') throw new PosError('Invalid eligibleForPoints')
    return {
    lineId: string(item.lineId, 'lineId', 80),
    originalLineId: item.originalLineId ? string(item.originalLineId, 'originalLineId', 80) : null,
    sku: item.sku ? string(item.sku, 'sku', 100) : null,
    description: string(item.description, 'description', 240), category: string(item.category, 'category', 80).toLowerCase(),
    quantityMilli: integer(item.quantityMilli ?? 1000, 'quantityMilli', 1_000_000_000, 1),
    unitPriceMicros: integer(item.unitPriceMicros ?? 0, 'unitPriceMicros', 10_000_000_000),
    totalCents: integer(item.totalCents, 'line total'), eligibleForPoints: item.eligibleForPoints !== false,
    fuel: item.fuel ? { gradeCode: string(item.fuel.gradeCode, 'fuel grade', 32), litresMilli: integer(item.fuel.litresMilli, 'litresMilli', 1_000_000_000) } : null,
  }})
  if (new Set(items.map(x => x.lineId)).size !== items.length) throw new PosError('Duplicate receipt line ID')
  const totalCents = integer(input.totalCents, 'totalCents')
  if (Math.abs(items.reduce((sum, x) => sum + x.totalCents, 0) - totalCents) > 2) throw new PosError('Receipt line totals do not match')
  if (!Array.isArray(input.payments ?? []) || (input.payments?.length || 0) > 10) throw new PosError('Invalid payments')
  const payments = (input.payments || []).map(x => {
    object(x, 'payment')
    const method = string(x.method, 'payment method', 30).toLowerCase()
    if (!['cash','card','eftpos','credit','debit','voucher','wallet','other'].includes(method)) throw new PosError('Unsupported payment method')
    return { method, amountCents: integer(x.amountCents, 'payment amount') }
  })
  if (payments.length && payments.reduce((s, x) => s + x.amountCents, 0) !== totalCents) throw new PosError('Payment totals do not match')
  if (!Array.isArray(input.couponIds ?? []) || (input.couponIds?.length || 0) > 20) throw new PosError('Invalid coupons')
  const couponIds = (input.couponIds || []).map(x => { if (!uuid(x)) throw new PosError('Invalid coupon ID'); return x })
  if (new Set(couponIds).size !== couponIds.length) throw new PosError('Duplicate coupon ID')
  if (!Array.isArray(input.nightDealSales ?? []) || (input.nightDealSales?.length || 0) > 50) throw new PosError('Invalid night-deal items')
  const nightDealSales = (input.nightDealSales || []).map(x => {
    object(x, 'night-deal item')
    if (!uuid(x.dealId)) throw new PosError('Invalid night-deal ID')
    return { dealId: x.dealId, quantity: integer(x.quantity, 'deal quantity', 100000, 1) }
  })
  if (new Set(nightDealSales.map(x => x.dealId)).size !== nightDealSales.length) throw new PosError('Duplicate night-deal ID')
  const taxCents = integer(input.taxCents ?? 0, 'taxCents')
  if (taxCents > totalCents) throw new PosError('Tax cannot exceed the receipt total')
  return {
    contractVersion: 1, provider: string(provider, 'provider', 80).toLowerCase(),
    eventId: string(input.eventId, 'eventId'), eventType,
    externalTransactionId: string(input.externalTransactionId, 'externalTransactionId'),
    originalExternalTransactionId: eventType === 'sale' ? null : string(input.originalExternalTransactionId, 'originalExternalTransactionId'),
    occurredAt: new Date(timestamp).toISOString(), businessDate,
    storeId: string(input.storeId, 'storeId', 100), terminalId: string(input.terminalId, 'terminalId', 100), receiptNumber: string(input.receiptNumber, 'receiptNumber', 100),
    currency: 'AUD', subtotalCents: integer(input.subtotalCents, 'subtotalCents'), taxCents, totalCents,
    membershipCode: normalizeMembership(input.membershipCode), items, payments, couponIds, nightDealSales,
  }
}
const encoder = new TextEncoder()
export async function semanticHash(event) {
  // Provider event IDs may change on retry; the business operation must not.
  const { eventId, ...businessPayload } = event
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(businessPayload)))
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
}
export async function verifyPosSignature({ keyId, secret, timestamp, signature, rawBody, now = Date.now() }) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(keyId || '') || !/^\d{10}$/.test(timestamp || '') || Math.abs(now / 1000 - Number(timestamp)) > 300) throw new PosError('Invalid or expired POS authentication', 401)
  if (typeof secret !== 'string' || secret.length < 32) throw new PosError('POS signing key is not configured', 503)
  const hex = (signature || '').replace(/^sha256=/, '')
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new PosError('Invalid POS signature', 401)
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const bytes = Uint8Array.from(hex.match(/../g), x => parseInt(x, 16))
  const valid = await crypto.subtle.verify('HMAC', key, bytes, encoder.encode(`v1.${keyId}.${timestamp}.${rawBody}`))
  if (!valid) throw new PosError('Invalid POS signature', 401)
}
export async function readLimitedBody(request, maxBytes = 262144) {
  if (Number(request.headers.get('content-length')) > maxBytes) throw new PosError('Receipt payload is too large', 413)
  const reader = request.body?.getReader()
  if (!reader) throw new PosError('Request body is required')
  const parts = []; let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > maxBytes) { await reader.cancel(); throw new PosError('Receipt payload is too large', 413) }
    parts.push(value)
  }
  const bytes = new Uint8Array(size); let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.length }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { throw new PosError('Request body must be valid UTF-8') }
}
