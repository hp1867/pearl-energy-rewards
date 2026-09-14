import { createClient } from '@supabase/supabase-js'
const env = import.meta.env
const url = String(env.VITE_SUPABASE_URL || '').trim()
const key = String(env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim()
// Never allow a secret/service-role key in the browser.
let publicKey = key.startsWith('sb_publishable_')
if (key.startsWith('eyJ')) {
  try { publicKey = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon' } catch { publicKey = false }
}
export const isSupabaseConfigured = publicKey && (/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || /^http:\/\/(localhost|127\.0\.0\.1):54321$/.test(url))
/** @type {import('@supabase/supabase-js').SupabaseClient<import('./database.types').Database> | null} */
export const supabase = isSupabaseConfigured ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'pearl-supabase-auth' },
}) : null
export function requireSupabase() {
  if (!supabase) throw new Error('Supabase setup is incomplete. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then restart or rebuild. Never use a secret key here.')
  return supabase
}
export const authRedirect = () => `${window.location.origin}/`
