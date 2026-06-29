// Wallet passes — calls the pass backend (functions/) when configured,
// otherwise returns a friendly demo message. Same call for Apple/Google/Samsung.
import { integrations } from '../config/integrations'

const LABEL = { apple: 'Apple Wallet', google: 'Google Wallet', samsung: 'Samsung Wallet' }

export async function addToWallet(platform, member) {
  const label = LABEL[platform] || 'Wallet'
  if (!integrations.wallet.ready) {
    return { ok: false, demo: true, message: `${label}: demo only — connect the pass backend to issue real passes` }
  }
  try {
    const res = await fetch(`${integrations.wallet.apiUrl}/passes/${platform}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerNumber: member.customerNumber,
        membershipId: member.membershipId,
        name: member.name,
        points: member.points,
        tier: member.tier,
        qrData: member.qrData,
      }),
    })
    if (!res.ok) return { ok: false, message: `Could not create ${label} pass` }
    const data = await res.json()
    if (data.url) window.open(data.url, '_blank')   // .pkpass download / Google save link
    return { ok: true, message: `Opening your ${label} pass…` }
  } catch {
    return { ok: false, message: `Could not reach the pass service` }
  }
}
