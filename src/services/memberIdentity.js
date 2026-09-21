export function normaliseMobile(value) {
  let phone = String(value || '').trim().replace(/[\s().-]/g, '')
  if (/^04\d{8}$/.test(phone)) phone = '+61' + phone.slice(1)
  else if (/^614\d{8}$/.test(phone)) phone = '+' + phone
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('Enter an Australian mobile number (04…) or a full international number starting with +.')
  return phone
}

export function latestPolicies(rows = []) {
  return Object.fromEntries(['terms', 'privacy', 'closure'].map(kind => [kind, rows.filter(row => row.kind === kind).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))[0]]))
}
