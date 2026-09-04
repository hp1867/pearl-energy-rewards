export const SCHEMA_VERSION = 1
export const POS_CONTRACT_VERSION = 1
export const TENANT_ID = 'pearl-energy'
export const PROGRAM_ID = 'pearl-rewards-au'
export const PROGRAM_VERSION = 1
export const DEFAULT_FUNCTION_REGION = 'australia-southeast1'

export const COLLECTIONS = Object.freeze({
  customers: 'customers',
  authLinks: 'authLinks',
  customerNumbers: 'customerNumbers',
  membershipCodes: 'membershipCodes',
  loyaltyAccounts: 'loyaltyAccounts',
  loyaltyLedger: 'loyaltyLedger',
  transactions: 'transactions',
  redemptions: 'redemptions',
  integrationEvents: 'integrationEvents',
  idempotencyKeys: 'idempotencyKeys',
  outbox: 'outbox',
  auditLogs: 'auditLogs',
  loyaltyPrograms: 'loyaltyPrograms',
  nightDeals: 'nightDeals',
  staff: 'staff',
})
