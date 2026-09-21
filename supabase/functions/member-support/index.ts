import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { readLimitedBody } from '../_shared/pos-contract.mjs'

const allowedOrigins = new Set(['https://pearl-energy-rewards.vercel.app', 'http://localhost:5173', 'http://127.0.0.1:5173'])
Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin') || ''
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' }
  if (allowedOrigins.has(origin)) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' })
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
  if (origin && !allowedOrigins.has(origin)) return reply({ error: 'Origin not allowed' }, 403)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405)
  const authorization = request.headers.get('authorization') || ''
  if (!authorization.startsWith('Bearer ')) return reply({ error: 'Sign in as a main administrator' }, 401)
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: identity, error: identityError } = await caller.auth.getUser(authorization.slice(7))
  if (identityError || !identity.user) return reply({ error: 'Sign in again' }, 401)
  let input
  try {
    input = JSON.parse(await readLimitedBody(request, 2048))
    if (!input || Object.keys(input).some(key => !['customerId', 'requestId'].includes(key)) || ![input.customerId, input.requestId].every(value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))) throw new Error('Invalid input')
  } catch { return reply({ error: 'Provide a customer ID and request ID only' }, 400) }
  // The live database role check chooses the destination. No caller-supplied email,
  // redirect, new password, recovery token, or permission claim is accepted.
  const { data: claim, error } = await caller.rpc('begin_member_recovery', { p_customer_id: input.customerId, p_request_id: input.requestId })
  if (error) return reply({ error: error.code === '42501' ? 'Main-admin access required' : error.message }, error.code === '42501' ? 403 : 422)
  if (!claim.shouldSend) return reply({ requestId: claim.requestId, state: claim.state }, claim.state === 'pending' ? 202 : 200)
  const service = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false, flowType: 'implicit' } })
  const { error: sendError } = await service.auth.resetPasswordForEmail(claim.email, { redirectTo: 'https://pearl-energy-rewards.vercel.app/recovery.html' })
  const finish = await service.rpc('finish_member_recovery', { p_request_id: claim.requestId, p_success: !sendError, p_error_code: sendError?.code || null })
  if (finish.error) return reply({ requestId: claim.requestId, state: 'pending', error: 'The email outcome is uncertain. Do not repeatedly resend.' }, 503)
  if (sendError) return reply({ requestId: claim.requestId, state: 'failed', error: 'The email service did not accept the reset request. Check Auth email configuration and rate limits.' }, 503)
  return reply({ requestId: claim.requestId, state: 'sent', message: 'Reset email requested for the existing verified email address. Delivery is not guaranteed.' })
})
