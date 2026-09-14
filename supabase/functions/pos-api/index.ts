import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { canonicalizePosEvent, normalizeMembership, PosError, readLimitedBody, semanticHash, verifyPosSignature } from '../_shared/pos-contract.mjs'

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

Deno.serve(async (request: Request) => {
  const requestId = crypto.randomUUID()
  try {
    const path = new URL(request.url).pathname.replace(/\/$/, '')
    const lookup = path.endsWith('/v1/pos/member')
    if (!lookup && !path.endsWith('/v1/pos/transactions')) return reply({ error: 'Not found' }, 404)
    if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405)
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new PosError('Use application/json', 415)
    if (request.headers.get('x-pearl-contract-version') !== '1') throw new PosError('Unsupported contract version')
    const keys = JSON.parse(Deno.env.get('POS_SIGNING_KEYS') || '{}')
    const keyId = request.headers.get('x-pearl-key-id') || ''
    const key = Object.hasOwn(keys, keyId) ? keys[keyId] : null
    if (!key?.integrationId || !key?.provider) throw new PosError('Unknown POS key', 401)
    const rawBody = await readLimitedBody(request)
    await verifyPosSignature({ keyId, secret: key.secret, rawBody,
      timestamp: request.headers.get('x-pearl-timestamp'), signature: request.headers.get('x-pearl-signature') })
    let input
    try { input = JSON.parse(rawBody) } catch { throw new PosError('Invalid JSON') }
    const url = Deno.env.get('SUPABASE_URL'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !serviceKey) throw new PosError('Backend is not configured', 503)
    const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    if (lookup && (!input?.membershipCode || Object.keys(input).some(name => name !== 'membershipCode'))) throw new PosError('Member lookup accepts only membershipCode')
    const event = lookup ? null : canonicalizePosEvent(input, key.provider)
    const { data, error } = lookup
      ? await client.rpc('pos_member', { p_integration_id: key.integrationId, p_membership_code: normalizeMembership(input.membershipCode) })
      : await client.rpc('record_pos', { p_integration_id: key.integrationId, p_event: event, p_payload_hash: await semanticHash(event) })
    if (error) {
      if (error.code === '23505') return reply({ error: 'Conflicting event or transaction ID', requestId }, 409)
      if (error.code === '42501') return reply({ error: 'Integration not authorised', requestId }, 403)
      if (error.code === 'P0001') return reply({ error: error.message, requestId }, 422)
      if (error.code?.startsWith('22') || error.code?.startsWith('23')) return reply({ error: 'Receipt failed database validation', requestId }, 422)
      // Never log request bodies, membership IDs, tokens, or signing secrets.
      console.error('POS database failure', { requestId, code: error.code })
      return reply({ error: 'Unable to record receipt. Retry with the same IDs.', requestId }, 503)
    }
    return reply({ ...data, requestId })
  } catch (error) {
    if (error instanceof PosError) return reply({ error: error.message, requestId }, error.status)
    console.error('POS gateway failure', { requestId })
    return reply({ error: 'Unable to process request', requestId }, 500)
  }
})
