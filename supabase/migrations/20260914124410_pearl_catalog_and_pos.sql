-- Catalog writes are version checked, permission scoped and audited.
create function private.save_catalog(p_kind text,p_item jsonb) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_id text := coalesce(nullif(p_item->>'id',''),gen_random_uuid()::text);
  v_version int; v_data jsonb; v_station public.stations; v_deal public.night_deals;
  v_start timestamptz; v_end timestamptz; v_cutoff timestamptz; v_date date;
  v_title text; v_price numeric; v_key text;
begin
  if jsonb_typeof(p_item)<>'object' or octet_length(p_item::text)>20000 then raise exception 'Invalid catalog item'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_kind||':'||v_id,0));
  if p_kind='nightDeals' then
    select * into v_station from public.stations where id=p_item->>'stationId' and active;
    if not found or not private.can_manage_station(v_station.id) then raise exception 'Station access denied' using errcode='42501'; end if;
    select * into v_deal from public.night_deals where id=v_id::uuid for update;
    if found then
      if not private.can_manage_station(v_deal.station_id) then raise exception 'Station access denied' using errcode='42501'; end if;
      if v_deal.version is distinct from (p_item->>'version')::int then raise exception 'This deal changed. Reload it before saving.' using errcode='40001'; end if;
      if (p_item->>'safetyCutoffAt')::timestamptz > v_deal.safety_cutoff_at then raise exception 'An existing food-safety cutoff cannot be extended'; end if;
      if v_deal.station_id <> v_station.id then raise exception 'Create a separate deal for a different station'; end if;
    end if;
    v_start := (p_item->>'startsAt')::timestamptz; v_end := (p_item->>'sellUntil')::timestamptz; v_cutoff := (p_item->>'safetyCutoffAt')::timestamptz;
    v_date := (v_start at time zone v_station.timezone)::date;
    if v_cutoff > ((v_date+1)::timestamp at time zone v_station.timezone) then raise exception 'Food-safety cutoff cannot be later than the end of its local business day'; end if;
    if p_item->>'status'='active' and v_end<=now() then raise exception 'An active offer must end in the future'; end if;
    insert into public.night_deals(id,station_id,product_name,description,img,original_price_cents,deal_price_cents,quantity_available,status,business_date,starts_at,sell_until,safety_cutoff_at,created_by,updated_by)
      values(v_id::uuid,v_station.id,trim(p_item->>'productName'),coalesce(p_item->>'description',''),coalesce(p_item->>'img','🥧'),
        (p_item->>'originalPriceCents')::int,(p_item->>'dealPriceCents')::int,(p_item->>'quantityAvailable')::int,coalesce(p_item->>'status','active'),
        v_date,v_start,v_end,v_cutoff,auth.uid(),auth.uid())
      on conflict(id) do update set product_name=excluded.product_name,description=excluded.description,img=excluded.img,
        original_price_cents=excluded.original_price_cents,deal_price_cents=excluded.deal_price_cents,quantity_available=excluded.quantity_available,
        status=excluded.status,business_date=excluded.business_date,starts_at=excluded.starts_at,sell_until=excluded.sell_until,safety_cutoff_at=excluded.safety_cutoff_at,
        version=public.night_deals.version+1,updated_by=auth.uid(),updated_at=now();
  else
    perform private.require_admin();
    if p_kind='stations' then
      select version into v_version from public.stations where id=v_id for update;
      if found and v_version is distinct from (p_item->>'version')::int then raise exception 'This station changed. Reload it before saving.' using errcode='40001'; end if;
      if not exists(select 1 from pg_timezone_names where name=coalesce(nullif(p_item->>'timezone',''),'Australia/Sydney')) then raise exception 'Invalid station timezone'; end if;
      for v_key in select unnest(array['ulp91','e10','p95','p98','diesel','lpg']) loop
        if p_item ? v_key and ((p_item->>v_key)::numeric < 0 or (p_item->>v_key)::numeric > 10000) then raise exception 'Invalid station fuel price'; end if;
      end loop;
      select coalesce(jsonb_object_agg(key,value),'{}') into v_data from jsonb_each(p_item)
        where key in ('open','hours','amenities','ulp91','e10','p95','p98','diesel','lpg');
      insert into public.stations(id,name,city,state,latitude,longitude,timezone,active,data)
        values(v_id,trim(p_item->>'name'),coalesce(p_item->>'city',''),coalesce(p_item->>'state',''),(p_item->>'lat')::double precision,(p_item->>'lng')::double precision,
          coalesce(nullif(p_item->>'timezone',''),'Australia/Sydney'),coalesce((p_item->>'active')::boolean,true),v_data)
        on conflict(id) do update set name=excluded.name,city=excluded.city,state=excluded.state,latitude=excluded.latitude,longitude=excluded.longitude,
          timezone=excluded.timezone,active=excluded.active,data=excluded.data,version=public.stations.version+1,updated_at=now();
    else
      if p_kind not in ('menu','categories','offers','rewards','fuel','notifs') then raise exception 'Unsupported catalog'; end if;
      select version into v_version from public.catalog_items where kind=p_kind and id=v_id for update;
      if found and v_version is distinct from (p_item->>'version')::int then raise exception 'This item changed. Reload it before saving.' using errcode='40001'; end if;
      v_title := trim(case p_kind when 'menu' then p_item->>'name' when 'categories' then p_item->>'label' when 'fuel' then p_item->>'code' else p_item->>'title' end);
      if p_kind='menu' then
        if coalesce(p_item->>'price','') !~ '^\$?[0-9]+(\.[0-9]{1,2})?$' then raise exception 'Price must be a dollar amount, for example $6.50'; end if;
        v_price := replace(p_item->>'price','$','')::numeric*100;
      end if;
      if p_kind='offers' and nullif(p_item->>'endsAt','') is null then raise exception 'Choose the offer end date and time'; end if;
      select coalesce(jsonb_object_agg(key,value),'{}') into v_data from jsonb_each(p_item)
        where key in ('img','emoji','cat','desc','sub','accent','color','tag','tags','expiry','price','trend','icon','body');
      -- Price is a typed value for menu/fuel; textual offer badges aren't money.
      if p_kind in ('menu','fuel') then v_data := v_data-'price'; end if;
      insert into public.catalog_items(kind,id,title,price_cents,points_cost,unit_price_micros,category_id,in_stock,active,starts_at,ends_at,data)
        values(p_kind,v_id,v_title,v_price::int,case when p_kind='rewards' then (p_item->>'cost')::int end,
          case when p_kind='fuel' then round((p_item->>'price')::numeric*1000000)::bigint end,
          case when p_kind='menu' then nullif(p_item->>'group','') end,
          coalesce((p_item->>'avail')::boolean,true),coalesce((p_item->>'active')::boolean,true),
          nullif(p_item->>'startsAt','')::timestamptz,nullif(p_item->>'endsAt','')::timestamptz,v_data)
        on conflict(kind,id) do update set title=excluded.title,price_cents=excluded.price_cents,points_cost=excluded.points_cost,unit_price_micros=excluded.unit_price_micros,
          category_id=excluded.category_id,in_stock=excluded.in_stock,active=excluded.active,starts_at=excluded.starts_at,ends_at=excluded.ends_at,data=excluded.data,version=public.catalog_items.version+1,updated_at=now();
    end if;
  end if;
  insert into private.audit_logs(actor_user_id,action,target_id,detail) values(auth.uid(),'catalog.save',p_kind||':'||v_id,jsonb_build_object('previousVersion',v_version));
  return v_id;
end;
$$;
create function public.save_catalog(p_kind text,p_item jsonb) returns text language sql security invoker set search_path = '' as $$ select private.save_catalog(p_kind,p_item); $$;
grant execute on function private.save_catalog(text,jsonb), public.save_catalog(text,jsonb) to authenticated;

-- Archive instead of destroying catalogs referenced by receipts or coupons.
create function private.archive_catalog(p_kind text,p_id text) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_kind='nightDeals' then update public.night_deals set status='expired',version=version+1,updated_at=now(),updated_by=auth.uid() where id=p_id::uuid;
  elsif p_kind='stations' then update public.stations set active=false,version=version+1,updated_at=now() where id=p_id;
  else update public.catalog_items set active=false,version=version+1,updated_at=now() where kind=p_kind and id=p_id;
  end if;
  insert into private.audit_logs(actor_user_id,action,target_id) values(auth.uid(),'catalog.archive',p_kind||':'||p_id);
end;
$$;
create function public.archive_catalog(p_kind text,p_id text) returns void language sql security invoker set search_path = '' as $$ select private.archive_catalog(p_kind,p_id); $$;
grant execute on function private.archive_catalog(text,text), public.archive_catalog(text,text) to authenticated;

create function private.admin_customers(p_search text default '',p_offset int default 0) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_offset < 0 or length(p_search)>200 then raise exception 'Invalid pagination'; end if;
  return coalesce((select jsonb_agg(row_to_json(r)) from (
    select c.*,u.email,a.balance,a.lifetime_points from public.customers c left join auth.users u on u.id=c.auth_user_id
      join public.loyalty_accounts a on a.customer_id=c.id
    where p_search='' or c.customer_number::text=p_search or c.membership_code=p_search or (c.first_name||' '||c.last_name) ilike '%'||p_search||'%' or u.email ilike '%'||p_search||'%'
    order by c.created_at desc,c.id limit 100 offset p_offset
  ) r),'[]');
end;
$$;
create function public.admin_customers(p_search text default '',p_offset int default 0) returns jsonb language sql security invoker set search_path = '' as $$ select private.admin_customers(p_search,p_offset); $$;
create function private.admin_summary() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object('customers',(select count(*) from public.customers),'points',(select coalesce(sum(balance),0) from public.loyalty_accounts));
end;
$$;
create function public.admin_summary() returns jsonb language sql security invoker set search_path = '' as $$ select private.admin_summary(); $$;
grant execute on function private.admin_customers(text,int), public.admin_customers(text,int), private.admin_summary(), public.admin_summary() to authenticated;

alter table public.transaction_items add column original_line_id text;
-- Keep an immutable receipt-to-deal link so stock decrements can be reconciled.
create table public.transaction_night_deals (
  transaction_id uuid not null references public.transactions(id),
  night_deal_id uuid not null references public.night_deals(id),
  quantity int not null check (quantity between 1 and 100000),
  deal_price_cents int not null check (deal_price_cents >= 0),
  primary key(transaction_id,night_deal_id)
);
create index transaction_night_deals_deal_idx on public.transaction_night_deals(night_deal_id);
alter table public.transaction_night_deals enable row level security;
revoke all on public.transaction_night_deals from public,anon,authenticated;
grant select on public.transaction_night_deals to authenticated;
grant all on public.transaction_night_deals to service_role;
create policy receipt_deals_read on public.transaction_night_deals for select to authenticated
  using (exists(select 1 from public.transactions t where t.id=transaction_id));
create trigger receipt_deals_immutable before update or delete on public.transaction_night_deals for each row execute function private.immutable_record();

create table private.refund_totals (
  original_transaction_id uuid primary key references public.transactions(id),
  total_cents int not null default 0, eligible_cents int not null default 0, points_reversed bigint not null default 0
);
create table private.refund_lines (
  original_transaction_id uuid not null,
  original_line_id text not null,
  total_cents int not null default 0, quantity_milli bigint not null default 0,
  primary key(original_transaction_id,original_line_id),
  foreign key(original_transaction_id,original_line_id) references public.transaction_items(transaction_id,line_id)
);

create function private.record_pos(p_integration_id uuid,p_event jsonb,p_payload_hash text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_integration private.pos_integrations; v_program public.loyalty_programs;
  v_original public.transactions; v_existing public.transactions; v_refund private.refund_totals;
  v_original_line public.transaction_items; v_returned private.refund_lines;
  v_customer uuid; v_transaction uuid := gen_random_uuid(); v_kind text := p_event->>'eventType';
  v_line jsonb; v_payment jsonb; v_coupon uuid; v_deal jsonb; v_deal_row public.night_deals;
  v_eligible int := 0; v_total int; v_sum bigint; v_points bigint := 0; v_count int := 0; v_member text;
begin
  -- Only service_role can execute this function. The edge gateway verifies the
  -- raw HMAC, size, timestamp and per-station key before making this RPC.
  if p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid payload hash'; end if;
  select * into v_integration from private.pos_integrations where id=p_integration_id and active for share;
  if not found or v_integration.provider is distinct from p_event->>'provider' or v_integration.external_store_id is distinct from p_event->>'storeId' then
    raise exception 'POS integration or station is not authorised' using errcode='42501';
  end if;
  if not exists(select 1 from public.stations where id=v_integration.station_id and active) then raise exception 'Station is inactive'; end if;
  -- Same integration + external transaction serialises retries before reads.
  perform pg_advisory_xact_lock(hashtextextended(p_integration_id::text||':'||coalesce(p_event->>'originalExternalTransactionId',p_event->>'externalTransactionId'),0));
  select t.* into v_existing from private.integration_events e join public.transactions t on t.id=e.transaction_id
    where e.integration_id=p_integration_id and e.event_id=p_event->>'eventId';
  if found then
    if v_existing.payload_hash <> p_payload_hash then raise exception 'POS event ID reused with different content' using errcode='23505'; end if;
    return jsonb_build_object('ok',true,'duplicate',true,'transactionId',v_existing.id,'pointsDelta',v_existing.points_delta);
  end if;
  select * into v_existing from public.transactions where integration_id=p_integration_id and event_type=v_kind and external_id=p_event->>'externalTransactionId';
  if found then
    if v_existing.payload_hash <> p_payload_hash then raise exception 'POS transaction ID reused with different content' using errcode='23505'; end if;
    insert into private.integration_events values(p_integration_id,p_event->>'eventId',p_payload_hash,v_existing.id,now());
    return jsonb_build_object('ok',true,'duplicate',true,'transactionId',v_existing.id,'pointsDelta',v_existing.points_delta);
  end if;
  if v_kind not in ('sale','refund','void') or p_event->>'currency'<>'AUD' or (p_event->>'contractVersion')::int<>1 then raise exception 'Unsupported POS contract'; end if;
  if jsonb_array_length(p_event->'items') not between 1 and 200 then raise exception 'A receipt must contain 1–200 lines'; end if;
  v_total := (p_event->>'totalCents')::int;
  select sum((value->>'totalCents')::bigint) into v_sum from jsonb_array_elements(p_event->'items');
  if abs(v_sum-v_total)>2 then raise exception 'Receipt line totals do not match'; end if;
  if jsonb_array_length(coalesce(p_event->'payments','[]'))>0 then
    select sum((value->>'amountCents')::bigint) into v_sum from jsonb_array_elements(p_event->'payments');
    if v_sum<>v_total then raise exception 'Payment totals do not match'; end if;
  end if;
  v_member := nullif(p_event->>'membershipCode','');
  if v_kind='sale' then
    if v_member is not null then
      select id into v_customer from public.customers where (replace(membership_code,'-','')=v_member or customer_number::text=v_member) and status='active';
      if v_customer is null then raise exception 'Membership was not found or is inactive'; end if;
    end if;
    select * into strict v_program from public.loyalty_programs where id='pearl-rewards-au' and active for share;
    select coalesce(sum((value->>'totalCents')::int),0) into v_eligible from jsonb_array_elements(p_event->'items')
      where coalesce((value->>'eligibleForPoints')::boolean,true) and not (value->>'category'=any(v_program.excluded_categories));
    if v_customer is not null then v_points := floor(v_eligible::numeric*v_program.points_numerator/(100*v_program.points_denominator)); end if;
  else
    select * into v_original from public.transactions where integration_id=p_integration_id and event_type='sale' and external_id=p_event->>'originalExternalTransactionId' for update;
    if not found then raise exception 'Original sale not found for this integration'; end if;
    v_customer := v_original.customer_id;
    if v_member is not null and not exists(select 1 from public.customers where id=v_customer and (replace(membership_code,'-','')=v_member or customer_number::text=v_member)) then raise exception 'Refund membership differs from the original sale'; end if;
    select * into strict v_program from public.loyalty_programs where id=v_original.program_id and version=v_original.program_version;
    insert into private.refund_totals(original_transaction_id) values(v_original.id) on conflict do nothing;
    select * into strict v_refund from private.refund_totals where original_transaction_id=v_original.id for update;
    if v_total<=0 or v_refund.total_cents+v_total>v_original.total_cents then raise exception 'Refund exceeds the remaining original sale'; end if;
    if v_kind='void' and (v_refund.total_cents<>0 or v_total<>v_original.total_cents) then raise exception 'A void must reverse an unrefunded sale in full'; end if;
    for v_line in select value from jsonb_array_elements(p_event->'items') loop
      select * into v_original_line from public.transaction_items where transaction_id=v_original.id and line_id=coalesce(v_line->>'originalLineId',v_line->>'lineId');
      if not found then raise exception 'Refund line does not belong to original sale'; end if;
      insert into private.refund_lines(original_transaction_id,original_line_id) values(v_original.id,v_original_line.line_id) on conflict do nothing;
      select * into strict v_returned from private.refund_lines where original_transaction_id=v_original.id and original_line_id=v_original_line.line_id for update;
      if v_returned.total_cents+(v_line->>'totalCents')::int>v_original_line.total_cents or v_returned.quantity_milli+(v_line->>'quantityMilli')::bigint>v_original_line.quantity_milli then raise exception 'Refund exceeds the original receipt line'; end if;
      update private.refund_lines set total_cents=total_cents+(v_line->>'totalCents')::int,quantity_milli=quantity_milli+(v_line->>'quantityMilli')::bigint where original_transaction_id=v_original.id and original_line_id=v_original_line.line_id;
      if v_original_line.eligible_for_points then v_eligible := v_eligible+(v_line->>'totalCents')::int; end if;
    end loop;
    -- Reverse points from original eligible lines and original program. Cumulative
    -- rounding makes multiple partial refunds equal one full refund.
    if v_original.eligible_cents>0 then
      v_points := -(floor(v_original.points_delta::numeric*(v_refund.eligible_cents+v_eligible)/v_original.eligible_cents)-v_refund.points_reversed);
    end if;
    if abs(v_points)+v_refund.points_reversed>v_original.points_delta then raise exception 'Refund points exceed original award'; end if;
    update private.refund_totals set total_cents=total_cents+v_total,eligible_cents=eligible_cents+v_eligible,points_reversed=points_reversed-v_points where original_transaction_id=v_original.id;
  end if;
  insert into public.transactions(id,integration_id,station_id,customer_id,event_type,external_id,original_transaction_id,terminal_id,receipt_number,occurred_at,business_date,
    subtotal_cents,tax_cents,total_cents,eligible_cents,points_delta,program_id,program_version,payload_hash)
    values(v_transaction,p_integration_id,v_integration.station_id,v_customer,v_kind,p_event->>'externalTransactionId',v_original.id,p_event->>'terminalId',p_event->>'receiptNumber',
      (p_event->>'occurredAt')::timestamptz,(p_event->>'businessDate')::date,(p_event->>'subtotalCents')::int,(p_event->>'taxCents')::int,
      v_total,v_eligible,v_points,v_program.id,v_program.version,p_payload_hash);
  for v_line in select value from jsonb_array_elements(p_event->'items') loop
    insert into public.transaction_items(transaction_id,line_id,sku,description,category,quantity_milli,unit_price_micros,total_cents,eligible_for_points,fuel_grade,litres_milli,original_line_id)
      values(v_transaction,v_line->>'lineId',v_line->>'sku',v_line->>'description',v_line->>'category',(v_line->>'quantityMilli')::bigint,(v_line->>'unitPriceMicros')::bigint,
        (v_line->>'totalCents')::int,coalesce((v_line->>'eligibleForPoints')::boolean,true) and not (v_line->>'category'=any(v_program.excluded_categories)),
        v_line->'fuel'->>'gradeCode',(v_line->'fuel'->>'litresMilli')::bigint,case when v_kind<>'sale' then coalesce(v_line->>'originalLineId',v_line->>'lineId') end);
  end loop;
  for v_payment in select value from jsonb_array_elements(coalesce(p_event->'payments','[]')) loop
    v_count := v_count+1;
    insert into public.transaction_payments values(v_transaction,v_count,v_payment->>'method',(v_payment->>'amountCents')::int);
  end loop;
  if v_customer is not null then
    insert into public.loyalty_ledger(customer_id,transaction_id,entry_type,delta,lifetime_delta,balance_after,operation_key,reason)
      values(v_customer,v_transaction,case when v_kind='sale' then 'earn' else 'refund' end,v_points,v_points,0,'pos:'||v_transaction,'POS '||v_kind||' '||left(p_event->>'receiptNumber',100));
  end if;
  -- Coupon consumption is part of the purchase transaction, never a customer
  -- button. Invalid/expired/used coupons roll the entire purchase write back.
  if jsonb_array_length(coalesce(p_event->'couponIds','[]'))>0 and (v_kind<>'sale' or v_customer is null) then raise exception 'Coupons require a member sale'; end if;
  for v_coupon in select value::uuid from jsonb_array_elements_text(coalesce(p_event->'couponIds','[]')) order by value loop
    update public.coupons set status='redeemed',used_at=now(),used_transaction_id=v_transaction
      where id=v_coupon and customer_id=v_customer and status='active' and expires_at>now();
    if not found then raise exception 'Coupon is unavailable, expired, or belongs to another customer'; end if;
  end loop;
  if jsonb_array_length(coalesce(p_event->'nightDealSales','[]'))>0 and v_kind<>'sale' then raise exception 'Night-deal stock cannot be restored by a refund; manager review is required'; end if;
  for v_deal in select value from jsonb_array_elements(coalesce(p_event->'nightDealSales','[]')) order by value->>'dealId' loop
    select * into v_deal_row from public.night_deals where id=(v_deal->>'dealId')::uuid for update;
    if not found or v_deal_row.station_id<>v_integration.station_id or v_deal_row.status<>'active' or v_deal_row.starts_at>now() or v_deal_row.sell_until<=now() or v_deal_row.safety_cutoff_at<=now()
      or (v_deal->>'quantity')::int<=0 or v_deal_row.quantity_available<(v_deal->>'quantity')::int then raise exception 'Tonight Only deal is unavailable'; end if;
    update public.night_deals set quantity_available=quantity_available-(v_deal->>'quantity')::int,
      status=case when quantity_available=(v_deal->>'quantity')::int then 'sold_out' else status end,version=version+1,updated_at=now() where id=v_deal_row.id;
    insert into public.transaction_night_deals(transaction_id,night_deal_id,quantity,deal_price_cents)
      values(v_transaction,v_deal_row.id,(v_deal->>'quantity')::int,v_deal_row.deal_price_cents);
  end loop;
  insert into private.integration_events values(p_integration_id,p_event->>'eventId',p_payload_hash,v_transaction,now());
  insert into private.outbox(event_type,aggregate_id,payload) values('transaction.recorded',v_transaction::text,jsonb_build_object('transactionId',v_transaction,'customerId',v_customer));
  insert into private.audit_logs(action,target_id,detail) values('pos.'||v_kind,v_transaction::text,jsonb_build_object('integrationId',p_integration_id,'points',v_points));
  return jsonb_build_object('ok',true,'duplicate',false,'transactionId',v_transaction,'pointsDelta',v_points);
end;
$$;
create function public.record_pos(p_integration_id uuid,p_event jsonb,p_payload_hash text) returns jsonb language sql security invoker set search_path = '' as $$ select private.record_pos(p_integration_id,p_event,p_payload_hash); $$;
revoke all on function private.record_pos(uuid,jsonb,text), public.record_pos(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function private.record_pos(uuid,jsonb,text), public.record_pos(uuid,jsonb,text) to service_role;
grant all on private.refund_totals,private.refund_lines to service_role;
create unique index customer_normalized_membership_idx on public.customers(replace(membership_code,'-',''));
