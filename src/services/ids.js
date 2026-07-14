// Identity helpers for new customers.

// 8-digit customer number — the human-typeable lookup key (e.g. 10042377).
export function generateCustomerNumber() {
  return String(Math.floor(10000000 + Math.random() * 89999999))
}

// Membership ID used on the card / barcode / QR — PE-XXXX-XXXX-XXXX.
export function generateMembershipId() {
  const block = () => String(Math.floor(1000 + Math.random() * 9000))
  return `PE-${block()}-${block()}-${block()}`
}

// What the QR code / barcode encodes.
export function buildQrData(membershipId, customerNumber, points = 0) {
  return `PEARL|${membershipId}|${customerNumber}|${points}`
}

// Tier is derived from lifetime points so it can never drift out of sync.
// Ladder: Blue → Silver → Gold → Diamond → Immortal.
export function tierForPoints(lifetimePoints) {
  if (lifetimePoints >= 10000) return 'Immortal'
  if (lifetimePoints >= 5000) return 'Diamond'
  if (lifetimePoints >= 2500) return 'Gold'
  if (lifetimePoints >= 1000) return 'Silver'
  return 'Blue'
}

// Build a fresh customer record from signup fields.
export function buildNewCustomer({ firstName, lastName, email, mobile, dob, uid }) {
  const customerNumber = generateCustomerNumber()
  const membershipId = generateMembershipId()
  const points = 0
  return {
    uid: uid || customerNumber,
    customerNumber,
    membershipId,
    firstName: firstName || 'New',
    lastName: lastName || 'Member',
    name: `${firstName || 'New'} ${lastName || 'Member'}`,
    email: email || '',
    mobile: mobile || '',
    dob: dob || '',
    points,
    lifetimePoints: points,
    tier: tierForPoints(points),
    qrData: buildQrData(membershipId, customerNumber, points),
    joined: new Date().toISOString(),
    rewardsRedeemed: [],
    transactions: [],
    // 2-week Fuel Mission (4 fill-ups → bonus)
    missionStart: null,
    missionCount: 0,
    missionRewarded: false,
    // Spin the Wheel (earned via qualifying shop purchases)
    wheelSpins: 0,
    monthlyDrawEntries: 0,
    doublePointsNext: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}
