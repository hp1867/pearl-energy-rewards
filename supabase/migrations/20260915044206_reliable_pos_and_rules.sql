-- Purchase intake, immutable rules and automatic non-financial offer exceptions.
-- Existing receipts and ledger entries are preserved. No production seed data.

alter table public.loyalty_programs add column effective_from timestamptz not null default now();
with versions as (
  select id,version,row_number() over(partition by id order by version) as ordinal from public.loyalty_programs
) update public.loyalty_programs p set effective_from=case when v.ordinal=1 then '-infinity'::timestamptz else p.created_at end
  from versions v where p.id=v.id and p.version=v.version;
create unique index program_effective_idx on public.loyalty_programs(id,effective_from);
create function private.protect_program_rule() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or (to_jsonb(new)-'active') is distinct from (to_jsonb(old)-'active') then
    raise exception 'Published earning rules are immutable. Publish a new version.';
  end if;
  return new;
end;
$$;
create trigger program_rule_immutable before update or delete on public.loyalty_programs for each row execute function private.protect_program_rule();

create table public.campaign_rule_versions (
  campaign_id text not null references public.campaigns(id), version int not null check(version>0),
  effective_from timestamptz not null, active boolean not null, config jsonb not null,
  created_at timestamptz not null default now(), primary key(campaign_id,version), unique(campaign_id,effective_from),
  check(jsonb_typeof(config)='object' and octet_length(config::text)<=16384)
);
insert into public.campaign_rule_versions(campaign_id,version,effective_from,active,config)
  select id,version,'-infinity',active,config from public.campaigns;
create trigger campaign_rules_immutable before update or delete on public.campaign_rule_versions for each row execute function private.immutable_record();
alter table public.campaign_awards add foreign key(campaign_id,campaign_version) references public.campaign_rule_versions(campaign_id,version);
alter table public.wheel_credits add column campaign_id text not null default 'shop_wheel' check(campaign_id='shop_wheel');
alter table public.wheel_credits add column campaign_version int not null default 1;
alter table public.wheel_credits add foreign key(campaign_id,campaign_version) references public.campaign_rule_versions(campaign_id,version);
create index wheel_rule_idx on public.wheel_credits(campaign_id,campaign_version);
alter table public.mission_cycles add column campaign_id text not null default 'fuel_mission' check(campaign_id='fuel_mission');
alter table public.mission_cycles add column campaign_version int not null default 1;
alter table public.mission_cycles add foreign key(campaign_id,campaign_version) references public.campaign_rule_versions(campaign_id,version);
create index mission_rule_idx on public.mission_cycles(campaign_id,campaign_version);
create function private.snapshot_campaign() returns trigger language plpgsql security definer set search_path='' as $$
declare v_prize jsonb;
begin
  if tg_op='UPDATE' and new.config=old.config and new.active=old.active then return new; end if;
  if jsonb_typeof(new.config->'prizes') is distinct from 'array' or jsonb_array_length(new.config->'prizes') not between 1 and 50 then raise exception 'Provide 1-50 campaign prizes'; end if;
  for v_prize in select value from jsonb_array_elements(new.config->'prizes') loop
    if (v_prize->>'weight')::int not between 1 and 100000 or v_prize->>'type' not in ('points','coupon','double','entries') then raise exception 'Invalid prize rule'; end if;
    if v_prize->>'type' in ('points','entries') and coalesce((v_prize->>'value')::int,0) not between 1 and 1000000 then raise exception 'Invalid prize value'; end if;
  end loop;
  if new.id='fuel_mission' and (coalesce((new.config->>'target')::int,0) not between 1 and 100 or coalesce((new.config->>'windowDays')::int,0) not between 1 and 90) then raise exception 'Invalid mission target/window'; end if;
  if new.id='shop_wheel' and (coalesce((new.config->>'minimumSpendCents')::int,-1) not between 0 and 100000000 or jsonb_typeof(new.config->'categories') is distinct from 'array') then raise exception 'Invalid wheel eligibility'; end if;
  if tg_op='UPDATE' then new.version:=old.version+1; end if;
  insert into public.campaign_rule_versions(campaign_id,version,effective_from,active,config)
    values(new.id,new.version,clock_timestamp(),new.active,new.config);
  return new;
end;
$$;
create trigger campaign_snapshot before update on public.campaigns for each row execute function private.snapshot_campaign();
create function private.campaign_at(p_id text,p_at timestamptz) returns public.campaign_rule_versions language sql stable set search_path='' as $$
  select r from public.campaign_rule_versions r where campaign_id=p_id and effective_from<=p_at order by effective_from desc limit 1;
$$;

-- POS SKUs map to stable catalog identities. Each mapping is a dated snapshot.
create table private.pos_product_mappings (
  id uuid primary key default gen_random_uuid(), integration_id uuid not null references private.pos_integrations(id),
  sku text not null check(length(sku) between 1 and 100), product_kind text not null check(product_kind in ('menu','fuel')),
  product_id text not null, category text not null check(length(category) between 1 and 80), eligible_for_points boolean not null,
  effective_from timestamptz not null default now(), created_at timestamptz not null default now(), created_by uuid,
  foreign key(product_kind,product_id) references public.catalog_items(kind,id), unique(integration_id,sku,effective_from)
);
create index mappings_product_idx on private.pos_product_mappings(product_kind,product_id);
create trigger mappings_immutable before update or delete on private.pos_product_mappings for each row execute function private.immutable_record();
alter table public.transaction_items add column mapping_id uuid references private.pos_product_mappings(id);
create index items_mapping_idx on public.transaction_items(mapping_id);
create function private.product_mapping(p_integration uuid,p_sku text,p_at timestamptz) returns private.pos_product_mappings language sql stable set search_path='' as $$
  select m from private.pos_product_mappings m where integration_id=p_integration and sku=p_sku and effective_from<=p_at order by effective_from desc limit 1;
$$;

create table public.reward_rules (
  id uuid primary key default gen_random_uuid(), reward_kind text not null default 'rewards' check(reward_kind='rewards'), reward_id text,
  name text not null check(length(name) between 1 and 160), version int not null check(version>0), effective_from timestamptz not null,
  enabled boolean not null default true, discount_kind text not null check(discount_kind in ('free','fixed','percent')),
  discount_value int not null check(discount_value>=0), max_discount_cents int not null check(max_discount_cents between 1 and 10000000),
  minimum_spend_cents int not null default 0 check(minimum_spend_cents between 0 and 100000000),
  max_quantity_milli int not null default 1000 check(max_quantity_milli between 1 and 1000000),
  allow_stacking boolean not null default false, station_ids text[] not null default '{}',
  created_at timestamptz not null default now(), created_by uuid,
  foreign key(reward_kind,reward_id) references public.catalog_items(kind,id), unique(reward_id,version), unique(reward_id,effective_from),
  check(discount_kind<>'percent' or discount_value between 1 and 100), check(discount_kind<>'fixed' or discount_value>0)
);
create table public.reward_rule_products (
  rule_id uuid not null references public.reward_rules(id), product_kind text not null check(product_kind in ('menu','fuel')), product_id text not null,
  primary key(rule_id,product_kind,product_id), foreign key(product_kind,product_id) references public.catalog_items(kind,id)
);
create index rule_products_catalog_idx on public.reward_rule_products(product_kind,product_id);
create trigger reward_rules_immutable before update or delete on public.reward_rules for each row execute function private.immutable_record();
create trigger reward_products_immutable before update or delete on public.reward_rule_products for each row execute function private.immutable_record();
alter table public.coupons add column rule_id uuid references public.reward_rules(id);
alter table public.coupons drop constraint coupons_status_check;
alter table public.coupons add constraint coupons_status_check check(status in ('active','held','redeemed','revoked'));
alter table public.coupons add column held_for_transaction_id uuid references public.transactions(id);
create index coupons_held_transaction_idx on public.coupons(held_for_transaction_id);
create index coupons_rule_idx on public.coupons(rule_id);
create function private.bind_coupon_rule() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.rule_id is null and new.reward_id is not null then
    select id into new.rule_id from public.reward_rules where reward_id=new.reward_id and effective_from<=new.issued_at order by effective_from desc limit 1;
  end if;
  if new.reward_id is not null and not exists(select 1 from public.reward_rules r where r.id=new.rule_id and r.enabled
    and exists(select 1 from public.reward_rule_products p where p.rule_id=r.id)) then
    raise exception 'This reward is not ready yet. Pearl Energy must publish its product and discount rules. No points have been deducted.';
  end if;
  return new;
end;
$$;
create trigger coupon_rule_snapshot before insert on public.coupons for each row execute function private.bind_coupon_rule();
create table public.coupon_redemptions (
  coupon_id uuid primary key references public.coupons(id), transaction_id uuid not null references public.transactions(id),
  line_id text not null, rule_id uuid not null references public.reward_rules(id), quantity_milli int not null check(quantity_milli>0),
  discount_cents int not null check(discount_cents>=0), created_at timestamptz not null default now(),
  foreign key(transaction_id,line_id) references public.transaction_items(transaction_id,line_id)
);
create index coupon_redemptions_line_idx on public.coupon_redemptions(transaction_id,line_id);
create index coupon_redemptions_rule_idx on public.coupon_redemptions(rule_id);
create trigger coupon_redemptions_immutable before update or delete on public.coupon_redemptions for each row execute function private.immutable_record();

alter table public.night_deals add column product_kind text not null default 'menu' check(product_kind='menu');
alter table public.night_deals add column product_id text;
alter table public.night_deals add foreign key(product_kind,product_id) references public.catalog_items(kind,id);
create index night_deals_product_idx on public.night_deals(product_kind,product_id);
alter table public.transaction_night_deals add column line_id text;
alter table public.transaction_night_deals add foreign key(transaction_id,line_id) references public.transaction_items(transaction_id,line_id);
create index deal_sales_line_idx on public.transaction_night_deals(transaction_id,line_id);
create table private.night_deal_versions (
  deal_id uuid not null references public.night_deals(id), version int not null, effective_from timestamptz not null,
  snapshot jsonb not null, primary key(deal_id,version)
);
create index deal_versions_time_idx on private.night_deal_versions(deal_id,effective_from desc);
create table private.deal_stock_movements (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.night_deals(id), delta int not null,
  quantity_after int not null check(quantity_after>=0), transaction_id uuid references public.transactions(id), actor_id uuid,
  reason text not null, created_at timestamptz not null default now()
);
create index stock_deal_idx on private.deal_stock_movements(deal_id,created_at);
create index stock_transaction_idx on private.deal_stock_movements(transaction_id);
insert into private.night_deal_versions select id,version,least(starts_at,updated_at),to_jsonb(d) from public.night_deals d;
insert into private.deal_stock_movements(deal_id,delta,quantity_after,reason) select id,quantity_available,quantity_available,'Opening balance at migration' from public.night_deals;
create trigger deal_versions_immutable before update or delete on private.night_deal_versions for each row execute function private.immutable_record();
create trigger stock_movements_immutable before update or delete on private.deal_stock_movements for each row execute function private.immutable_record();
create function private.snapshot_deal() returns trigger language plpgsql security definer set search_path='' as $$
declare v_delta int; v_tx uuid:=nullif(current_setting('pearl.stock_transaction',true),'')::uuid;
begin
  insert into private.night_deal_versions values(new.id,new.version,clock_timestamp(),to_jsonb(new));
  v_delta:=new.quantity_available-case when tg_op='INSERT' then 0 else old.quantity_available end;
  if tg_op='INSERT' or v_delta<>0 then
    insert into private.deal_stock_movements(deal_id,delta,quantity_after,transaction_id,actor_id,reason)
      values(new.id,v_delta,new.quantity_available,v_tx,auth.uid(),case when v_tx is not null then 'POS sale' else coalesce(nullif(current_setting('pearl.stock_reason',true),''),'Opening stock / catalog adjustment') end);
  end if;
  return new;
end;
$$;
create trigger night_deal_history after insert or update on public.night_deals for each row execute function private.snapshot_deal();

create table private.pos_inbox (
  id uuid primary key default gen_random_uuid(), integration_id uuid not null references private.pos_integrations(id),
  event_type text not null check(event_type in ('sale','refund','void')), external_id text not null check(length(external_id) between 1 and 160),
  payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'), payload jsonb not null check(octet_length(payload::text)<=262144),
  state text not null default 'pending' check(state in ('pending','retry','review','processed')),
  transaction_id uuid references public.transactions(id), campaigns_done boolean not null default false,
  attempts int not null default 0, next_attempt_at timestamptz not null default now(), last_error text,
  received_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(integration_id,event_type,external_id)
);
create index inbox_queue_idx on private.pos_inbox(next_attempt_at,id) where state in ('pending','retry');
create index inbox_transaction_idx on private.pos_inbox(transaction_id);
create table private.pos_deliveries (
  integration_id uuid not null references private.pos_integrations(id), event_id text not null check(length(event_id) between 1 and 160),
  inbox_id uuid not null references private.pos_inbox(id), created_at timestamptz not null default now(), primary key(integration_id,event_id)
);
create index deliveries_inbox_idx on private.pos_deliveries(inbox_id);
create trigger deliveries_immutable before update or delete on private.pos_deliveries for each row execute function private.immutable_record();
create function private.protect_inbox() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or row(new.integration_id,new.event_type,new.external_id,new.payload_hash,new.payload,new.received_at) is distinct from row(old.integration_id,old.event_type,old.external_id,old.payload_hash,old.payload,old.received_at) then
    raise exception 'Original POS intake evidence cannot be changed';
  end if;
  return new;
end;
$$;
create trigger inbox_evidence_immutable before update or delete on private.pos_inbox for each row execute function private.protect_inbox();
create table private.pos_issues (
  id uuid primary key default gen_random_uuid(), inbox_id uuid not null references private.pos_inbox(id),
  kind text not null, reference text not null, message text not null, resolved_at timestamptz, resolved_by uuid, resolution text,
  created_at timestamptz not null default now(), unique(inbox_id,kind,reference)
);
create index pos_issues_open_idx on private.pos_issues(created_at) where resolved_at is null;
create table private.pos_reconciliation_manifests (
  id uuid primary key default gen_random_uuid(), integration_id uuid not null references private.pos_integrations(id), business_date date not null,
  manifest jsonb not null check(jsonb_typeof(manifest)='array' and jsonb_array_length(manifest)<=10000),
  created_at timestamptz not null default now(), created_by uuid
);
create index manifests_day_idx on private.pos_reconciliation_manifests(integration_id,business_date,created_at desc);
create trigger manifests_immutable before update or delete on private.pos_reconciliation_manifests for each row execute function private.immutable_record();

-- All new public data has explicit read policies; privileged queues stay private.
do $$ declare t text; begin
  foreach t in array array['campaign_rule_versions','reward_rules','reward_rule_products'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy authenticated_read on public.%I for select to authenticated using (true)',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
  foreach t in array array['pos_product_mappings','night_deal_versions','deal_stock_movements','pos_inbox','pos_deliveries','pos_issues','pos_reconciliation_manifests'] loop
    execute format('alter table private.%I enable row level security',t);
    execute format('revoke all on private.%I from public,anon,authenticated',t);
    execute format('grant all on private.%I to service_role',t);
  end loop;
end $$;
alter table public.coupon_redemptions enable row level security;
revoke all on public.coupon_redemptions from public,anon,authenticated;
grant select on public.coupon_redemptions to authenticated;
grant all on public.coupon_redemptions to service_role;
create policy own_redemptions on public.coupon_redemptions for select to authenticated using (
  exists(select 1 from public.coupons c where c.id=coupon_id and c.customer_id=(select private.customer_id())) or (select private.is_admin())
);

create or replace function private.record_pos_core(p_integration_id uuid,p_event jsonb,p_payload_hash text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_integration private.pos_integrations; v_program public.loyalty_programs;
  v_original public.transactions; v_existing public.transactions; v_refund private.refund_totals;
  v_original_line public.transaction_items; v_returned private.refund_lines;
  v_customer uuid; v_transaction uuid := gen_random_uuid(); v_kind text := p_event->>'eventType';
  v_line jsonb; v_payment jsonb; v_coupon uuid; v_deal jsonb; v_deal_row public.night_deals;
  v_mapping private.pos_product_mappings; v_mapped jsonb := '[]';
  v_occurred timestamptz := (p_event->>'occurredAt')::timestamptz;
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
  if jsonb_array_length(p_event->'items') not between 1 and 200 then raise exception 'A receipt must contain 1-200 lines'; end if;
  v_total := (p_event->>'totalCents')::int;
  select sum((value->>'totalCents')::bigint) into v_sum from jsonb_array_elements(p_event->'items');
  if abs(v_sum-v_total)>2 then raise exception 'Receipt line totals do not match'; end if;
  if jsonb_array_length(coalesce(p_event->'payments','[]'))>0 then
    select sum((value->>'amountCents')::bigint) into v_sum from jsonb_array_elements(p_event->'payments');
    if v_sum<>v_total then raise exception 'Payment totals do not match'; end if;
  end if;
  if v_occurred is null or v_occurred>now()+interval '5 minutes' then raise exception 'Invalid purchase time'; end if;
  if v_kind='sale' then
    for v_line in select value from jsonb_array_elements(p_event->'items') loop
      select * into v_mapping from private.product_mapping(p_integration_id,v_line->>'sku',v_occurred);
      if v_mapping.id is not null then
        v_line:=v_line||jsonb_build_object('mappingId',v_mapping.id,'category',v_mapping.category,'eligibleForPoints',v_mapping.eligible_for_points);
      end if;
      v_mapped:=v_mapped||jsonb_build_array(v_line);
    end loop;
    p_event:=jsonb_set(p_event,'{items}',v_mapped);
  end if;
  v_member := nullif(p_event->>'membershipCode','');
  if v_kind='sale' then
    if v_member is not null then
      select id into v_customer from public.customers where (replace(membership_code,'-','')=v_member or customer_number::text=v_member) and status='active';
      if v_customer is null then raise exception 'Membership was not found or is inactive'; end if;
    end if;
    select * into strict v_program from public.loyalty_programs where id='pearl-rewards-au' and effective_from<=v_occurred order by effective_from desc limit 1 for share;
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
    insert into public.transaction_items(transaction_id,line_id,sku,description,category,quantity_milli,unit_price_micros,total_cents,eligible_for_points,fuel_grade,litres_milli,original_line_id,mapping_id)
      values(v_transaction,v_line->>'lineId',v_line->>'sku',v_line->>'description',v_line->>'category',(v_line->>'quantityMilli')::bigint,(v_line->>'unitPriceMicros')::bigint,
        (v_line->>'totalCents')::int,coalesce((v_line->>'eligibleForPoints')::boolean,true) and not (v_line->>'category'=any(v_program.excluded_categories)),
        v_line->'fuel'->>'gradeCode',(v_line->'fuel'->>'litresMilli')::bigint,case when v_kind<>'sale' then coalesce(v_line->>'originalLineId',v_line->>'lineId') end,(v_line->>'mappingId')::uuid);
  end loop;
  for v_payment in select value from jsonb_array_elements(coalesce(p_event->'payments','[]')) loop
    v_count := v_count+1;
    insert into public.transaction_payments values(v_transaction,v_count,v_payment->>'method',(v_payment->>'amountCents')::int);
  end loop;
  if v_customer is not null then
    insert into public.loyalty_ledger(customer_id,transaction_id,entry_type,delta,lifetime_delta,balance_after,operation_key,reason)
      values(v_customer,v_transaction,case when v_kind='sale' then 'earn' else 'refund' end,v_points,v_points,0,'pos:'||v_transaction,'POS '||v_kind||' '||left(p_event->>'receiptNumber',100));
  end if;
  -- Benefits are processed separately after this atomic receipt + points write.
  insert into private.integration_events values(p_integration_id,p_event->>'eventId',p_payload_hash,v_transaction,now());
  insert into private.outbox(event_type,aggregate_id,payload) values('transaction.recorded',v_transaction::text,jsonb_build_object('transactionId',v_transaction,'customerId',v_customer));
  insert into private.audit_logs(action,target_id,detail) values('pos.'||v_kind,v_transaction::text,jsonb_build_object('integrationId',p_integration_id,'points',v_points));
  return jsonb_build_object('ok',true,'duplicate',false,'transactionId',v_transaction,'pointsDelta',v_points);
end;
$$;

create function private.issue_prize_version(p_customer uuid,p_campaign text,p_source uuid,p_version int) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_campaign public.campaign_rule_versions; v_prize jsonb; v_award uuid := gen_random_uuid(); v_coupon uuid; v_points int := 0;
begin
  select * into strict v_campaign from public.campaign_rule_versions where campaign_id=p_campaign and version=p_version;
  v_prize := private.draw_prize(v_campaign.config->'prizes');
  if v_prize->>'type'='coupon' then
    insert into public.coupons(customer_id,title,cost_points,display,rule_id)
      values(p_customer,coalesce(v_prize->>'title',v_prize->>'label'),0,v_prize||jsonb_build_object('cat','Campaign prize'),nullif(v_prize->>'ruleId','')::uuid) returning id into v_coupon;
  elsif v_prize->>'type'='points' then
    v_points := (v_prize->>'value')::int;
    insert into public.loyalty_ledger(customer_id,transaction_id,entry_type,delta,lifetime_delta,balance_after,operation_key,reason)
      values(p_customer,p_source,'prize',v_points,v_points,0,'prize:'||v_award,v_prize->>'label');
  end if;
  insert into public.campaign_awards(id,customer_id,campaign_id,campaign_version,source_transaction_id,prize,coupon_id,bonus_points)
    values(v_award,p_customer,p_campaign,v_campaign.version,p_source,v_prize,v_coupon,v_points);
  insert into private.audit_logs(action,target_id,detail) values('campaign.award',v_award::text,jsonb_build_object('customerId',p_customer,'campaign',p_campaign));
  return v_award;
end;
$$;

create function private.apply_campaigns(p_transaction_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_tx public.transactions; v_award public.campaign_awards; v_campaign public.campaign_rule_versions; v_cycle public.mission_cycles;
  v_bonus int; v_hold boolean; v_count int; v_award_id uuid; v_coupon public.coupons; v_source_refund boolean;
begin
  select * into strict v_tx from public.transactions where id=p_transaction_id;
  if v_tx.customer_id is null then return; end if;
  if v_tx.event_type='sale' and v_tx.occurred_at<now()-interval '7 days' then raise exception 'Promotion processing older than seven days requires review'; end if;
  perform 1 from public.loyalty_accounts where customer_id=v_tx.customer_id for update;
  v_hold := exists(select 1 from private.promotion_reviews where customer_id=v_tx.customer_id and resolved_at is null);
  if v_tx.event_type='sale' and not v_hold then
    -- Only one saved multiplier applies to one purchase; additional multipliers
    -- remain queued. Award links allow later refunds to reverse exactly once.
    if v_tx.points_delta>0 then
      select * into v_award from public.campaign_awards where customer_id=v_tx.customer_id and prize->>'type'='double'
        and not revoked and applied_transaction_id is null order by created_at,id limit 1 for update;
      if found then
        insert into public.loyalty_ledger(customer_id,transaction_id,entry_type,delta,lifetime_delta,balance_after,operation_key,reason)
          values(v_tx.customer_id,v_tx.id,'prize',v_tx.points_delta,v_tx.points_delta,0,'double:'||v_award.id,'Double-points prize');
        update public.campaign_awards set applied_transaction_id=v_tx.id,bonus_points=v_tx.points_delta where id=v_award.id;
      end if;
    end if;
    select * into v_campaign from private.campaign_at('shop_wheel',v_tx.occurred_at);
    if v_campaign.active and (
      (select coalesce(sum(total_cents),0) from public.transaction_items where transaction_id=v_tx.id and fuel_grade is null and eligible_for_points)>=(v_campaign.config->>'minimumSpendCents')::int
      or exists(select 1 from public.transaction_items where transaction_id=v_tx.id and eligible_for_points and total_cents>0 and category in (select jsonb_array_elements_text(v_campaign.config->'categories')))
    ) then insert into public.wheel_credits(customer_id,transaction_id,campaign_version) values(v_tx.customer_id,v_tx.id,v_campaign.version); end if;
    select * into v_campaign from private.campaign_at('fuel_mission',v_tx.occurred_at);
    if v_campaign.active and exists(select 1 from public.transaction_items where transaction_id=v_tx.id and litres_milli>0 and total_cents>0)
      then
      select * into v_cycle from public.mission_cycles where customer_id=v_tx.customer_id and starts_at<=v_tx.occurred_at and ends_at>v_tx.occurred_at and award_id is null order by starts_at desc,id limit 1 for update;
      if not found then
        insert into public.mission_cycles(customer_id,starts_at,ends_at,campaign_version) values(v_tx.customer_id,v_tx.occurred_at,v_tx.occurred_at+make_interval(days=>(v_campaign.config->>'windowDays')::int),v_campaign.version) returning * into v_cycle;
      end if;
      select * into strict v_campaign from public.campaign_rule_versions where campaign_id='fuel_mission' and version=v_cycle.campaign_version;
      insert into public.mission_contributions values(v_tx.id,v_cycle.id,v_tx.customer_id,false);
      select count(*) into v_count from public.mission_contributions where cycle_id=v_cycle.id and not revoked;
      if v_count>=(v_campaign.config->>'target')::int then
        v_award_id := private.issue_prize_version(v_tx.customer_id,'fuel_mission',v_tx.id,v_campaign.version);
        update public.mission_cycles set award_id=v_award_id where id=v_cycle.id;
      end if;
    end if;
  elsif v_tx.event_type<>'sale' then
    -- Any refund invalidates that receipt's campaign qualification. Ordinary
    -- loyalty points are still reversed proportionally by the core processor.
    update public.wheel_credits set state='revoked' where transaction_id=v_tx.original_transaction_id;
    update public.mission_contributions set revoked=true where transaction_id=v_tx.original_transaction_id;
    for v_award in select * from public.campaign_awards where customer_id=v_tx.customer_id and (
      source_transaction_id=v_tx.original_transaction_id or applied_transaction_id=v_tx.original_transaction_id
      or id in (select c.award_id from public.mission_cycles c join public.mission_contributions m on m.cycle_id=c.id where m.transaction_id=v_tx.original_transaction_id)
    ) order by id for update loop
      v_source_refund := v_award.source_transaction_id=v_tx.original_transaction_id or v_award.campaign_id='fuel_mission';
      if v_source_refund then v_bonus := v_award.bonus_points-v_award.reversed_points;
      else v_bonus := least(abs(v_tx.points_delta),v_award.bonus_points-v_award.reversed_points); end if;
      if v_bonus>0 then
        insert into public.loyalty_ledger(customer_id,transaction_id,entry_type,delta,lifetime_delta,balance_after,operation_key,reason)
          values(v_tx.customer_id,v_tx.id,'refund',-v_bonus,-v_bonus,0,'prize-refund:'||v_tx.id||':'||v_award.id,'Refunded promotional bonus');
      end if;
      update public.campaign_awards set reversed_points=reversed_points+v_bonus,revoked=revoked or v_source_refund where id=v_award.id;
      if v_source_refund and v_award.coupon_id is not null then
        select * into v_coupon from public.coupons where id=v_award.coupon_id for update;
        if v_coupon.status='active' then update public.coupons set status='revoked' where id=v_coupon.id;
        elsif v_coupon.status='redeemed' then
          insert into private.promotion_reviews(customer_id,award_id,reason) values(v_tx.customer_id,v_award.id,'A refunded qualifying purchase has an already-consumed promotional coupon') on conflict(award_id) do nothing;
        end if;
      end if;
    end loop;
  end if;
  return;
end;
$$;

create or replace function private.spin_wheel(p_request_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_customer uuid := private.require_customer(); v_credit public.wheel_credits; v_award uuid; v_result jsonb;
begin
  if p_request_id is null then raise exception 'A request ID is required'; end if;
  perform 1 from public.loyalty_accounts where customer_id=v_customer for update;
  select result into v_result from private.idempotency_keys where actor_id=auth.uid() and operation='spin' and request_id=p_request_id;
  if found then return v_result; end if;
  if exists(select 1 from private.promotion_reviews where customer_id=v_customer and resolved_at is null) then raise exception 'A refunded promotion needs staff review before another spin'; end if;
  if not exists(select 1 from public.campaigns where id='shop_wheel' and active) then raise exception 'Spin & Win is currently paused'; end if;
  select * into v_credit from public.wheel_credits where customer_id=v_customer and state='available' order by created_at,id limit 1 for update;
  if not found then raise exception 'No spins available'; end if;
  v_award := private.issue_prize_version(v_customer,'shop_wheel',v_credit.transaction_id,v_credit.campaign_version);
  update public.wheel_credits set state='spent',award_id=v_award where id=v_credit.id;
  select jsonb_build_object('ok',true,'prize',prize) into v_result from public.campaign_awards where id=v_award;
  insert into private.idempotency_keys values(auth.uid(),'spin',p_request_id,'{}',v_result,now());
  return v_result;
end;
$$;

create function private.note_pos_issue(p_inbox uuid,p_kind text,p_reference text,p_message text) returns void language sql set search_path='' as $$
  insert into private.pos_issues(inbox_id,kind,reference,message) values(p_inbox,p_kind,p_reference,left(p_message,1000))
    on conflict(inbox_id,kind,reference) do update set message=excluded.message,resolved_at=null,resolved_by=null,resolution=null;
$$;
create function private.finish_pos_issue(p_inbox uuid,p_kind text,p_reference text) returns void language sql set search_path='' as $$
  update private.pos_issues set resolved_at=now(),resolution='Successfully processed on retry'
    where inbox_id=p_inbox and kind=p_kind and reference=p_reference and resolved_at is null;
$$;

create function private.automatic_offer_exception(p_inbox uuid,p_kind text,p_reference text,p_message text) returns void language plpgsql set search_path='' as $$
begin
  perform private.note_pos_issue(p_inbox,p_kind,p_reference,p_message);
  update private.pos_issues set resolved_at=now(),resolution='Automatic policy: retain the verified receipt and full ordinary eligible points; do not grant an unverified promotional benefit.'
    where inbox_id=p_inbox and kind=p_kind and reference=p_reference;
  insert into private.audit_logs(action,target_id,detail) values('pos.offer_exception',p_inbox::text,
    jsonb_build_object('kind',p_kind,'reference',p_reference,'reason',left(p_message,1000),'decision','ordinary_points_preserved_no_extra_benefit'));
end;
$$;

create function private.apply_pos_benefits(p_inbox uuid,p_transaction uuid,p_event jsonb) returns void language plpgsql security definer set search_path='' as $$
declare
  v_tx public.transactions; v_coupon_id uuid; v_coupon public.coupons; v_rule public.reward_rules; v_claim jsonb;
  v_line public.transaction_items; v_raw_line jsonb; v_map private.pos_product_mappings;
  v_qty int; v_discount int; v_gross int; v_limit int; v_count int; v_error text;
  v_sale jsonb; v_deal public.night_deals; v_historical public.night_deals; v_snapshot jsonb;
begin
  select * into strict v_tx from public.transactions where id=p_transaction;
  if jsonb_array_length(coalesce(p_event->'benefitValidationErrors','[]'))>0 then
    perform private.automatic_offer_exception(p_inbox,'benefits','format',(p_event->'benefitValidationErrors')::text);
  end if;
  if v_tx.event_type<>'sale' then
    if jsonb_array_length(coalesce(p_event->'couponIds','[]'))>0 or jsonb_array_length(coalesce(p_event->'nightDealSales','[]'))>0 then
      perform private.automatic_offer_exception(p_inbox,'benefits','refund','Refunds cannot consume coupons or automatically restock food');
    end if;
    return;
  end if;
  for v_coupon_id in select value::uuid from jsonb_array_elements_text(coalesce(p_event->'couponIds','[]')) order by value loop
    begin
      if exists(select 1 from public.coupons where id=v_coupon_id and status='redeemed' and used_transaction_id=v_tx.id) then continue; end if;
      if exists(select 1 from private.pos_issues where inbox_id=p_inbox and kind='coupon' and reference=v_coupon_id::text and resolved_at is not null) then continue; end if;
      if v_tx.occurred_at<now()-interval '7 days' then raise exception 'Coupon claim older than seven days requires review'; end if;
      select * into v_coupon from public.coupons where id=v_coupon_id for update;
      if not found or v_coupon.customer_id is distinct from v_tx.customer_id or v_coupon.status not in ('active','held') or (v_coupon.status='held' and v_coupon.held_for_transaction_id is distinct from v_tx.id) or v_coupon.issued_at>v_tx.occurred_at or v_coupon.expires_at<=v_tx.occurred_at then
        raise exception 'Coupon was unavailable, expired, or belonged to another customer at purchase time';
      end if;
      select * into v_rule from public.reward_rules where id=v_coupon.rule_id;
      if not found or not v_rule.enabled then raise exception 'Coupon has no published product/discount rule'; end if;
      if cardinality(v_rule.station_ids)>0 and not(v_tx.station_id=any(v_rule.station_ids)) then raise exception 'Coupon is not valid at this station'; end if;
      if v_tx.total_cents<v_rule.minimum_spend_cents then raise exception 'Coupon minimum spend was not reached'; end if;
      select count(*),min(value::text)::jsonb into v_count,v_claim from jsonb_array_elements(coalesce(p_event->'couponRedemptions','[]')) where value->>'couponId'=v_coupon_id::text;
      if v_count<>1 then raise exception 'Provide one receipt line and discount claim for this coupon'; end if;
      select * into v_line from public.transaction_items where transaction_id=v_tx.id and line_id=v_claim->>'lineId';
      if not found then raise exception 'Coupon receipt line was not found'; end if;
      select * into v_map from private.pos_product_mappings where id=v_line.mapping_id;
      if not found or not exists(select 1 from public.reward_rule_products where rule_id=v_rule.id and product_kind=v_map.product_kind and product_id=v_map.product_id) then raise exception 'Receipt SKU is not mapped to a product allowed by this coupon'; end if;
      v_qty:=(v_claim->>'quantityMilli')::int; v_discount:=(v_claim->>'discountCents')::int;
      if v_qty is null or v_qty<=0 or v_qty>least(v_rule.max_quantity_milli,v_line.quantity_milli) or v_discount is null or v_discount<=0 then raise exception 'Invalid coupon quantity or discount'; end if;
      if (select sum((value->>'quantityMilli')::int) from jsonb_array_elements(p_event->'couponRedemptions') where value->>'lineId'=v_line.line_id)>v_line.quantity_milli then raise exception 'Coupon quantities exceed the receipt line'; end if;
      if exists(select 1 from jsonb_array_elements(coalesce(p_event->'nightDealSales','[]')) where value->>'lineId'=v_line.line_id) then raise exception 'Coupons cannot be combined with a night deal on the same receipt line'; end if;
      if not v_rule.allow_stacking and (select count(*) from jsonb_array_elements(p_event->'couponRedemptions') where value->>'lineId'=v_line.line_id)>1 then raise exception 'Coupon stacking is not allowed'; end if;
      select value into v_raw_line from jsonb_array_elements(p_event->'items') where value->>'lineId'=v_line.line_id;
      v_gross:=(v_raw_line->>'grossTotalCents')::int;
      if v_gross is null or v_gross<>v_line.total_cents+(select sum((value->>'discountCents')::int) from jsonb_array_elements(p_event->'couponRedemptions') where value->>'lineId'=v_line.line_id) then raise exception 'Original line price must equal final price plus all claimed discounts'; end if;
      v_limit:=least(v_rule.max_discount_cents,case v_rule.discount_kind
        when 'free' then floor(v_gross::numeric*v_qty/v_line.quantity_milli)::int
        when 'fixed' then v_rule.discount_value
        when 'percent' then floor(v_gross::numeric*v_qty/v_line.quantity_milli*v_rule.discount_value/100)::int end);
      if v_discount>v_limit then raise exception 'Coupon discount exceeds its published limit'; end if;
      update public.coupons set status='redeemed',used_at=v_tx.occurred_at,used_transaction_id=v_tx.id,held_for_transaction_id=null where id=v_coupon.id;
      insert into public.coupon_redemptions(coupon_id,transaction_id,line_id,rule_id,quantity_milli,discount_cents)
        values(v_coupon.id,v_tx.id,v_line.line_id,v_rule.id,v_qty,v_discount);
      perform private.finish_pos_issue(p_inbox,'coupon',v_coupon_id::text);
    exception when others then
      get stacked diagnostics v_error=message_text;
      if sqlstate in ('40001','40P01','55P03','53300','08006') then raise; end if;
      perform private.automatic_offer_exception(p_inbox,'coupon',v_coupon_id::text,v_error);
      -- The trusted POS says this member's coupon was used. Close it without
      -- falsely recording a validated redemption or leaving a reuse loophole.
      update public.coupons set status='revoked',held_for_transaction_id=null,used_transaction_id=v_tx.id
        where id=v_coupon_id and customer_id=v_tx.customer_id and status='active';
    end;
  end loop;
  for v_sale in select value from jsonb_array_elements(coalesce(p_event->'nightDealSales','[]')) order by value->>'dealId' loop
    begin
      if exists(select 1 from public.transaction_night_deals where transaction_id=v_tx.id and night_deal_id=(v_sale->>'dealId')::uuid) then continue; end if;
      if exists(select 1 from private.pos_issues where inbox_id=p_inbox and kind='night_deal' and reference=v_sale->>'dealId' and resolved_at is not null) then continue; end if;
      if v_tx.occurred_at<now()-interval '7 days' then raise exception 'Night-deal claim older than seven days requires review'; end if;
      select * into v_deal from public.night_deals where id=(v_sale->>'dealId')::uuid for update;
      if not found then raise exception 'Night deal was not found'; end if;
      select snapshot into v_snapshot from private.night_deal_versions where deal_id=v_deal.id and effective_from<=v_tx.occurred_at order by effective_from desc,version desc limit 1;
      if v_snapshot is null then raise exception 'Night deal was not published at purchase time'; end if;
      v_historical:=jsonb_populate_record(null::public.night_deals,v_snapshot);
      if v_historical.station_id<>v_tx.station_id or v_historical.status<>'active' or v_historical.starts_at>v_tx.occurred_at or v_historical.sell_until<=v_tx.occurred_at or v_historical.safety_cutoff_at<=v_tx.occurred_at then raise exception 'Night deal was unavailable at purchase time'; end if;
      v_qty:=(v_sale->>'quantity')::int;
      if v_qty is null or v_qty<=0 or v_deal.quantity_available<v_qty then raise exception 'Night-deal stock needs review; receipt has been retained'; end if;
      select * into v_line from public.transaction_items where transaction_id=v_tx.id and line_id=v_sale->>'lineId';
      if not found or v_line.quantity_milli<>v_qty::bigint*1000 then raise exception 'A night deal must identify its complete receipt line and quantity'; end if;
      select * into v_map from private.pos_product_mappings where id=v_line.mapping_id;
      if not found or v_map.product_kind<>'menu' or v_historical.product_id is null or v_map.product_id<>v_historical.product_id then raise exception 'Night-deal SKU does not match the published product'; end if;
      if v_line.total_cents<>v_historical.deal_price_cents::bigint*v_qty then raise exception 'Night-deal receipt price differs from the published price'; end if;
      if (select count(*) from jsonb_array_elements(p_event->'nightDealSales') where value->>'lineId'=v_line.line_id)<>1 then raise exception 'Only one night deal may use a receipt line'; end if;
      if exists(select 1 from jsonb_array_elements(coalesce(p_event->'couponRedemptions','[]')) where value->>'lineId'=v_line.line_id) then raise exception 'Night deals cannot be stacked with coupons'; end if;
      perform set_config('pearl.stock_transaction',v_tx.id::text,true);
      update public.night_deals set quantity_available=quantity_available-v_qty,status=case when quantity_available=v_qty then 'sold_out' else status end,
        version=version+1,updated_at=now() where id=v_deal.id;
      perform set_config('pearl.stock_transaction','',true);
      insert into public.transaction_night_deals(transaction_id,night_deal_id,quantity,deal_price_cents,line_id)
        values(v_tx.id,v_deal.id,v_qty,v_historical.deal_price_cents,v_line.line_id);
      perform private.finish_pos_issue(p_inbox,'night_deal',v_deal.id::text);
    exception when others then
      get stacked diagnostics v_error=message_text;
      if sqlstate in ('40001','40P01','55P03','53300','08006') then raise; end if;
      perform private.automatic_offer_exception(p_inbox,'night_deal',v_sale->>'dealId',v_error);
    end;
  end loop;
end;
$$;

create function private.ingest_pos(p_integration_id uuid,p_event jsonb,p_payload_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_integration private.pos_integrations; v_inbox private.pos_inbox;
begin
  select * into v_integration from private.pos_integrations where id=p_integration_id and active for share;
  if not found or v_integration.provider is distinct from p_event->>'provider' or v_integration.external_store_id is distinct from p_event->>'storeId' then raise exception 'Integration not authorised' using errcode='42501'; end if;
  if jsonb_typeof(p_event) is distinct from 'object' or p_payload_hash is null or p_payload_hash!~'^[0-9a-f]{64}$' or coalesce((p_event->>'contractVersion')::int,0)<>1 then raise exception 'Invalid POS intake'; end if;
  if p_event->>'eventId' is null or jsonb_typeof(p_event->'items') is distinct from 'array' then raise exception 'Missing receipt identity/items'; end if;
  -- Serialize the very short intake step per station. Processing locks individual receipts.
  perform pg_advisory_xact_lock(hashtextextended('intake:'||p_integration_id::text,0));
  select i.* into v_inbox from private.pos_deliveries d join private.pos_inbox i on i.id=d.inbox_id where d.integration_id=p_integration_id and d.event_id=p_event->>'eventId';
  if not found then
    select * into v_inbox from private.pos_inbox where integration_id=p_integration_id and event_type=p_event->>'eventType' and external_id=p_event->>'externalTransactionId';
  end if;
  if v_inbox.id is not null then
    if v_inbox.payload_hash<>p_payload_hash or (v_inbox.payload-'eventId') is distinct from (p_event-'eventId') then raise exception 'POS ID reused with different content' using errcode='23505'; end if;
  else
    insert into private.pos_inbox(integration_id,event_type,external_id,payload_hash,payload)
      values(p_integration_id,p_event->>'eventType',p_event->>'externalTransactionId',p_payload_hash,p_event) returning * into v_inbox;
  end if;
  insert into private.pos_deliveries(integration_id,event_id,inbox_id) values(p_integration_id,p_event->>'eventId',v_inbox.id) on conflict do nothing;
  return jsonb_build_object('ok',true,'accepted',true,'inboxId',v_inbox.id,'state',v_inbox.state,'transactionId',v_inbox.transaction_id);
end;
$$;
create function public.ingest_pos(p_integration_id uuid,p_event jsonb,p_payload_hash text) returns jsonb language sql security invoker set search_path='' as $$ select private.ingest_pos(p_integration_id,p_event,p_payload_hash); $$;

create function private.process_pos_inbox(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_inbox private.pos_inbox; v_result jsonb; v_error text; v_code text; v_duplicate boolean;
begin
  select * into strict v_inbox from private.pos_inbox where id=p_id for update;
  v_duplicate:=v_inbox.transaction_id is not null;
  if v_inbox.state='processed' then
    return jsonb_build_object('ok',true,'accepted',true,'duplicate',true,'inboxId',p_id,'state','processed','transactionId',v_inbox.transaction_id,
      'pointsDelta',(select points_delta from public.transactions where id=v_inbox.transaction_id));
  end if;
  update private.pos_inbox set attempts=attempts+1,updated_at=now() where id=p_id;
  begin
    v_result:=private.record_pos_core(v_inbox.integration_id,v_inbox.payload,v_inbox.payload_hash);
    if (v_result->>'duplicate')::boolean and v_inbox.transaction_id is null then
      -- A receipt predating the inbox migration has already had its campaigns applied.
      v_inbox.campaigns_done:=true;
      update private.pos_inbox set campaigns_done=true where id=p_id;
    end if;
    v_inbox.transaction_id:=(v_result->>'transactionId')::uuid;
    update private.pos_inbox set transaction_id=v_inbox.transaction_id,last_error=null where id=p_id;
    perform private.finish_pos_issue(p_id,'receipt','receipt');
  exception when others then
    get stacked diagnostics v_error=message_text,v_code=returned_sqlstate;
    update private.pos_inbox set state=case when (v_code in ('40001','40P01','55P03','53300','08006') or v_error like 'Original sale not found%') and attempts<10 then 'retry' else 'review' end,
      next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::int)),last_error=left(v_error,1000) where id=p_id;
    perform private.note_pos_issue(p_id,'receipt','receipt',v_error);
    return jsonb_build_object('ok',true,'accepted',true,'inboxId',p_id,'state',(select state from private.pos_inbox where id=p_id),'transactionId',null,'message','Receipt retained for processing/review');
  end;
  -- A transient benefit failure must not roll back the already-written receipt
  -- and normal points, or abort the rest of a scheduled batch.
  begin
  if not v_inbox.campaigns_done then
    begin
      perform private.apply_campaigns(v_inbox.transaction_id);
      update private.pos_inbox set campaigns_done=true where id=p_id;
      perform private.finish_pos_issue(p_id,'campaign','campaign');
    exception when others then
      get stacked diagnostics v_error=message_text;
      if sqlstate in ('40001','40P01','55P03','53300','08006') then raise; end if;
      perform private.automatic_offer_exception(p_id,'campaign','campaign',v_error);
      update private.pos_inbox set campaigns_done=true where id=p_id;
    end;
  end if;
  perform private.apply_pos_benefits(p_id,v_inbox.transaction_id,v_inbox.payload);
  perform private.finish_pos_issue(p_id,'processing','benefits');
  exception when others then
    get stacked diagnostics v_error=message_text,v_code=returned_sqlstate;
    update private.pos_inbox set state=case when v_code in ('40001','40P01','55P03','53300','08006') and attempts<10 then 'retry' else 'review' end,
      next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::int)),last_error=left(v_error,1000) where id=p_id;
    perform private.note_pos_issue(p_id,'processing','benefits',v_error);
    return v_result||jsonb_build_object('accepted',true,'inboxId',p_id,'state',(select state from private.pos_inbox where id=p_id));
  end;
  update private.pos_inbox set state=case when exists(select 1 from private.pos_issues where inbox_id=p_id and resolved_at is null) then 'review' else 'processed' end,
    updated_at=now() where id=p_id returning state into v_inbox.state;
  return v_result||jsonb_build_object('accepted',true,'duplicate',v_duplicate,'inboxId',p_id,'state',v_inbox.state);
end;
$$;
create function private.process_pos(p_integration_id uuid,p_inbox_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from private.pos_inbox where id=p_inbox_id and integration_id=p_integration_id) then raise exception 'Receipt not found for integration' using errcode='42501'; end if;
  return private.process_pos_inbox(p_inbox_id);
end;
$$;
create function public.process_pos(p_integration_id uuid,p_inbox_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.process_pos(p_integration_id,p_inbox_id); $$;
-- Compatibility entrypoint for trusted integrations/tests. The Edge Function uses
-- TWO committed RPCs (ingest, then process), so a timeout cannot erase intake.
create or replace function private.record_pos(p_integration_id uuid,p_event jsonb,p_payload_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_intake jsonb;
begin
  v_intake:=private.ingest_pos(p_integration_id,p_event,p_payload_hash);
  return private.process_pos_inbox((v_intake->>'inboxId')::uuid);
end;
$$;
create function private.process_pos_batch() returns int language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_count int:=0;
begin
  for v_id in select id from private.pos_inbox where state in ('pending','retry') and next_attempt_at<=now() order by next_attempt_at,id limit 20 for update skip locked loop
    perform private.process_pos_inbox(v_id); v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
create function private.pos_receipt_status(p_integration_id uuid,p_external_id text,p_event_type text) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('accepted',true,'inboxId',id,'state',state,'transactionId',transaction_id) from private.pos_inbox
    where integration_id=p_integration_id and external_id=p_external_id and event_type=p_event_type;
$$;
create function public.pos_receipt_status(p_integration_id uuid,p_external_id text,p_event_type text) returns jsonb language sql stable security invoker set search_path='' as $$ select private.pos_receipt_status(p_integration_id,p_external_id,p_event_type); $$;
grant execute on function private.ingest_pos(uuid,jsonb,text),public.ingest_pos(uuid,jsonb,text),private.process_pos(uuid,uuid),public.process_pos(uuid,uuid),private.pos_receipt_status(uuid,text,text),public.pos_receipt_status(uuid,text,text) to service_role;

create function private.reconciliation_report(p_manifest uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_manifest private.pos_reconciliation_manifests; v_differences jsonb;
begin
  select * into strict v_manifest from private.pos_reconciliation_manifests where id=p_manifest;
  with expected as (
    select x->>'externalTransactionId' as external_id,x->>'eventType' as event_type,(x->>'totalCents')::bigint as total_cents from jsonb_array_elements(v_manifest.manifest) x
  ), actual as (
    select external_id,event_type,total_cents from public.transactions where integration_id=v_manifest.integration_id and business_date=v_manifest.business_date
  ) select coalesce(jsonb_agg(jsonb_build_object('externalId',coalesce(e.external_id,a.external_id),'eventType',coalesce(e.event_type,a.event_type),
      'expectedCents',e.total_cents,'recordedCents',a.total_cents,'problem',case when a.external_id is null then 'missing_receipt' when e.external_id is null then 'unexpected_receipt' else 'amount_mismatch' end)),'[]')
    into v_differences from expected e full join actual a using(external_id,event_type) where e.external_id is null or a.external_id is null or e.total_cents<>a.total_cents;
  return jsonb_build_object('manifestId',p_manifest,'businessDate',v_manifest.business_date,'differences',v_differences,'matched',jsonb_array_length(v_differences)=0,
    'expectedCount',jsonb_array_length(v_manifest.manifest),'recordedCount',(select count(*) from public.transactions where integration_id=v_manifest.integration_id and business_date=v_manifest.business_date));
end;
$$;
create function private.submit_pos_reconciliation(p_integration_id uuid,p_business_date date,p_receipts jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_row jsonb;
begin
  if not exists(select 1 from private.pos_integrations where id=p_integration_id and active) then raise exception 'Integration not authorised' using errcode='42501'; end if;
  if p_business_date is null or jsonb_typeof(p_receipts) is distinct from 'array' or jsonb_array_length(p_receipts)>10000 or octet_length(p_receipts::text)>2000000 then raise exception 'Invalid reconciliation manifest'; end if;
  for v_row in select value from jsonb_array_elements(p_receipts) loop
    if coalesce(v_row->>'eventType','') not in ('sale','refund','void') or coalesce(length(v_row->>'externalTransactionId'),0) not between 1 and 160 or coalesce((v_row->>'totalCents')::bigint,-1) not between 0 and 100000000 then raise exception 'Invalid manifest receipt'; end if;
    if exists(select 1 from jsonb_object_keys(v_row) k where k not in ('eventType','externalTransactionId','totalCents')) then raise exception 'Manifest accepts receipt IDs, type and total only'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_receipts) x group by x->>'eventType',x->>'externalTransactionId' having count(*)>1) then raise exception 'Duplicate manifest receipt'; end if;
  insert into private.pos_reconciliation_manifests(integration_id,business_date,manifest,created_by) values(p_integration_id,p_business_date,p_receipts,auth.uid()) returning id into v_id;
  return private.reconciliation_report(v_id);
end;
$$;
create function public.submit_pos_reconciliation(p_integration_id uuid,p_business_date date,p_receipts jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.submit_pos_reconciliation(p_integration_id,p_business_date,p_receipts); $$;
grant execute on function private.submit_pos_reconciliation(uuid,date,jsonb),public.submit_pos_reconciliation(uuid,date,jsonb) to service_role;

create function private.database_health() returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'pendingReceipts',(select count(*) from private.pos_inbox where state in ('pending','retry')),
    'oldestPendingAt',(select min(received_at) from private.pos_inbox where state in ('pending','retry')),
    'openIssues',(select count(*) from private.pos_issues where resolved_at is null),
    'balanceMismatches',(select count(*) from public.loyalty_accounts a where balance<>(select coalesce(sum(delta),0) from public.loyalty_ledger l where l.customer_id=a.customer_id)),
    'receiptLedgerMismatches',(select count(*) from public.transactions t where t.customer_id is not null and t.points_delta<>(select coalesce(sum(delta),0) from public.loyalty_ledger l where l.transaction_id=t.id and l.operation_key='pos:'||t.id)),
    'stockMismatches',(select count(*) from public.night_deals d where quantity_available<>(select coalesce(sum(delta),0) from private.deal_stock_movements m where m.deal_id=d.id)),
    'unreconciledBusinessDays',(select count(*) from (select distinct integration_id,business_date from public.transactions t where not exists(select 1 from private.pos_reconciliation_manifests m where m.integration_id=t.integration_id and m.business_date=t.business_date)) x)
  );
$$;
create function private.admin_database_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_admin();
  return jsonb_build_object('health',private.database_health(),
    'catalog',coalesce((select jsonb_agg(to_jsonb(r)) from (select kind,id,title from public.catalog_items where kind in ('menu','fuel','rewards') order by kind,title limit 1000) r),'[]'),
    'stations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.stations),'[]'),
    'receipts',coalesce((select jsonb_agg(to_jsonb(r)) from (select i.id,i.integration_id,i.external_id,i.event_type,i.state,i.transaction_id,i.attempts,i.last_error,i.received_at,
      i.payload->>'receiptNumber' as receipt_number,i.payload->>'totalCents' as total_cents from private.pos_inbox i order by i.received_at desc limit 100) r),'[]'),
    'issues',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from private.pos_issues where resolved_at is null order by created_at limit 100) r),'[]'),
    'automaticExceptions',coalesce((select jsonb_agg(to_jsonb(r)) from (select id,kind,reference,message,resolution,resolved_at from private.pos_issues where resolved_at is not null and resolution like 'Automatic policy:%' order by resolved_at desc limit 50) r),'[]'),
    'integrations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'provider',provider,'stationId',station_id,'storeId',external_store_id,'active',active)) from private.pos_integrations),'[]'),
    'mappings',coalesce((select jsonb_agg(to_jsonb(r)) from (select distinct on(integration_id,sku) * from private.pos_product_mappings order by integration_id,sku,effective_from desc limit 500) r),'[]'),
    'earningRules',coalesce((select jsonb_agg(to_jsonb(r) order by effective_from desc) from public.loyalty_programs r),'[]'),
    'rewardRules',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from public.reward_rules order by created_at desc limit 100) r),'[]'),
    'campaigns',coalesce((select jsonb_agg(to_jsonb(c)) from public.campaigns c),'[]'),
    'stockMovements',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from private.deal_stock_movements order by created_at desc limit 100) r),'[]'),
    'reconciliations',coalesce((select jsonb_agg(private.reconciliation_report(id)) from (select distinct on(integration_id,business_date) id,integration_id,business_date from private.pos_reconciliation_manifests order by integration_id,business_date,created_at desc limit 30) r),'[]'));
end;
$$;
create function public.admin_database_overview() returns jsonb language sql stable security invoker set search_path='' as $$ select private.admin_database_overview(); $$;

create function private.admin_database_action(p_action text,p_input jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_prior private.idempotency_keys; v_payload jsonb:=jsonb_build_object('action',p_action,'input',p_input); v_result jsonb:='{}';
  v_id uuid; v_version int; v_effective timestamptz; v_product jsonb; v_campaign public.campaigns; v_issue private.pos_issues; v_reason text;
begin
  perform private.require_admin();
  if p_request_id is null or jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Request ID and input are required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':database:'||p_request_id::text,0));
  select * into v_prior from private.idempotency_keys where actor_id=auth.uid() and operation='database' and request_id=p_request_id;
  if found then
    if v_prior.payload<>v_payload then raise exception 'Request ID reused with different input' using errcode='23505'; end if;
    return v_prior.result;
  end if;
  case p_action
    when 'mapping' then
      perform pg_advisory_xact_lock(hashtextextended('mapping:'||(p_input->>'integrationId')||':'||(p_input->>'sku'),0));
      v_effective:=case when exists(select 1 from private.pos_product_mappings where integration_id=(p_input->>'integrationId')::uuid and sku=p_input->>'sku') then clock_timestamp() else '-infinity'::timestamptz end;
      insert into private.pos_product_mappings(integration_id,sku,product_kind,product_id,category,eligible_for_points,effective_from,created_by)
        values((p_input->>'integrationId')::uuid,trim(p_input->>'sku'),p_input->>'productKind',p_input->>'productId',lower(trim(p_input->>'category')),coalesce((p_input->>'eligibleForPoints')::boolean,true),v_effective,auth.uid()) returning id into v_id;
      v_result:=jsonb_build_object('id',v_id);
    when 'earning_rule' then
      perform pg_advisory_xact_lock(hashtextextended('publish:pearl-rewards-au',0));
      v_effective:=(p_input->>'effectiveFrom')::timestamptz;
      if v_effective is null or v_effective<now() then raise exception 'Choose a future effective time; published rules cannot be backdated'; end if;
      select coalesce(max(version),0)+1 into v_version from public.loyalty_programs where id='pearl-rewards-au';
      insert into public.loyalty_programs(id,version,points_numerator,points_denominator,excluded_categories,effective_from)
        values('pearl-rewards-au',v_version,(p_input->>'numerator')::int,(p_input->>'denominator')::int,array(select lower(value) from jsonb_array_elements_text(p_input->'excludedCategories')),v_effective);
      v_result:=jsonb_build_object('version',v_version);
    when 'reward_rule' then
      perform pg_advisory_xact_lock(hashtextextended('reward-rule:'||coalesce(p_input->>'rewardId','campaign'),0));
      if jsonb_typeof(p_input->'products') is distinct from 'array' or jsonb_array_length(p_input->'products') not between 1 and 100 then raise exception 'Choose at least one allowed product'; end if;
      if exists(select 1 from jsonb_array_elements_text(coalesce(p_input->'stationIds','[]')) s where not exists(select 1 from public.stations where id=s)) then raise exception 'Unknown allowed station'; end if;
      select coalesce(max(version),0)+1 into v_version from public.reward_rules where reward_id is not distinct from nullif(p_input->>'rewardId','');
      insert into public.reward_rules(reward_id,name,version,effective_from,enabled,discount_kind,discount_value,max_discount_cents,minimum_spend_cents,max_quantity_milli,allow_stacking,station_ids,created_by)
        values(nullif(p_input->>'rewardId',''),p_input->>'name',v_version,clock_timestamp(),coalesce((p_input->>'enabled')::boolean,true),p_input->>'discountKind',coalesce((p_input->>'discountValue')::int,0),
          (p_input->>'maxDiscountCents')::int,coalesce((p_input->>'minimumSpendCents')::int,0),coalesce((p_input->>'maxQuantityMilli')::int,1000),coalesce((p_input->>'allowStacking')::boolean,false),array(select value from jsonb_array_elements_text(coalesce(p_input->'stationIds','[]'))),auth.uid()) returning id into v_id;
      for v_product in select value from jsonb_array_elements(p_input->'products') loop
        insert into public.reward_rule_products values(v_id,v_product->>'kind',v_product->>'id');
      end loop;
      if nullif(p_input->>'campaignId','') is not null then
        select * into strict v_campaign from public.campaigns where id=p_input->>'campaignId' for update;
        if not exists(select 1 from jsonb_array_elements(v_campaign.config->'prizes') p where coalesce(p->>'id',p->>'label')=p_input->>'prizeKey' and p->>'type'='coupon') then raise exception 'Select a campaign coupon prize'; end if;
        update public.campaigns set config=jsonb_set(config,'{prizes}',(select jsonb_agg(case when coalesce(p->>'id',p->>'label')=p_input->>'prizeKey' then p||jsonb_build_object('ruleId',v_id) else p end) from jsonb_array_elements(config->'prizes') p)),updated_at=now() where id=v_campaign.id;
      end if;
      v_result:=jsonb_build_object('id',v_id,'version',v_version);
    when 'campaign_rule' then
      update public.campaigns set config=p_input->'config',updated_at=now() where id=p_input->>'id' and version=(p_input->>'version')::int;
      if not found then raise exception 'Campaign changed. Reload before publishing.' using errcode='40001'; end if;
    when 'retry' then
      if coalesce(length(trim(p_input->>'reason')),0)<5 then raise exception 'Explain why this receipt is being retried'; end if;
      v_result:=private.process_pos_inbox((p_input->>'id')::uuid);
    when 'resolve' then
      v_reason:=trim(p_input->>'reason');
      if v_reason is null or length(v_reason) not between 5 and 500 then raise exception 'A resolution of 5-500 characters is required'; end if;
      select * into strict v_issue from private.pos_issues where id=(p_input->>'id')::uuid for update;
      if v_issue.kind='receipt' then raise exception 'A missing receipt must be corrected and retried; it cannot be dismissed'; end if;
      update private.pos_issues set resolved_at=now(),resolved_by=auth.uid(),resolution=v_reason where id=v_issue.id;
      if v_issue.kind='coupon' then update public.coupons set status='revoked',held_for_transaction_id=null where id=v_issue.reference::uuid and status='held' and held_for_transaction_id=(select transaction_id from private.pos_inbox where id=v_issue.inbox_id); end if;
      if v_issue.kind='campaign' then update private.pos_inbox set campaigns_done=true where id=v_issue.inbox_id; end if;
      update private.pos_inbox set state='processed' where id=v_issue.inbox_id and transaction_id is not null and not exists(select 1 from private.pos_issues where inbox_id=v_issue.inbox_id and resolved_at is null);
    when 'reconcile' then
      v_result:=private.submit_pos_reconciliation((p_input->>'integrationId')::uuid,(p_input->>'businessDate')::date,p_input->'receipts');
    else raise exception 'Unsupported database action';
  end case;
  insert into private.audit_logs(actor_user_id,action,target_id,detail) values(auth.uid(),'database.'||p_action,coalesce(v_id::text,p_input->>'id',p_action),jsonb_build_object('requestId',p_request_id,'input',p_input));
  insert into private.idempotency_keys values(auth.uid(),'database',p_request_id,v_payload,v_result,now());
  return v_result;
end;
$$;
create function public.admin_database_action(p_action text,p_input jsonb,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.admin_database_action(p_action,p_input,p_request_id); $$;
grant execute on function private.admin_database_overview(),public.admin_database_overview(),private.admin_database_action(text,jsonb,uuid),public.admin_database_action(text,jsonb,uuid) to authenticated;

create function private.receipt_processing_status(p_transaction_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.transactions where id=p_transaction_id and (customer_id=private.customer_id() or private.is_admin())) then raise exception 'Receipt access denied' using errcode='42501'; end if;
  return jsonb_build_object('state',coalesce((select state from private.pos_inbox where transaction_id=p_transaction_id),'processed'));
end;
$$;
create function public.receipt_processing_status(p_transaction_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.receipt_processing_status(p_transaction_id); $$;
grant execute on function private.receipt_processing_status(uuid),public.receipt_processing_status(uuid) to authenticated;

create or replace function private.save_catalog(p_kind text,p_item jsonb) returns text language plpgsql security definer set search_path = '' as $$
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
      if v_deal.quantity_available is distinct from (p_item->>'quantityAvailable')::int and coalesce(length(trim(p_item->>'stockReason')),0)<5 then raise exception 'Explain the stock adjustment (at least 5 characters)'; end if;
    end if;
    perform set_config('pearl.stock_reason',coalesce(p_item->>'stockReason','Opening stock'),true);
    v_start := (p_item->>'startsAt')::timestamptz; v_end := (p_item->>'sellUntil')::timestamptz; v_cutoff := (p_item->>'safetyCutoffAt')::timestamptz;
    v_date := (v_start at time zone v_station.timezone)::date;
    if v_cutoff > ((v_date+1)::timestamp at time zone v_station.timezone) then raise exception 'Food-safety cutoff cannot be later than the end of its local business day'; end if;
    if p_item->>'status'='active' and v_end<=now() then raise exception 'An active offer must end in the future'; end if;
    insert into public.night_deals(id,station_id,product_name,description,img,original_price_cents,deal_price_cents,quantity_available,status,business_date,starts_at,sell_until,safety_cutoff_at,created_by,updated_by,product_id)
      values(v_id::uuid,v_station.id,trim(p_item->>'productName'),coalesce(p_item->>'description',''),coalesce(p_item->>'img','🥧'),
        (p_item->>'originalPriceCents')::int,(p_item->>'dealPriceCents')::int,(p_item->>'quantityAvailable')::int,coalesce(p_item->>'status','active'),
        v_date,v_start,v_end,v_cutoff,auth.uid(),auth.uid(),nullif(p_item->>'productId',''))
      on conflict(id) do update set product_name=excluded.product_name,description=excluded.description,img=excluded.img,
        original_price_cents=excluded.original_price_cents,deal_price_cents=excluded.deal_price_cents,quantity_available=excluded.quantity_available,
        product_id=excluded.product_id,status=excluded.status,business_date=excluded.business_date,starts_at=excluded.starts_at,sell_until=excluded.sell_until,safety_cutoff_at=excluded.safety_cutoff_at,
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
  perform set_config('pearl.stock_reason','',true);
  insert into private.audit_logs(actor_user_id,action,target_id,detail) values(auth.uid(),'catalog.save',p_kind||':'||v_id,jsonb_build_object('previousVersion',v_version));
  return v_id;
end;
$$;
