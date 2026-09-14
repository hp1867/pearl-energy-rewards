-- Pearl Energy / AUD. Append new migrations; never edit an applied migration.
-- public contains RLS-protected read models; private contains privileged code,
-- staff authorisation, integration configuration and operational audit data.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
-- PostgreSQL gives PUBLIC function execution globally by default. A per-schema
-- REVOKE cannot undo that global default; remove it before creating any RPC.
alter default privileges revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  customer_number bigint generated always as identity (start with 10000000) unique,
  membership_code text not null unique default ('PE-' || upper(replace(gen_random_uuid()::text, '-', ''))),
  first_name text not null default '' check (length(first_name) <= 80),
  last_name text not null default '' check (length(last_name) <= 80),
  mobile text not null default '' check (length(mobile) <= 24),
  dob date,
  preferences jsonb not null default '{}' check (jsonb_typeof(preferences) = 'object' and octet_length(preferences::text) <= 4096),
  status text not null default 'active' check (status in ('active','suspended','closed')),
  schema_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_created_idx on public.customers(created_at desc, id);

create table public.loyalty_accounts (
  customer_id uuid primary key references public.customers(id),
  balance bigint not null default 0 check (abs(balance) <= 9000000000000),
  lifetime_points bigint not null default 0 check (lifetime_points >= 0),
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table public.stations (
  id text primary key check (length(id) between 1 and 100),
  name text not null check (length(name) between 1 and 160),
  city text not null default '', state text not null default '',
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  timezone text not null default 'Australia/Sydney',
  active boolean not null default true,
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 16384),
  version int not null default 1,
  updated_at timestamptz not null default now()
);

-- Presentation attributes are flexible JSON; monetary values and reward costs
-- are typed columns. These shared catalogs never hold customer balances.
create table public.catalog_items (
  kind text not null check (kind in ('categories','menu','offers','rewards','fuel','notifs')),
  id text not null check (length(id) between 1 and 100),
  title text not null check (length(title) between 1 and 240),
  price_cents int check (price_cents between 0 and 100000000),
  points_cost int check (points_cost between 1 and 1000000),
  in_stock boolean not null default true,
  unit_price_micros bigint check (unit_price_micros between 0 and 100000000),
  category_kind text generated always as ('categories'::text) stored,
  category_id text,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 16384),
  version int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (kind,id),
  foreign key (category_kind,category_id) references public.catalog_items(kind,id),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (kind <> 'rewards' or points_cost is not null),
  check (kind <> 'menu' or price_cents is not null),
  check (kind <> 'fuel' or unit_price_micros is not null)
);
create index catalog_visible_idx on public.catalog_items(kind,ends_at,id) where active;
create index catalog_category_idx on public.catalog_items(category_kind,category_id);

create table public.night_deals (
  id uuid primary key default gen_random_uuid(),
  station_id text not null references public.stations(id),
  product_name text not null check (length(product_name) between 1 and 160),
  description text not null default '' check (length(description) <= 1000),
  img text not null default '🥧' check (length(img) <= 200),
  original_price_cents int not null check (original_price_cents between 1 and 10000000),
  deal_price_cents int not null check (deal_price_cents >= 0 and deal_price_cents < original_price_cents),
  quantity_available int not null check (quantity_available between 0 and 100000),
  status text not null default 'active' check (status in ('active','paused','sold_out','expired')),
  business_date date not null,
  starts_at timestamptz not null,
  sell_until timestamptz not null,
  safety_cutoff_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < sell_until and sell_until <= safety_cutoff_at)
);
create index night_deals_visible_idx on public.night_deals(sell_until,station_id) where status = 'active' and quantity_available > 0;
create index night_deals_station_idx on public.night_deals(station_id,sell_until desc);
create index night_deals_creators_idx on public.night_deals(created_by);
create index night_deals_editors_idx on public.night_deals(updated_by);

create table private.staff_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','branch_manager')),
  display_name text not null default '' check (length(display_name) <= 160),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
create table private.staff_stations (
  user_id uuid not null references private.staff_access(user_id) on delete cascade,
  station_id text not null references public.stations(id),
  primary key(user_id,station_id)
);
create index staff_stations_station_idx on private.staff_stations(station_id);

create table public.loyalty_programs (
  id text not null, version int not null check (version > 0),
  points_numerator int not null check (points_numerator between 0 and 1000),
  points_denominator int not null check (points_denominator between 1 and 1000),
  excluded_categories text[] not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(id,version)
);
create unique index loyalty_program_one_active_idx on public.loyalty_programs(id) where active;
insert into public.loyalty_programs values ('pearl-rewards-au',1,1,1,array['tobacco','lottery','gift-card','cash-out'],true,now());

create table private.pos_integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (length(provider) between 1 and 80),
  station_id text not null references public.stations(id),
  external_store_id text not null check (length(external_store_id) between 1 and 100),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  unique(provider,external_store_id)
);
create index pos_integrations_station_idx on private.pos_integrations(station_id);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references private.pos_integrations(id),
  station_id text not null references public.stations(id),
  customer_id uuid references public.customers(id),
  event_type text not null check (event_type in ('sale','refund','void')),
  external_id text not null check (length(external_id) between 1 and 160),
  original_transaction_id uuid references public.transactions(id),
  terminal_id text not null, receipt_number text not null,
  occurred_at timestamptz not null, business_date date not null,
  currency text not null default 'AUD' check (currency = 'AUD'),
  subtotal_cents int not null check (subtotal_cents between 0 and 100000000),
  tax_cents int not null check (tax_cents between 0 and 100000000),
  total_cents int not null check (total_cents between 0 and 100000000),
  eligible_cents int not null check (eligible_cents between 0 and 100000000),
  points_delta bigint not null,
  program_id text not null, program_version int not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  schema_version int not null default 1,
  created_at timestamptz not null default now(),
  unique(integration_id,event_type,external_id),
  foreign key(program_id,program_version) references public.loyalty_programs(id,version),
  check ((event_type = 'sale' and original_transaction_id is null) or (event_type <> 'sale' and original_transaction_id is not null))
);
create index transactions_customer_idx on public.transactions(customer_id,occurred_at desc,id);
create index transactions_station_idx on public.transactions(station_id,occurred_at desc);
create index transactions_original_idx on public.transactions(original_transaction_id);
create index transactions_program_idx on public.transactions(program_id,program_version);

create table public.transaction_items (
  transaction_id uuid not null references public.transactions(id),
  line_id text not null, sku text, description text not null,
  category text not null, quantity_milli bigint not null check (quantity_milli between 1 and 1000000000),
  unit_price_micros bigint not null check (unit_price_micros between 0 and 10000000000),
  total_cents int not null check (total_cents between 0 and 100000000),
  eligible_for_points boolean not null,
  fuel_grade text, litres_milli bigint check (litres_milli between 0 and 1000000000),
  primary key(transaction_id,line_id)
);
create table public.transaction_payments (
  transaction_id uuid not null references public.transactions(id),
  ordinal int not null, method text not null check (method in ('cash','card','eftpos','credit','debit','voucher','wallet','other')),
  amount_cents int not null check (amount_cents between 0 and 100000000),
  primary key(transaction_id,ordinal)
);

create table public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.loyalty_accounts(customer_id),
  transaction_id uuid references public.transactions(id),
  entry_type text not null check (entry_type in ('earn','refund','redeem','adjust','prize')),
  delta bigint not null check (abs(delta) <= 1000000000),
  lifetime_delta bigint not null default 0,
  balance_after bigint not null,
  operation_key text not null unique,
  reason text not null check (length(reason) between 1 and 500),
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index loyalty_ledger_customer_idx on public.loyalty_ledger(customer_id,created_at desc,id);
create index loyalty_ledger_transaction_idx on public.loyalty_ledger(transaction_id);
create index loyalty_ledger_actor_idx on public.loyalty_ledger(actor_user_id);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  reward_kind text not null default 'rewards' check (reward_kind = 'rewards'),
  reward_id text,
  title text not null, cost_points int not null check (cost_points >= 0),
  display jsonb not null default '{}',
  status text not null default 'active' check (status in ('active','redeemed','revoked')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  used_transaction_id uuid references public.transactions(id),
  foreign key(reward_kind,reward_id) references public.catalog_items(kind,id),
  check (expires_at > issued_at),
  check ((status = 'redeemed') = (used_at is not null and used_transaction_id is not null))
);
create index coupons_customer_idx on public.coupons(customer_id,issued_at desc,id);
create index coupons_reward_idx on public.coupons(reward_kind,reward_id);
create index coupons_transaction_idx on public.coupons(used_transaction_id);

create table private.idempotency_keys (
  actor_id uuid not null, operation text not null, request_id uuid not null,
  payload jsonb not null, result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_id,operation,request_id)
);
create table private.integration_events (
  integration_id uuid not null references private.pos_integrations(id),
  event_id text not null, payload_hash text not null,
  transaction_id uuid not null references public.transactions(id),
  created_at timestamptz not null default now(),
  primary key(integration_id,event_id)
);
create index integration_events_transaction_idx on private.integration_events(transaction_id);
create table private.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid, action text not null, target_id text not null,
  detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create index audit_logs_target_idx on private.audit_logs(target_id,created_at desc);
create table private.outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null, aggregate_id text not null,
  payload jsonb not null, status text not null default 'pending' check (status in ('pending','processing','delivered','failed')),
  attempts int not null default 0, available_at timestamptz not null default now(),
  created_at timestamptz not null default now(), delivered_at timestamptz,
  unique(event_type,aggregate_id)
);
create index outbox_pending_idx on private.outbox(available_at,id) where status in ('pending','failed');

create function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.staff_access where user_id = (select auth.uid()) and active and role = 'admin');
$$;
create function private.can_manage_station(p_station text) returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin() or exists (
    select 1 from private.staff_access s join private.staff_stations x on x.user_id = s.user_id
    where s.user_id = (select auth.uid()) and s.active and s.role = 'branch_manager' and x.station_id = p_station
  );
$$;
create function private.customer_id() returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.customers where auth_user_id = (select auth.uid()) and status = 'active';
$$;
create function private.require_customer() returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid := private.customer_id();
begin
  if v_id is null then raise exception 'An active customer account is required' using errcode = '42501'; end if;
  return v_id;
end;
$$;
create function private.require_admin() returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Main-admin access required' using errcode = '42501'; end if;
end;
$$;
create function private.immutable_record() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Financial and audit records are append-only; record a compensating entry'; end;
$$;
create trigger ledger_immutable before update or delete on public.loyalty_ledger for each row execute function private.immutable_record();
create trigger transactions_immutable before update or delete on public.transactions for each row execute function private.immutable_record();
create trigger items_immutable before update or delete on public.transaction_items for each row execute function private.immutable_record();
create trigger payments_immutable before update or delete on public.transaction_payments for each row execute function private.immutable_record();
create trigger audit_immutable before update or delete on private.audit_logs for each row execute function private.immutable_record();
create trigger events_immutable before update or delete on private.integration_events for each row execute function private.immutable_record();

-- Only inserting a ledger entry changes a balance. Row locks serialise mutations
-- to one account; different customers can be processed concurrently.
create function private.post_ledger() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_account public.loyalty_accounts;
begin
  select * into strict v_account from public.loyalty_accounts where customer_id = new.customer_id for update;
  if new.entry_type in ('redeem','adjust') and v_account.balance + new.delta < 0 then
    raise exception 'Insufficient points' using errcode = 'P0001';
  end if;
  -- A refund can create points debt when points have already been spent.
  -- Clamping to zero would let repeated purchase/redeem/refund cycles mint value.
  new.balance_after := v_account.balance + new.delta;
  update public.loyalty_accounts set balance = new.balance_after,
    lifetime_points = greatest(0,lifetime_points + new.lifetime_delta), version = version + 1, updated_at = now()
    where customer_id = new.customer_id;
  return new;
end;
$$;
create trigger ledger_balance before insert on public.loyalty_ledger for each row execute function private.post_ledger();

-- All public reads are explicitly granted below. No browser role gets direct
-- INSERT/UPDATE/DELETE privileges, including on its own points or roles.
do $$ declare t text; begin
  foreach t in array array['customers','loyalty_accounts','stations','catalog_items','night_deals','loyalty_programs','transactions','transaction_items','transaction_payments','loyalty_ledger','coupons'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
create policy customers_read on public.customers for select to authenticated using (id = (select private.customer_id()) or (select private.is_admin()));
create policy accounts_read on public.loyalty_accounts for select to authenticated using (customer_id = (select private.customer_id()) or (select private.is_admin()));
create policy ledger_read on public.loyalty_ledger for select to authenticated using (customer_id = (select private.customer_id()) or (select private.is_admin()));
create policy coupons_read on public.coupons for select to authenticated using (customer_id = (select private.customer_id()) or (select private.is_admin()));
create policy transactions_read on public.transactions for select to authenticated using (customer_id = (select private.customer_id()) or (select private.is_admin()));
create policy items_read on public.transaction_items for select to authenticated using (exists (select 1 from public.transactions t where t.id = transaction_id));
create policy payments_read on public.transaction_payments for select to authenticated using (exists (select 1 from public.transactions t where t.id = transaction_id));
create policy stations_read on public.stations for select to authenticated using (active or private.can_manage_station(id));
create policy catalog_read on public.catalog_items for select to authenticated using (
  (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())) or (select private.is_admin())
);
create policy programs_read on public.loyalty_programs for select to authenticated using (true);
create policy night_deals_read on public.night_deals for select to authenticated using (
  (status = 'active' and quantity_available > 0 and starts_at <= now() and sell_until > now() and safety_cutoff_at > now()
    and exists (select 1 from public.stations s where s.id = station_id and s.active)) or private.can_manage_station(station_id)
);
grant execute on function private.is_admin(), private.can_manage_station(text), private.customer_id() to authenticated;

create function private.ensure_profile(p_fields jsonb default '{}') returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_id uuid; v_metadata jsonb;
begin
  if v_user is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select raw_user_meta_data into v_metadata from auth.users where id = v_user;
  insert into public.customers(auth_user_id,first_name,last_name,mobile,dob)
    values(v_user,left(coalesce(p_fields->>'firstName',v_metadata->>'firstName',v_metadata->>'given_name',''),80),
      left(coalesce(p_fields->>'lastName',v_metadata->>'lastName',v_metadata->>'family_name',''),80),
      left(coalesce(p_fields->>'mobile',v_metadata->>'mobile',''),24),
      nullif(coalesce(p_fields->>'dob',v_metadata->>'dob'),'')::date)
    on conflict (auth_user_id) do nothing;
  select id into v_id from public.customers where auth_user_id = v_user and status = 'active';
  if v_id is null then raise exception 'This account is not active' using errcode = '42501'; end if;
  insert into public.loyalty_accounts(customer_id) values(v_id) on conflict do nothing;
  return v_id;
end;
$$;
create function public.ensure_profile(p_fields jsonb default '{}') returns uuid language sql security invoker set search_path = '' as $$ select private.ensure_profile(p_fields); $$;
grant execute on function private.ensure_profile(jsonb), public.ensure_profile(jsonb) to authenticated;

create function private.update_profile(p_fields jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid := private.require_customer();
begin
  if jsonb_typeof(p_fields) <> 'object' or exists(select 1 from jsonb_object_keys(p_fields) k where k not in ('firstName','lastName','mobile','dob','preferences')) then
    raise exception 'Unsupported profile fields';
  end if;
  update public.customers set
    first_name = coalesce(p_fields->>'firstName',first_name), last_name = coalesce(p_fields->>'lastName',last_name),
    mobile = coalesce(p_fields->>'mobile',mobile),
    dob = case when p_fields ? 'dob' then nullif(p_fields->>'dob','')::date else dob end,
    preferences = coalesce(p_fields->'preferences',preferences), updated_at = now()
    where id = v_id;
end;
$$;
create function public.update_profile(p_fields jsonb) returns void language sql security invoker set search_path = '' as $$ select private.update_profile(p_fields); $$;
grant execute on function private.update_profile(jsonb), public.update_profile(jsonb) to authenticated;

create function private.staff_session() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('uid',s.user_id,'email',u.email,'displayName',s.display_name,'admin',s.role='admin',
    'branchManager',s.role='branch_manager','role',s.role,
    'permissions',case when s.role='admin' then '["*"]'::jsonb else '["nightDeals.manage"]'::jsonb end,
    'stationIds',case when s.role='admin' then '["*"]'::jsonb else coalesce((select jsonb_agg(station_id) from private.staff_stations where user_id=s.user_id),'[]') end)
  from private.staff_access s join auth.users u on u.id=s.user_id where s.user_id=(select auth.uid()) and s.active;
$$;
create function public.staff_session() returns jsonb language sql security invoker set search_path = '' as $$ select private.staff_session(); $$;
grant execute on function private.staff_session(), public.staff_session() to authenticated;

create function private.manage_staff(p_input jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_station text;
begin
  perform private.require_admin();
  select id into v_user from auth.users where lower(email) = lower(trim(p_input->>'email')) and email_confirmed_at is not null;
  if v_user is null then raise exception 'The manager must sign up and confirm their email before access can be granted'; end if;
  if exists(select 1 from private.staff_access where user_id=v_user and role='admin') then raise exception 'Main-admin accounts cannot be changed through the branch-access screen'; end if;
  if coalesce((p_input->>'enabled')::boolean,true) and jsonb_array_length(coalesce(p_input->'stationIds','[]')) not between 1 and 50 then
    raise exception 'Assign between 1 and 50 stations';
  end if;
  insert into private.staff_access(user_id,role,display_name,active) values(v_user,'branch_manager',coalesce(p_input->>'displayName',''),coalesce((p_input->>'enabled')::boolean,true))
    on conflict(user_id) do update set display_name=excluded.display_name,active=excluded.active,updated_at=now();
  delete from private.staff_stations where user_id=v_user;
  if coalesce((p_input->>'enabled')::boolean,true) then
    for v_station in select jsonb_array_elements_text(p_input->'stationIds') loop
      insert into private.staff_stations values(v_user,v_station) on conflict do nothing;
    end loop;
  end if;
  insert into private.audit_logs(actor_user_id,action,target_id,detail) values(auth.uid(),'staff.access',v_user::text,jsonb_build_object('enabled',p_input->'enabled','stations',p_input->'stationIds'));
  return jsonb_build_object('ok',true);
end;
$$;
create function public.manage_staff(p_input jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select private.manage_staff(p_input); $$;
create function private.list_staff() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id',s.user_id,'uid',s.user_id,'email',u.email,'displayName',s.display_name,'active',s.active,'role',s.role,
    'stationIds',coalesce((select jsonb_agg(station_id) from private.staff_stations where user_id=s.user_id),'[]')) order by s.user_id)
    from private.staff_access s join auth.users u on u.id=s.user_id where role='branch_manager'),'[]');
end;
$$;
create function public.list_staff() returns jsonb language sql security invoker set search_path = '' as $$ select private.list_staff(); $$;
grant execute on function private.manage_staff(jsonb), public.manage_staff(jsonb), private.list_staff(), public.list_staff() to authenticated;

create function private.redeem_reward(p_reward_id text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_customer uuid := private.require_customer(); v_reward public.catalog_items; v_coupon public.coupons; v_prior private.idempotency_keys; v_result jsonb;
begin
  if p_request_id is null then raise exception 'A request ID is required'; end if;
  perform 1 from public.loyalty_accounts where customer_id=v_customer for update;
  select * into v_prior from private.idempotency_keys where actor_id=auth.uid() and operation='redeem' and request_id=p_request_id;
  if found then
    if v_prior.payload <> jsonb_build_object('rewardId',p_reward_id) then raise exception 'Idempotency key reused with different input' using errcode='23505'; end if;
    return v_prior.result;
  end if;
  select * into v_reward from public.catalog_items where kind='rewards' and id=p_reward_id and active
    and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now()) for share;
  if not found then raise exception 'Reward is no longer available'; end if;
  insert into public.loyalty_ledger(customer_id,entry_type,delta,balance_after,operation_key,reason,actor_user_id)
    values(v_customer,'redeem',-v_reward.points_cost,0,'redeem:'||auth.uid()||':'||p_request_id,'Reward: '||v_reward.title,auth.uid());
  insert into public.coupons(customer_id,reward_id,title,cost_points,display)
    values(v_customer,v_reward.id,v_reward.title,v_reward.points_cost,v_reward.data) returning * into v_coupon;
  v_result := jsonb_build_object('ok',true,'coupon',to_jsonb(v_coupon));
  insert into private.idempotency_keys values(auth.uid(),'redeem',p_request_id,jsonb_build_object('rewardId',p_reward_id),v_result,now());
  insert into private.audit_logs(actor_user_id,action,target_id,detail) values(auth.uid(),'reward.redeem',v_coupon.id::text,jsonb_build_object('customerId',v_customer,'points',v_reward.points_cost));
  insert into private.outbox(event_type,aggregate_id,payload) values('coupon.issued',v_coupon.id::text,jsonb_build_object('customerId',v_customer,'couponId',v_coupon.id));
  return v_result;
end;
$$;
create function public.redeem_reward(p_reward_id text,p_request_id uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.redeem_reward(p_reward_id,p_request_id); $$;
grant execute on function private.redeem_reward(text,uuid), public.redeem_reward(text,uuid) to authenticated;

create function private.adjust_points(p_customer_id uuid,p_delta bigint,p_reason text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_prior private.idempotency_keys; v_payload jsonb := jsonb_build_object('customerId',p_customer_id,'delta',p_delta,'reason',p_reason); v_entry public.loyalty_ledger; v_result jsonb;
begin
  perform private.require_admin();
  if p_request_id is null or p_delta is null or p_delta=0 or abs(p_delta)>1000000 or length(trim(p_reason)) not between 5 and 500 or p_reason is null then raise exception 'Provide a nonzero whole-point adjustment (up to 1,000,000) and a reason of 5–500 characters'; end if;
  -- Actor-scoped advisory lock protects request keys even when target changes.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request_id::text,0));
  select * into v_prior from private.idempotency_keys where actor_id=auth.uid() and operation='adjust' and request_id=p_request_id;
  if found then
    if v_prior.payload <> v_payload then raise exception 'Idempotency key reused with different input' using errcode='23505'; end if;
    return v_prior.result;
  end if;
  insert into public.loyalty_ledger(customer_id,entry_type,delta,balance_after,operation_key,reason,actor_user_id)
    values(p_customer_id,'adjust',p_delta,0,'adjust:'||auth.uid()||':'||p_request_id,p_reason,auth.uid()) returning * into v_entry;
  v_result := jsonb_build_object('ok',true,'points',v_entry.balance_after);
  insert into private.idempotency_keys values(auth.uid(),'adjust',p_request_id,v_payload,v_result,now());
  insert into private.audit_logs(actor_user_id,action,target_id,detail) values(auth.uid(),'points.adjust',p_customer_id::text,jsonb_build_object('delta',p_delta,'reason',p_reason,'ledgerId',v_entry.id));
  return v_result;
end;
$$;
create function public.adjust_points(p_customer_id uuid,p_delta bigint,p_reason text,p_request_id uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.adjust_points(p_customer_id,p_delta,p_reason,p_request_id); $$;
grant execute on function private.adjust_points(uuid,bigint,text,uuid), public.adjust_points(uuid,bigint,text,uuid) to authenticated;

-- Explicit service-role grants are required by newer Supabase projects too.
grant all on all tables in schema public to service_role;
grant all on all tables in schema private to service_role;
grant usage,select on all sequences in schema public, private to service_role;
-- No anonymous RPC or table access. Functions added below follow the same rule.
revoke execute on all functions in schema private from public,anon;
revoke execute on all functions in schema public from public,anon;

-- Realtime is only a refresh signal; RLS and database time remain authoritative.
do $$ declare t text; begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['customers','loyalty_accounts','catalog_items','stations','night_deals','coupons','transactions'] loop
      execute format('alter publication supabase_realtime add table public.%I',t);
    end loop;
  end if;
end $$;
