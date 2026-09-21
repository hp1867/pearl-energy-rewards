import { useCallback, useEffect, useState } from 'react'
import { data, DATA_MODE } from '../services/data'

const money = value => Math.round(Number(value) * 100)
const futureTime = () => {
  const date = new Date(Date.now() + 10 * 60000)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const initialMapping = { integrationId: '', sku: '', product: '', category: '', eligibleForPoints: true }
const initialRule = { target: '', name: '', products: [], discountKind: 'free', discountValue: '0', maxDiscount: '5.00', minimumSpend: '0', quantity: '1', stationIds: [], allowStacking: false }

export default function DatabaseOperations() {
  const [overview, setOverview] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const [mapping, setMapping] = useState(initialMapping), [rule, setRule] = useState(initialRule)
  const [earning, setEarning] = useState({ numerator: '1', denominator: '1', excluded: 'tobacco, lottery, gift-card, cash-out', effective: futureTime() })
  const [reason, setReason] = useState(''), [selection, setSelection] = useState(null)
  const [manifest, setManifest] = useState({ integrationId: '', businessDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }), receipts: '[]' })
  const refresh = useCallback(async () => {
    if (!data.adminDatabaseOverview) return
    try { setOverview(await data.adminDatabaseOverview()); setError('') } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => { void refresh(); const timer = setInterval(refresh, 60000); return () => clearInterval(timer) }, [refresh])
  const act = async (action, input) => {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await data.adminDatabaseAction(action, input)
      setNotice(action === 'retry' ? `Receipt status: ${result.state}.` : 'Saved. The action is recorded in the audit history.')
      setSelection(null); setReason(''); await refresh()
      return result
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  if (DATA_MODE === 'local') return <div className="panel phead">Database operations are available in connected Supabase mode.</div>
  if (!overview) return <div className="panel phead">{error || 'Loading database operations…'} <button className="btn ghost" onClick={refresh}>Retry</button></div>
  const integrations = overview.integrations || [], products = (overview.catalog || []).filter(row => row.kind !== 'rewards')
  const rewards = (overview.catalog || []).filter(row => row.kind === 'rewards')
  const targets = [
    ...rewards.map(row => ({ value: JSON.stringify({ rewardId: row.id }), label: row.title })),
    ...(overview.campaigns || []).flatMap(c => (c.config.prizes || []).filter(p => p.type === 'coupon').map(p => ({ value: JSON.stringify({ campaignId: c.id, prizeKey: p.id || p.label }), label: `${c.id}: ${p.title || p.label}` }))),
  ]
  const setMap = (key, value) => setMapping(x => ({ ...x, [key]: value }))
  const setRuleField = (key, value) => setRule(x => ({ ...x, [key]: value }))
  const integrationOptions = integrations.map(row => ({ value: row.id, label: `${row.provider} · ${row.storeId}${row.active ? '' : ' (inactive)'}` }))
  return <>
    <div className="phead"><p>Review receipts, publish future rules, and compare your records with the POS. Updates are audited.</p><button className="btn ghost" onClick={refresh}>Refresh</button></div>
    {error && <div role="alert" className="panel-error">{error}</div>}
    {notice && <div role="status" className="info-note">{notice}</div>}
    <div className="cards">{[
      ['Waiting receipts', overview.health.pendingReceipts], ['Processing errors', overview.health.openIssues], ['Balance mismatches', overview.health.balanceMismatches],
      ['Receipt / points mismatches', overview.health.receiptLedgerMismatches], ['Stock mismatches', overview.health.stockMismatches], ['Days awaiting POS comparison', overview.health.unreconciledBusinessDays],
    ].map(([label, value]) => <div className="stat" key={label}><div className="k">{label}</div><div className="v">{value}</div></div>)}</div>

    <Panel title="Receipt queue">
      <p className="panel-description">Accepted receipts are saved before processing. Offer exceptions are handled automatically: verified purchases keep their full ordinary eligible points. Invalid financial data or integration failures can still require a technical correction.</p>
      <div className="table-scroll"><table><thead><tr><th>Receipt</th><th>Total</th><th>Status</th><th>Attempts</th><th /></tr></thead><tbody>
        {overview.receipts.map(row => <tr key={row.id}><td>{row.receipt_number || row.external_id}</td><td>${(Number(row.total_cents) / 100).toFixed(2)}</td><td>{row.state}</td><td>{row.attempts}</td><td>{row.state !== 'processed' && <button className="btn ghost sm" onClick={() => { setSelection({ action: 'retry', id: row.id }); setReason('') }}>Retry after correction</button>}</td></tr>)}
        {!overview.receipts.length && <tr><td colSpan={5}>No POS receipts received yet.</td></tr>}
      </tbody></table></div>
      {overview.issues.map(issue => <div className="panel-error" key={issue.id}><b>{issue.kind.replace('_', ' ')}</b>: {issue.message}
        {issue.kind !== 'receipt' && <button className="btn ghost sm" onClick={() => { setSelection({ action: 'resolve', id: issue.id, coupon: issue.kind === 'coupon' }); setReason('') }}>Record staff resolution</button>}
      </div>)}
      {selection && <form onSubmit={e => { e.preventDefault(); void act(selection.action, { id: selection.id, reason }) }} style={{ padding: 18 }}>
        <p>{selection.action === 'retry' ? 'Correct the cause first. The saved receipt is retried with the same identity; successful points and benefits are not repeated.' : 'Close this review without awarding additional points or benefits.'} {selection.coupon && 'The held coupon will be closed so it cannot be used again.'}</p>
        <Field label="What was checked or corrected?"><textarea required minLength={5} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></Field>
        <button className="btn" disabled={busy}>{selection.action === 'retry' ? 'Retry saved receipt' : 'Save resolution'}</button> <button type="button" className="btn ghost" onClick={() => setSelection(null)}>Cancel</button>
      </form>}
    </Panel>

    <Panel title="POS product mappings">
      <p className="panel-description">Connect each register SKU to the correct catalog product. The first mapping supports delayed receipts; later changes keep their original effective dates.</p>
      {!integrations.length && <p className="info-note">Add the actual POS integration when your vendor is selected. No test store is activated automatically.</p>}
      <form className="row2" style={{ padding: 18 }} onSubmit={e => { e.preventDefault(); const product = JSON.parse(mapping.product); void act('mapping', { integrationId: mapping.integrationId, sku: mapping.sku, productKind: product.kind, productId: product.id, category: mapping.category, eligibleForPoints: mapping.eligibleForPoints }) }}>
        <Select label="POS store" value={mapping.integrationId} options={integrationOptions} onChange={value => setMap('integrationId', value)} />
        <Field label="Exact POS SKU"><input required maxLength={100} value={mapping.sku} onChange={e => setMap('sku', e.target.value)} /></Field>
        <Select label="Catalog product" value={mapping.product} options={products.map(row => ({ value: JSON.stringify({ kind: row.kind, id: row.id }), label: `${row.title} (${row.kind})` }))} onChange={value => setMap('product', value)} />
        <Field label="Loyalty category (e.g. bakery)"><input required maxLength={80} value={mapping.category} onChange={e => setMap('category', e.target.value)} /></Field>
        <Field label="Earn ordinary points"><input type="checkbox" checked={mapping.eligibleForPoints} onChange={e => setMap('eligibleForPoints', e.target.checked)} /></Field>
        <button className="btn" disabled={busy || !integrations.length}>Publish mapping</button>
      </form>
      <div className="table-scroll"><table><thead><tr><th>SKU</th><th>Product</th><th>Category</th><th>Points</th></tr></thead><tbody>{overview.mappings.map(row => <tr key={row.id}><td>{row.sku}</td><td>{products.find(p => p.kind === row.product_kind && p.id === row.product_id)?.title || row.product_id}</td><td>{row.category}</td><td>{row.eligible_for_points ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div>
    </Panel>

    <Panel title="Coupon product and discount rules">
      <p className="panel-description">Each issued coupon keeps its rule version. New rules apply to newly issued rewards. If a POS claim fails validation, its receipt and normal eligible points remain saved. The member's claimed coupon is closed automatically to prevent reuse; no extra promotional benefit is awarded.</p>
      <form className="row2" style={{ padding: 18 }} onSubmit={e => { e.preventDefault(); void act('reward_rule', { ...JSON.parse(rule.target), name: rule.name, products: rule.products.map(value => JSON.parse(value)), discountKind: rule.discountKind, discountValue: rule.discountKind === 'fixed' ? money(rule.discountValue) : Number(rule.discountValue), maxDiscountCents: money(rule.maxDiscount), minimumSpendCents: money(rule.minimumSpend), maxQuantityMilli: Math.round(Number(rule.quantity) * 1000), stationIds: rule.stationIds, allowStacking: rule.allowStacking }) }}>
        <Select label="Reward or campaign coupon" value={rule.target} options={targets} onChange={value => { setRuleField('target', value); setRuleField('name', targets.find(t => t.value === value)?.label || '') }} />
        <Field label="Rule name"><input required maxLength={160} value={rule.name} onChange={e => setRuleField('name', e.target.value)} /></Field>
        <MultiSelect label="Allowed products (select one or more)" value={rule.products} options={products.map(row => ({ value: JSON.stringify({ kind: row.kind, id: row.id }), label: row.title }))} onChange={value => setRuleField('products', value)} required />
        <MultiSelect label="Allowed stations (none selected means all)" value={rule.stationIds} options={overview.stations.map(row => ({ value: row.id, label: row.name }))} onChange={value => setRuleField('stationIds', value)} />
        <Select label="Discount type" value={rule.discountKind} options={[{ value: 'free', label: 'Free eligible product' }, { value: 'fixed', label: 'Fixed dollar discount' }, { value: 'percent', label: 'Percentage discount' }]} onChange={value => setRuleField('discountKind', value)} />
        {rule.discountKind !== 'free' && <Field label={rule.discountKind === 'percent' ? 'Percentage (1–100)' : 'Discount ($)'}><input required type="number" step={rule.discountKind === 'percent' ? '1' : '0.01'} min="0.01" value={rule.discountValue} onChange={e => setRuleField('discountValue', e.target.value)} /></Field>}
        <Field label="Maximum discount per coupon ($)"><input required type="number" min="0.01" step="0.01" value={rule.maxDiscount} onChange={e => setRuleField('maxDiscount', e.target.value)} /></Field>
        <Field label="Minimum receipt total after discounts ($)"><input required type="number" min="0" step="0.01" value={rule.minimumSpend} onChange={e => setRuleField('minimumSpend', e.target.value)} /></Field>
        <Field label="Maximum product quantity"><input required type="number" min="0.001" step="0.001" value={rule.quantity} onChange={e => setRuleField('quantity', e.target.value)} /></Field>
        <Field label="Allow multiple coupons on different quantities of the same line"><input type="checkbox" checked={rule.allowStacking} onChange={e => setRuleField('allowStacking', e.target.checked)} /></Field>
        <button className="btn" disabled={busy || !rule.products.length}>Publish new rule version</button>
      </form>
      <div className="table-scroll"><table><thead><tr><th>Rule</th><th>Version</th><th>Discount</th><th>Cap</th></tr></thead><tbody>{overview.rewardRules.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.version}</td><td>{row.discount_kind}</td><td>${(row.max_discount_cents / 100).toFixed(2)}</td></tr>)}</tbody></table></div>
    </Panel>

    <Panel title="Points earning rules">
      <p className="panel-description">The purchase time selects the earning rate. Older versions remain available for delayed receipts and refunds.</p>
      <form className="row2" style={{ padding: 18 }} onSubmit={e => { e.preventDefault(); void act('earning_rule', { numerator: Number(earning.numerator), denominator: Number(earning.denominator), effectiveFrom: new Date(earning.effective).toISOString(), excludedCategories: earning.excluded.split(',').map(x => x.trim()).filter(Boolean) }) }}>
        <Field label="Points numerator per $1"><input required type="number" min="0" max="1000" value={earning.numerator} onChange={e => setEarning(x => ({ ...x, numerator: e.target.value }))} /></Field>
        <Field label="Points denominator"><input required type="number" min="1" max="1000" value={earning.denominator} onChange={e => setEarning(x => ({ ...x, denominator: e.target.value }))} /></Field>
        <Field label="Starts at (your browser's local time)"><input required type="datetime-local" value={earning.effective} onChange={e => setEarning(x => ({ ...x, effective: e.target.value }))} /></Field>
        <Field label="Excluded categories, separated by commas"><input value={earning.excluded} onChange={e => setEarning(x => ({ ...x, excluded: e.target.value }))} /></Field>
        <button className="btn" disabled={busy}>Schedule new earning rule</button>
      </form>
      <div className="table-scroll"><table><thead><tr><th>Version</th><th>Points per $1</th><th>Effective from</th></tr></thead><tbody>{overview.earningRules.map(row => <tr key={row.version}><td>{row.version}</td><td>{row.points_numerator}/{row.points_denominator}</td><td>{row.effective_from === '-infinity' ? 'Original rule' : new Date(row.effective_from).toLocaleString()}</td></tr>)}</tbody></table></div>
    </Panel>

    <Panel title="Compare receipts with the POS">
      <p className="panel-description">Import a complete daily receipt manifest from the register. Missing receipts, unexpected receipts and different totals appear below. The signed POS endpoint can submit the same manifest automatically.</p>
      <form className="row2" style={{ padding: 18 }} onSubmit={e => { e.preventDefault(); try { void act('reconcile', { ...manifest, receipts: JSON.parse(manifest.receipts) }) } catch { setError('The receipt manifest must be a valid JSON array.') } }}>
        <Select label="POS store" value={manifest.integrationId} options={integrationOptions} onChange={value => setManifest(x => ({ ...x, integrationId: value }))} />
        <Field label="POS business date"><input required type="date" value={manifest.businessDate} onChange={e => setManifest(x => ({ ...x, businessDate: e.target.value }))} /></Field>
        <Field label={'Receipt manifest: [{"externalTransactionId":"R123","eventType":"sale","totalCents":5200}]'} full><textarea required rows={5} value={manifest.receipts} onChange={e => setManifest(x => ({ ...x, receipts: e.target.value }))} /></Field>
        <button className="btn" disabled={busy || !integrations.length}>Compare with saved receipts</button>
      </form>
      {overview.reconciliations.map(row => <div key={row.manifestId} style={{ padding: 18 }}><b>{row.businessDate}: {row.matched ? 'Matched' : `${row.differences.length} differences`}</b><p>{row.recordedCount} recorded / {row.expectedCount} expected</p>{row.differences.slice(0, 100).map((diff, i) => <p key={i}>{diff.externalId} · {diff.problem.replaceAll('_', ' ')} · expected {diff.expectedCents ?? 'none'}, recorded {diff.recordedCents ?? 'none'} cents</p>)}</div>)}
    </Panel>
    <Panel title="Automatic offer decisions"><div style={{ padding: 18 }}><p>No approval is needed for these exceptions. Normal eligible points were preserved.</p>{(overview.automaticExceptions || []).map(row => <p key={row.id}><b>{row.kind}:</b> {row.message}<br /><small>{row.resolution}</small></p>)}</div></Panel>
    <Panel title="Night-deal stock history"><div className="table-scroll"><table><thead><tr><th>Deal</th><th>Change</th><th>Remaining</th><th>Reason</th></tr></thead><tbody>{overview.stockMovements.map(row => <tr key={row.id}><td>{row.deal_id}</td><td>{row.delta}</td><td>{row.quantity_after}</td><td>{row.reason}</td></tr>)}</tbody></table></div></Panel>
  </>
}

function Panel({ title, children }) { return <section className="panel" style={{ marginBottom: 22 }}><div className="phead"><h3>{title}</h3></div>{children}</section> }
function Field({ label, full, children }) { return <label className="field" style={full ? { gridColumn: '1 / -1' } : undefined}><span>{label}</span>{children}</label> }
function Select({ label, value, options, onChange }) { return <Field label={label}><select required value={value} onChange={e => onChange(e.target.value)}><option value="">Choose…</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field> }
function MultiSelect({ label, value, options, onChange, required }) { return <Field label={label}><select multiple required={required} size={4} value={value} onChange={e => onChange(Array.from(e.target.selectedOptions, option => option.value))}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field> }
