// Owner-requested shared catalog import. No demo accounts or automatic fallback.
// Prints SQL for review; never connects to a database or runs on app startup.
import { pathToFileURL } from 'node:url'
import { menuGroups, menuItems, offers, rewards } from '../src/data/mockData.js'

export const batch = 'shared-catalog-2026-09-21'
export function catalogRows(offerEnd) {
  if (!offerEnd || !Number.isFinite(Date.parse(offerEnd))) throw new Error('An explicit valid offer expiry is required')
  const end = new Date(offerEnd).toISOString()
  const row = (kind, item, title, extras = {}) => ({ kind, id: String(item.id ?? item.key), title, data: {}, ...extras })
  return [
    ...menuGroups.map(item => row('categories', item, item.label, { data: { emoji: item.emoji } })),
    ...menuItems.map(({ price, ...item }) => row('menu', item, item.name, {
      price_cents: Math.round(Number(price.replace('$', '')) * 100), category_id: item.group, in_stock: item.avail,
      data: { img: item.img, cat: item.cat, desc: item.desc, tags: item.tags },
    })),
    ...offers.map(item => row('offers', item, item.title, { ends_at: end,
      data: { img: item.img, cat: item.cat, sub: item.sub, price: item.price, accent: item.accent, tag: item.tag },
    })),
    ...rewards.map(item => row('rewards', item, item.title, { points_cost: item.cost, data: { img: item.img, cat: item.cat, color: item.color } })),
  ]
}
const literal = value => "'" + String(value).replaceAll("'", "''") + "'"
export function catalogImportSql(offerEnd) {
  const rows = catalogRows(offerEnd)
  // Separate category insert ensures FK parents exist before the other rows.
  const insert = list => `with added as (
    insert into public.catalog_items(kind,id,title,price_cents,points_cost,category_id,in_stock,active,ends_at,data)
    select kind,id,title,price_cents,points_cost,category_id,coalesce(in_stock,true),true,ends_at,data
    from jsonb_to_recordset(${literal(JSON.stringify(list))}::jsonb)
      as r(kind text,id text,title text,price_cents int,points_cost int,category_id text,in_stock boolean,ends_at timestamptz,data jsonb)
    on conflict(kind,id) do nothing returning kind,id
  ) insert into private.audit_logs(actor_user_id,action,target_id,detail)
    select null,'catalog.import',kind||':'||id,jsonb_build_object('batch',${literal(batch)},'source','Existing app catalog; owner-requested shared publication') from added;`
  return `begin;
set local lock_timeout='5s';
${insert(rows.filter(row => row.kind === 'categories'))}
${insert(rows.filter(row => row.kind !== 'categories'))}
commit;`
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(catalogImportSql(process.argv[2]))
}
