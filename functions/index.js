// Pearl Energy Rewards — wallet pass backend (Cloud Functions + Express).
// Deploy with `firebase deploy --only functions`, then set the app's
// VITE_WALLET_API_URL to the deployed URL. Endpoints return a { url } that the
// app opens (an Apple .pkpass download, a Google Wallet save link, etc.).
//
// The three handlers below are STUBS with the exact integration steps to fill in.
// They need your developer certificates/keys (Apple PassKit, Google Wallet API),
// which is why they're scaffolded rather than completed.

import express from 'express'
import cors from 'cors'
import { onRequest } from 'firebase-functions/v2/https'

const app = express()
app.use(cors({ origin: true }))
app.use(express.json())

function requireFields(body, res) {
  if (!body?.membershipId || !body?.customerNumber) {
    res.status(400).json({ error: 'membershipId and customerNumber are required' })
    return false
  }
  return true
}

// ---- Apple Wallet (.pkpass) ------------------------------------------------
// TODO: build & sign a .pkpass with your Pass Type ID + signing certificate.
//   1) Create a Pass Type ID + certificate in the Apple Developer portal.
//   2) Use a library like `passkit-generator` to assemble pass.json (storeCard),
//      embed the QR (member.qrData) as the barcode, and sign with your cert.
//   3) Upload the .pkpass to storage and return its public URL below.
app.post('/passes/apple', (req, res) => {
  if (!requireFields(req.body, res)) return
  res.json({ url: null, todo: 'Generate and sign a .pkpass for ' + req.body.membershipId })
})

// ---- Google Wallet ---------------------------------------------------------
// TODO: create a Generic/Loyalty class + object via the Google Wallet API and
//   return a "Save to Google Wallet" JWT link:
//   https://pay.google.com/gp/v/save/<signedJwt>
app.post('/passes/google', (req, res) => {
  if (!requireFields(req.body, res)) return
  res.json({ url: null, todo: 'Return a Google Wallet save link for ' + req.body.membershipId })
})

// ---- Samsung Wallet --------------------------------------------------------
// TODO: use the Samsung Wallet "Add to Wallet" partner API / card data JWT.
app.post('/passes/samsung', (req, res) => {
  if (!requireFields(req.body, res)) return
  res.json({ url: null, todo: 'Return a Samsung Wallet link for ' + req.body.membershipId })
})

app.get('/', (_req, res) => res.json({ service: 'pearl-energy passes', status: 'ok' }))

export const api = onRequest(app)
