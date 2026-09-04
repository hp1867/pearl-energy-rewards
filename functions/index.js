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
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { DEFAULT_FUNCTION_REGION } from './src/constants.js'
import { ensureCustomer } from './src/customerService.js'
import { adjustPoints, redeemReward as redeemRewardService } from './src/loyaltyService.js'
import { ValidationError } from './src/domain.js'
import { createPosApp } from './src/posService.js'

const region = process.env.FUNCTION_REGION || DEFAULT_FUNCTION_REGION
const posWebhookSecret = defineSecret('POS_WEBHOOK_SECRET')

const app = express()
// SECURITY: replace origin:true with your real app domain(s) before go-live,
// e.g. cors({ origin: ['https://rewards.pearlenergy.com.au'] })
app.use(cors({ origin: true }))
app.use(express.json())

// SECURITY: before implementing the pass generators below, verify the caller's
// Firebase ID token and make sure it matches the requested membership — otherwise
// anyone could mint wallet passes for other customers' membership IDs:
//   const idToken = req.headers.authorization?.replace('Bearer ', '')
//   const decoded = await getAuth().verifyIdToken(idToken)
//   const snap = await getFirestore().doc(`customers/${decoded.uid}`).get()
//   if (snap.data()?.membershipId !== req.body.membershipId) return res.status(403).end()
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

function callableError(error) {
  if (error instanceof HttpsError) return error
  if (error instanceof ValidationError) {
    return new HttpsError('failed-precondition', error.message, { field: error.field || null })
  }
  console.error(error)
  return new HttpsError('internal', 'The operation could not be completed')
}

export const ensureCustomerProfile = onCall({ region }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in before creating a customer profile')
  try {
    return await ensureCustomer(request.auth, request.data || {})
  } catch (error) {
    throw callableError(error)
  }
})

export const redeemReward = onCall({ region }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in before redeeming a reward')
  try {
    return await redeemRewardService(request.auth.uid, request.data?.rewardId)
  } catch (error) {
    throw callableError(error)
  }
})

export const adminAdjustPoints = onCall({ region }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in before adjusting points')
  if (request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'An admin claim is required')
  }
  try {
    return await adjustPoints(request.auth, request.data || {})
  } catch (error) {
    throw callableError(error)
  }
})

// Main-admin-only role assignment. Branch access is stored in signed Firebase
// custom claims, so a manager cannot grant themselves another station or role.
export const setStaffAccess = onCall({ region }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in before managing staff access')
  if (request.auth.token.admin !== true) throw new HttpsError('permission-denied', 'A main admin claim is required')

  const email = String(request.data?.email || '').trim().toLowerCase()
  const displayName = String(request.data?.displayName || '').trim().slice(0, 120)
  const enabled = request.data?.enabled !== false
  const stationIds = [...new Set((request.data?.stationIds || []).map(String).map((value) => value.trim()).filter(Boolean))]
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new HttpsError('invalid-argument', 'Enter a valid staff email address')
  if (stationIds.length > 20) throw new HttpsError('invalid-argument', 'A manager can be assigned to at most 20 stations')
  if (enabled && stationIds.length === 0) throw new HttpsError('invalid-argument', 'Assign at least one station')

  if (enabled) {
    const stationSnapshots = await Promise.all(stationIds.map((stationId) => db.doc(`stations/${stationId}`).get()))
    if (stationSnapshots.some((snapshot) => !snapshot.exists)) throw new HttpsError('failed-precondition', 'Every assigned station must exist')
  }

  const authAdmin = getAuth()
  let staffUser
  let inviteLink = null
  try {
    staffUser = await authAdmin.getUserByEmail(email)
  } catch (error) {
    if (error.code !== 'auth/user-not-found' || !enabled) throw new HttpsError('not-found', 'No Firebase user exists for that email')
    staffUser = await authAdmin.createUser({ email, displayName: displayName || undefined, emailVerified: false })
    inviteLink = await authAdmin.generatePasswordResetLink(email)
  }

  if (staffUser.customClaims?.admin === true) {
    throw new HttpsError('failed-precondition', 'Main-admin access cannot be changed from the branch-manager form')
  }
  if (enabled && staffUser.customClaims?.staff === true) {
    throw new HttpsError('failed-precondition', 'This account already has a broader staff role; use a dedicated branch-manager account')
  }

  const claims = { ...(staffUser.customClaims || {}) }
  if (enabled) {
    claims.branchManager = true
    claims.permissions = ['nightDeals.manage']
    claims.stationIds = stationIds
  } else {
    delete claims.branchManager
    delete claims.permissions
    delete claims.stationIds
  }
  await authAdmin.setCustomUserClaims(staffUser.uid, claims)
  if (!enabled) await authAdmin.revokeRefreshTokens(staffUser.uid)

  const now = FieldValue.serverTimestamp()
  const batch = db.batch()
  batch.set(db.doc(`staff/${staffUser.uid}`), {
    id: staffUser.uid, uid: staffUser.uid, email,
    displayName: displayName || staffUser.displayName || email,
    role: 'branch_manager', permissions: enabled ? ['nightDeals.manage'] : [],
    stationIds: enabled ? stationIds : [], active: enabled,
    updatedAt: now, updatedBy: request.auth.uid, schemaVersion: 1,
  }, { merge: true })
  const auditRef = db.collection('auditLogs').doc()
  batch.set(auditRef, {
    id: auditRef.id, action: enabled ? 'staff.access_granted' : 'staff.access_revoked',
    actorUid: request.auth.uid, targetUid: staffUser.uid,
    metadata: { permissions: enabled ? ['nightDeals.manage'] : [], stationIds: enabled ? stationIds : [] },
    occurredAt: now, schemaVersion: 1,
  })
  await batch.commit()

  return { ok: true, uid: staffUser.uid, email, enabled, stationIds: enabled ? stationIds : [], inviteLink }
})

export const api = onRequest({ region }, app)
export const posApi = onRequest(
  { region, secrets: [posWebhookSecret], timeoutSeconds: 60, memory: '256MiB' },
  createPosApp(posWebhookSecret),
)
