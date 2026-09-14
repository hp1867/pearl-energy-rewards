// Wallet passes require a separately configured, authenticated issuer.
// Missing configuration is an error, never a fabricated successful pass.
import { requireSupabase } from '../supabase/client'
import { integrations } from '../config/integrations'

const LABEL = { apple: 'Apple Wallet', google: 'Google Wallet', samsung: 'Samsung Wallet' }

export async function addToWallet(platform, member) {
  const label = LABEL[platform] || 'Wallet'
  if (!integrations.wallet.ready) {
    return { ok: false, message: `${label}: pass issuer is not configured yet` }
  }
  try {
    const { data: { session } } = await requireSupabase().auth.getSession()
    if (!session) return { ok: false, message: 'Please sign in first' }
    const res = await fetch(`${integrations.wallet.apiUrl}/passes/${platform}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ platform }), // Issuer verifies the JWT and loads the member server-side.
    })
    if (!res.ok) return { ok: false, message: `Could not create ${label} pass` }
    const data = await res.json()
    if (!data.url || !String(data.url).startsWith('https://')) return { ok: false, message: 'The issuer did not return a valid pass URL' }
    window.open(data.url, '_blank', 'noopener,noreferrer')   // .pkpass download / Google save link
    return { ok: true, message: `Opening your ${label} pass…` }
  } catch {
    return { ok: false, message: `Could not reach the pass service` }
  }
}
