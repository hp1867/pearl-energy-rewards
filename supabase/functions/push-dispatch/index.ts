import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import webpush from 'npm:web-push@3.6.7'
import { timingSafeEqual } from 'node:crypto'

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type':'application/json','Cache-Control':'no-store' } })
Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return reply({ error:'Method not allowed' },405)
  const secret = Deno.env.get('PUSH_WORKER_SECRET') || ''
  if (secret.length < 32) return reply({ error:'Worker is not configured' },503)
  const incoming = new TextEncoder().encode(request.headers.get('authorization') || '')
  const expected = new TextEncoder().encode(`Bearer ${secret}`)
  if (incoming.length !== expected.length || !timingSafeEqual(incoming,expected)) return reply({ error:'Unauthorised' },401)
  const publicKey=Deno.env.get('WEB_PUSH_PUBLIC_KEY'),privateKey=Deno.env.get('WEB_PUSH_PRIVATE_KEY'),subject=Deno.env.get('WEB_PUSH_SUBJECT')
  if (!publicKey || !privateKey || !subject) return reply({ error:'Web Push is not configured' },503)
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{ auth:{ persistSession:false,autoRefreshToken:false } })
  const { data:batch,error }=await client.rpc('claim_push_batch')
  if (error) return reply({ error:'Queue unavailable' },503)
  webpush.setVapidDetails(subject,publicKey,privateKey)
  let sent=0,failed=0
  for (const delivery of batch || []) {
    let success=false,gone=false
    try {
      const endpoint=new URL(delivery.subscription.endpoint)
      if (endpoint.protocol!=='https:' || !/^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com)$/.test(endpoint.hostname)) throw new Error('Unsupported endpoint')
      await webpush.sendNotification(delivery.subscription,JSON.stringify({ id:delivery.notificationId,body:delivery.body }),{ TTL:3600,timeout:5000 })
      success=true;sent++
    } catch (error) {
      const status = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 0
      gone=[404,410].includes(status);failed++
    }
    const result=await client.rpc('finish_push',{ p_id:delivery.id,p_attempt:delivery.attempt,p_success:success,p_gone:gone })
    if (result.error) return reply({ error:'Delivery acknowledgement failed; queue will retry' },503)
  }
  return reply({ sent,failed })
})
