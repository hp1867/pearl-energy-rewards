import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseSettings } from './settings'
const { url, key, configured } = resolveSupabaseSettings(import.meta.env)
export const isSupabaseConfigured = configured
/** @type {import('@supabase/supabase-js').SupabaseClient<import('./database.types').Database> | null} */
export const supabase = isSupabaseConfigured ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'pearl-supabase-auth' },
}) : null
export function requireSupabase() {
  if (!supabase) throw new Error('Supabase setup is incomplete. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then restart or rebuild. Never use a secret key here.')
  return supabase
}
export const authRedirect = () => `${window.location.origin}/`

let optionsPromise
export function getAuthOptions({ force = false } = {}) {
  requireSupabase()
  if (force) optionsPromise = null
  optionsPromise ||= fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, signal: AbortSignal.timeout(10000) })
    .then(async response => {
      if (!response.ok) throw new Error('Could not load sign-in options. Please retry.')
      const settings = await response.json()
      return { google: settings.external?.google === true, apple: settings.external?.apple === true, email: settings.external?.email === true, phone: settings.external?.phone === true }
    }).catch(error => { optionsPromise = null; throw error })
  return optionsPromise
}
